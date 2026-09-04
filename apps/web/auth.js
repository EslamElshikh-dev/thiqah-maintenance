const apiBase = document.querySelector('meta[name="api-base"]')?.content.replace(/\/$/, '') || '';
const loginForm = document.querySelector('#login-form');
const registerForm = document.querySelector('#register-form');
const message = document.querySelector('#auth-message');
let registration = null;

async function request(path, body) {
  const response = await fetch(`${apiBase}${path}`, { method: 'POST', credentials: 'include', headers: { Accept: 'application/json', 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await response.json().catch(() => ({ ok: false }));
  if (!response.ok || data.ok === false) { const error = new Error(data.message || 'تعذّر الاتصال'); error.code = data.error; throw error; }
  return data;
}

function show(text = '', type = '') { message.textContent = text; message.className = `form-message${type ? ` is-${type}` : ''}`; }
function values(form) { return Object.fromEntries([...new FormData(form)].map(([key, value]) => [key, String(value).trim()])); }
function busy(form, on) { const button = form.querySelector('button'); button.disabled = on; button.dataset.label ||= button.textContent; button.textContent = on ? 'جارٍ التحقق…' : button.dataset.label; }

document.querySelectorAll('[data-auth-tab]').forEach((tab) => tab.addEventListener('click', () => {
  const register = tab.dataset.authTab === 'register';
  document.querySelectorAll('[data-auth-tab]').forEach((item) => item.classList.toggle('is-active', item === tab));
  loginForm.hidden = register; registerForm.hidden = !register;
  document.querySelector('#auth-title').textContent = register ? 'إنشاء حساب جديد' : 'تسجيل الدخول';
  document.querySelector('#auth-subtitle').textContent = register ? 'سجّل بياناتك ثم تحقق من رقم الجوال.' : 'أدخل بيانات حسابك لمتابعة طلباتك.';
  show();
}));

loginForm.addEventListener('submit', async (event) => {
  event.preventDefault(); show(); busy(loginForm, true);
  try { await request('/v1/auth/customer/login', { ...values(loginForm), clientType: 'web' }); window.location.assign('/'); }
  catch { show('بيانات الدخول غير صحيحة أو الخدمة غير متاحة الآن.', 'error'); }
  finally { busy(loginForm, false); }
});

registerForm.addEventListener('submit', async (event) => {
  event.preventDefault(); show(); busy(registerForm, true);
  try {
    if (!registration) {
      const payload = values(registerForm);
      const result = await request('/v1/auth/customer/register/start', payload);
      registration = { challengeId: result.challengeId, phone: payload.phone };
      registerForm.innerHTML = `<label>رمز التحقق<input name="otp" inputmode="numeric" autocomplete="one-time-code" maxlength="8" required></label><button class="button button--primary button--large" type="submit">تأكيد الحساب</button>`;
      show('تم إرسال رمز التحقق إلى جوالك.', 'success');
    } else {
      const otp = values(registerForm).otp;
      await request('/v1/auth/customer/register/verify', { ...registration, otp, clientType: 'web' });
      window.location.assign('/');
    }
  } catch (error) {
    const known = { PHONE_ALREADY_REGISTERED: 'رقم الجوال مسجل مسبقًا.', INVALID_PHONE: 'أدخل رقم جوال سعودي صحيحًا.', WEAK_PASSWORD: 'استخدم كلمة مرور أقوى.', INVALID_OTP: 'رمز التحقق غير صحيح أو منتهي.' };
    show(known[error.code] || 'تعذّر إكمال التسجيل الآن.', 'error');
  } finally { busy(registerForm, false); }
});
