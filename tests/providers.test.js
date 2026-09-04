import test from 'node:test';
import assert from 'node:assert/strict';
import { createSmsProvider } from '../apps/api/src/services/sms.js';
import { createEmailProvider } from '../apps/api/src/services/email.js';

test('Unifonic OTP provider uses international Saudi number and registered sender', async () => {
  const originalFetch = global.fetch;
  try {
    global.fetch = async (url, options) => {
      assert.equal(url, 'https://el.cloud.unifonic.com/rest/SMS/messages');
      const body = new URLSearchParams(options.body);
      assert.equal(body.get('AppSid'), 'test-app-sid');
      assert.equal(body.get('SenderID'), 'THIQAH');
      assert.equal(body.get('Recipient'), '966501234567');
      assert.match(body.get('Body'), /123456/);
      return new Response(JSON.stringify({ success: 'true', errorCode: 'ER-00' }), { status: 200 });
    };
    const sms = createSmsProvider({ otpProvider: 'unifonic', unifonicAppSid: 'test-app-sid', smsSenderId: 'THIQAH' });
    await sms.sendOtp({ phone: '0501234567', code: '123456', purpose: 'login' });
  } finally {
    global.fetch = originalFetch;
  }
});

test('Unifonic provider rejects provider-level failure on HTTP 200', async () => {
  const originalFetch = global.fetch;
  try {
    global.fetch = async () => new Response(JSON.stringify({ success: 'false', errorCode: 'ER-480' }), { status: 200 });
    const sms = createSmsProvider({ otpProvider: 'unifonic', unifonicAppSid: 'test-app-sid', smsSenderId: 'THIQAH' });
    await assert.rejects(sms.sendOtp({ phone: '0501234567', code: '123456', purpose: 'login' }), /Unifonic SMS delivery request failed/);
  } finally {
    global.fetch = originalFetch;
  }
});

test('Resend provider hashes password-reset idempotency key', async () => {
  const originalFetch = global.fetch;
  const token = 'secret-reset-token';
  try {
    global.fetch = async (url, options) => {
      assert.equal(url, 'https://api.resend.com/emails');
      assert.equal(options.headers.Authorization, 'Bearer re_test');
      assert.equal(options.headers['User-Agent'], 'thiqah-maintenance/1.0');
      assert.ok(options.headers['Idempotency-Key'].startsWith('password-reset/'));
      assert.ok(!options.headers['Idempotency-Key'].includes(token));
      const body = JSON.parse(options.body);
      assert.equal(body.from, 'ثقة <support@example.com>');
      assert.match(body.text, /reset-password\.html#role=customer&token=secret-reset-token/);
      return new Response(JSON.stringify({ id: 'email-id' }), { status: 200 });
    };
    const email = createEmailProvider({ emailProvider: 'resend', resendApiKey: 're_test', supportFromEmail: 'support@example.com', publicAppOrigin: 'https://staging.example.com' });
    await email.sendPasswordReset({ email: 'user@example.com', role: 'customer', token });
  } finally {
    global.fetch = originalFetch;
  }
});
