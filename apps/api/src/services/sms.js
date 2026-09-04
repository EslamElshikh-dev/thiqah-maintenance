import { setTimeout as delay } from 'node:timers/promises';

async function postJson(url, token, payload) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);
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
    if (!response.ok) throw new Error(`SMS provider returned HTTP ${response.status}`);
  } finally {
    clearTimeout(timeout);
  }
}

export function createSmsProvider(config) {
  return {
    async sendOtp({ phone, code, purpose }) {
      if (config.otpProvider === 'log') return;
      if (config.otpProvider === 'webhook') {
        await postJson(config.smsWebhookUrl, config.smsWebhookBearerToken, {
          type: 'otp',
          phone,
          code,
          purpose,
          senderId: config.smsSenderId
        });
        return;
      }
      await delay(0);
      throw new Error(`OTP provider '${config.otpProvider}' is not implemented`);
    }
  };
}
