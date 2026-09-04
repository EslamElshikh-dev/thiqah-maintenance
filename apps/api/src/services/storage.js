import { createHash } from 'node:crypto';
import { Storage } from '@google-cloud/storage';
import { newUploadObjectKey } from './orders.js';
import { badRequest, forbidden, notFound } from '../lib/http.js';

const MIME_EXT = Object.freeze({
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'application/pdf': 'pdf'
});

const ACTOR_KINDS = Object.freeze({
  customer: new Set(['customer_problem']),
  technician: new Set(['before_work', 'after_work']),
  admin: new Set(['invoice_attachment', 'warranty_attachment'])
});

const IMAGE_KINDS = new Set(['customer_problem', 'before_work', 'after_work']);
const CUSTOMER_UPLOAD_STATUSES = new Set(['new','triage','quoted','customer_approved','assigned','technician_accepted','on_the_way','in_progress']);
const TECH_UPLOAD_STATUSES = Object.freeze({
  before_work: new Set(['assigned','technician_accepted','on_the_way','in_progress']),
  after_work: new Set(['in_progress','awaiting_customer_confirmation'])
});

function detectMime(header) {
  if (header.length >= 3 && header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff) return 'image/jpeg';
  if (header.length >= 8 && header.subarray(0, 8).equals(Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]))) return 'image/png';
  if (header.length >= 12 && header.subarray(0, 4).toString('ascii') === 'RIFF' && header.subarray(8, 12).toString('ascii') === 'WEBP') return 'image/webp';
  if (header.length >= 5 && header.subarray(0, 5).toString('ascii') === '%PDF-') return 'application/pdf';
  return null;
}

async function inspectObject(file, maxSizeBytes) {
  const hash = createHash('sha256');
  const headerChunks = [];
  let headerBytes = 0;
  let sizeBytes = 0;

  await new Promise((resolve, reject) => {
    const stream = file.createReadStream();
    stream.on('data', (chunk) => {
      sizeBytes += chunk.length;
      if (sizeBytes > maxSizeBytes) {
        stream.destroy(new Error('FILE_TOO_LARGE'));
        return;
      }
      hash.update(chunk);
      if (headerBytes < 16) {
        const needed = 16 - headerBytes;
        const slice = chunk.subarray(0, needed);
        headerChunks.push(slice);
        headerBytes += slice.length;
      }
    });
    stream.once('error', reject);
    stream.once('end', resolve);
  });

  return {
    sizeBytes,
    mimeType: detectMime(Buffer.concat(headerChunks)),
    sha256Hex: hash.digest('hex')
  };
}

async function deleteRejectedObject(file) {
  try {
    await file.delete({ ignoreNotFound: true });
  } catch {
    // Validation failure remains the primary error. Lifecycle rules and audit
    // monitoring should surface any object that could not be deleted here.
  }
}

function assertKindAllowed(actorType, kind, mimeType) {
  const allowedKinds = ACTOR_KINDS[actorType];
  if (!allowedKinds?.has(kind)) throw forbidden('Upload kind is not allowed for this account');
  if (IMAGE_KINDS.has(kind) && !mimeType.startsWith('image/')) {
    throw badRequest('UNSUPPORTED_MEDIA_TYPE', 'This upload kind accepts images only');
  }
}


function assertUploadStatus(actorType, kind, status) {
  if (actorType === 'customer' && !CUSTOMER_UPLOAD_STATUSES.has(status)) {
    throw badRequest('ORDER_NOT_ACCEPTING_UPLOADS', 'This order is no longer accepting customer uploads');
  }
  if (actorType === 'technician' && !TECH_UPLOAD_STATUSES[kind]?.has(status)) {
    throw badRequest('ORDER_NOT_ACCEPTING_UPLOADS', 'This upload is not allowed at the current order status');
  }
}

export function createStorageService(config) {
  const storage = new Storage({ projectId: config.gcpProjectId });
  const bucket = storage.bucket(config.gcsBucket);
  return {
    async createUploadIntent({ db, actor, orderId, kind, mimeType, sizeBytes }) {
      const ext = MIME_EXT[mimeType];
      if (!ext) throw badRequest('UNSUPPORTED_MEDIA_TYPE', 'Unsupported media type');
      assertKindAllowed(actor.actor_type, kind, mimeType);

      const max = kind === 'invoice_attachment' || kind === 'warranty_attachment' ? 15 * 1024 * 1024 : 8 * 1024 * 1024;
      if (!Number.isInteger(sizeBytes) || sizeBytes <= 0 || sizeBytes > max) throw badRequest('INVALID_FILE_SIZE', 'Invalid file size');

      const access = await db.query(`SELECT customer_id,status FROM thiqah.orders WHERE id=$1`, [orderId]);
      if (!access.rows[0]) throw notFound('Order not found');
      assertUploadStatus(actor.actor_type, kind, access.rows[0].status);
      if (actor.actor_type === 'customer' && access.rows[0].customer_id !== actor.actor_id) throw forbidden();
      if (actor.actor_type === 'technician') {
        const assigned = await db.query(
          `SELECT 1 FROM thiqah.order_assignments WHERE order_id=$1 AND technician_id=$2 AND ended_at IS NULL`,
          [orderId, actor.actor_id]
        );
        if (!assigned.rows[0]) throw forbidden();
      }

      const objectKey = newUploadObjectKey(orderId, kind, ext);
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
      const intent = await db.query(
        `INSERT INTO thiqah.media_upload_intents
          (order_id,object_key,mime_type,max_size_bytes,created_by_type,created_by_id,expires_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
        [orderId, objectKey, mimeType, max, actor.actor_type, actor.actor_id, expiresAt]
      );

      const requiredHeaders = Object.freeze({
        'content-type': mimeType,
        'x-goog-if-generation-match': '0'
      });
      const [url] = await bucket.file(objectKey).getSignedUrl({
        version: 'v4',
        action: 'write',
        expires: expiresAt,
        contentType: mimeType,
        extensionHeaders: { 'x-goog-if-generation-match': '0' }
      });

      return {
        intentId: intent.rows[0].id,
        objectKey,
        uploadUrl: url,
        requiredHeaders,
        expiresAt,
        maxSizeBytes: max
      };
    },

    async createReadUrl({ db, actor, orderId, mediaId }) {
      const selected = await db.query(
        `SELECT m.id,m.order_id,m.kind,m.object_key,m.mime_type,m.size_bytes,o.customer_id
           FROM thiqah.media m
           JOIN thiqah.orders o ON o.id=m.order_id
          WHERE m.id=$1 AND m.order_id=$2 AND m.deleted_at IS NULL
          LIMIT 1`,
        [mediaId, orderId]
      );
      const media = selected.rows[0];
      if (!media) throw notFound('Media not found');
      if (actor.actor_type === 'customer' && media.customer_id !== actor.actor_id) throw forbidden();
      if (actor.actor_type === 'technician') {
        const assigned = await db.query(
          `SELECT 1 FROM thiqah.order_assignments
            WHERE order_id=$1 AND technician_id=$2 AND ended_at IS NULL`,
          [orderId, actor.actor_id]
        );
        if (!assigned.rows[0]) throw forbidden();
      }

      const extension = MIME_EXT[media.mime_type] || 'bin';
      const disposition = media.mime_type.startsWith('image/') ? 'inline' : `attachment; filename="${media.id}.${extension}"`;
      const expiresAt = new Date(Date.now() + 5 * 60 * 1000);
      const [url] = await bucket.file(media.object_key).getSignedUrl({
        version: 'v4',
        action: 'read',
        expires: expiresAt,
        queryParams: {
          'response-content-type': media.mime_type,
          'response-content-disposition': disposition
        }
      });
      return {
        media: { id: media.id, kind: media.kind, mimeType: media.mime_type, sizeBytes: Number(media.size_bytes) },
        readUrl: url,
        expiresAt
      };
    },

    async completeUpload({ db, actor, intentId, sha256Hex }) {
      return db.tx(async (client) => {
        const selected = await client.query(`SELECT * FROM thiqah.media_upload_intents WHERE id=$1 FOR UPDATE`, [intentId]);
        const intent = selected.rows[0];
        if (!intent || intent.completed_at || new Date(intent.expires_at) <= new Date()) {
          throw badRequest('UPLOAD_INTENT_INVALID', 'Upload intent is invalid or expired');
        }
        if (intent.created_by_type !== actor.actor_type || intent.created_by_id !== actor.actor_id) throw forbidden();
        if (!/^[0-9a-f]{64}$/.test(sha256Hex || '')) throw badRequest('INVALID_SHA256', 'SHA-256 checksum is required');

        const file = bucket.file(intent.object_key);
        let inspected;
        try {
          const [metadata] = await file.getMetadata();
          const metadataSize = Number(metadata.size || 0);
          if (!metadataSize || metadataSize > Number(intent.max_size_bytes)) {
            throw new Error('FILE_TOO_LARGE');
          }
          inspected = await inspectObject(file, Number(intent.max_size_bytes));
        } catch (error) {
          if (error?.code === 404) throw badRequest('UPLOAD_NOT_FOUND', 'Uploaded object was not found');
          await deleteRejectedObject(file);
          throw badRequest('UPLOAD_VALIDATION_FAILED', 'Uploaded file failed server-side validation');
        }

        if (
          !inspected.sizeBytes ||
          inspected.sizeBytes > Number(intent.max_size_bytes) ||
          inspected.mimeType !== intent.mime_type ||
          inspected.sha256Hex !== sha256Hex
        ) {
          await deleteRejectedObject(file);
          throw badRequest('UPLOAD_VALIDATION_FAILED', 'Uploaded file does not match the upload intent');
        }

        const kind = intent.object_key.split('/')[2];
        assertKindAllowed(actor.actor_type, kind, inspected.mimeType);
        const media = await client.query(
          `INSERT INTO thiqah.media (order_id,kind,object_key,mime_type,size_bytes,sha256_hex,created_by_type,created_by_id)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id,kind,mime_type,size_bytes,created_at`,
          [intent.order_id, kind, intent.object_key, inspected.mimeType, inspected.sizeBytes, inspected.sha256Hex, actor.actor_type, actor.actor_id]
        );
        await client.query(`UPDATE thiqah.media_upload_intents SET completed_at=now() WHERE id=$1`, [intent.id]);
        return media.rows[0];
      });
    }
  };
}
