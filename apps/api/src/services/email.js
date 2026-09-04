import { createHash } from 'node:crypto';

function withTimeout(ms = 8_000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ms);
  return { controller, clear: () => clearTimeout(timeout) };
}

async function postWebhook(url, token, payload) {
  const { controller, clear } = withTimeout();
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      },
      body: JSON.stringify(payload),
      signal: controller.signal
    });
    if (!response.ok) throw new Error(`Email webhook returned HTTP ${response.status}`);
  } finally {
    clear();
  }
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function resetUrl(config, role, token) {
  return `${config.publicAppOrigin}/reset-password.html#role=${encodeURIComponent(role)}&token=${encodeURIComponent(token)}`;
}

function idempotencyKey({ email, role, token }) {
  const digest = createHash('sha256').update(`${email}:${role}:${token}`).digest('hex');
  return `password-reset/${digest}`;
}

async function sendWithResend(config, { email, role, token }) {
  const url = resetUrl(config, role, token);
  const { controller, clear } = withTimeout();
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.resendApiKey}`,
        'Content-Type': 'application/json',
        'User-Agent': 'thiqah-maintenance/1.0',
        'Idempotency-Key': idempotencyKey({ email, role, token })
      },
      body: JSON.stringify({
        from: `ثقة <${config.supportFromEmail}>`,
        to: [email],
        subject: 'إعادة تعيين كلمة المرور | ثقة',
        text: `طلبت إعادة تعيين كلمة المرور لحسابك في ثقة. افتح الرابط التالي لإكمال العملية:\n\n${url}\n\nإذا لم تطلب ذلك فتجاهل الرسالة.`,
        html: `<div dir="rtl" lang="ar"><p>طلبت إعادة تعيين كلمة المرور لحسابك في ثقة.</p><p><a href="${escapeHtml(url)}">إعادة تعيين كلمة المرور</a></p><p>إذا لم تطلب ذلك فتجاهل الرسالة.</p></div>`,
        tags: [{ name: 'message_type', value: 'password_reset' }, { name: 'role', value: String(role) }]
      }),
      signal: controller.signal
    });
    if (!response.ok) throw new Error(`Resend email request failed (${response.status})`);
  } finally {
    clear();
  }
}

export function createEmailProvider(config) {
  return {
    async sendPasswordReset({ email, role, token }) {
      const url = resetUrl(config, role, token);

      if (config.emailProvider === 'log') {
        console.log(`[DEV PASSWORD RESET] ${email} ${url}`);
        return;
      }

      if (config.emailProvider === 'resend') {
        await sendWithResend(config, { email, role, token });
        return;
      }

      if (config.emailProvider === 'webhook') {
        await postWebhook(config.emailWebhookUrl, config.emailWebhookBearerToken, {
          type: 'password_reset',
          to: email,
          from: config.supportFromEmail,
          role,
          resetUrl: url
        });
        return;
      }

      throw new Error(`Email provider '${config.emailProvider}' is not implemented`);
    }
  };
}
