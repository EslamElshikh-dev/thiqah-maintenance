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
    if (!response.ok) throw new Error(`SMS webhook returned HTTP ${response.status}`);
  } finally {
    clear();
  }
}

function toUnifonicRecipient(phone) {
  const value = String(phone || '');
  if (!/^05\d{8}$/.test(value)) throw new Error('SMS recipient must be a normalized Saudi mobile number');
  return `966${value.slice(1)}`;
}

function unifonicOtpBody(code) {
  return `رمز التحقق في ثقة: ${code}\nصالح لمدة 5 دقائق. لا تشارك الرمز مع أي شخص.`;
}

async function sendWithUnifonic(config, { phone, code, purpose }) {
  const { controller, clear } = withTimeout();
  const body = new URLSearchParams({
    AppSid: config.unifonicAppSid,
    SenderID: config.smsSenderId,
    Recipient: toUnifonicRecipient(phone),
    Body: unifonicOtpBody(code),
    responseType: 'JSON',
    CorrelationID: `otp-${purpose}-${Date.now()}`,
    async: 'false'
  });

  try {
    const response = await fetch('https://el.cloud.unifonic.com/rest/SMS/messages', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'thiqah-maintenance/1.0'
      },
      body,
      signal: controller.signal
    });

    const text = await response.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = null; }

    const providerRejected = data && (
      String(data.success ?? '').toLowerCase() === 'false' ||
      (data.errorCode && data.errorCode !== 'ER-00') ||
      (data.Error != null && String(data.Error) !== '0')
    );

    if (!response.ok || providerRejected) {
      throw new Error(`Unifonic SMS delivery request failed (${response.status})`);
    }
  } finally {
    clear();
  }
}

export function createSmsProvider(config) {
  return {
    async sendOtp({ phone, code, purpose }) {
      if (config.otpProvider === 'log') return;

      if (config.otpProvider === 'unifonic') {
        await sendWithUnifonic(config, { phone, code, purpose });
        return;
      }

      if (config.otpProvider === 'webhook') {
        await postWebhook(config.smsWebhookUrl, config.smsWebhookBearerToken, {
          type: 'otp',
          phone,
          code,
          purpose,
          senderId: config.smsSenderId
        });
        return;
      }

      throw new Error(`OTP provider '${config.otpProvider}' is not implemented`);
    }
  };
}
