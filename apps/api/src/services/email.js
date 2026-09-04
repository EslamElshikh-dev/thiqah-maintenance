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
    if (!response.ok) throw new Error(`Email provider returned HTTP ${response.status}`);
  } finally {
    clearTimeout(timeout);
  }
}

export function createEmailProvider(config) {
  return {
    async sendPasswordReset({ email, role, token }) {
      const url = `${config.publicAppOrigin}/reset-password.html#role=${encodeURIComponent(role)}&token=${encodeURIComponent(token)}`;
      if (config.emailProvider === 'log') {
        console.log(`[DEV PASSWORD RESET] ${email} ${url}`);
        return;
      }
      if (config.emailProvider === 'webhook') {
        await postJson(config.emailWebhookUrl, config.emailWebhookBearerToken, {
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
