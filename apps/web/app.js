const apiBase = document.querySelector('meta[name="api-base"]')?.content.replace(/\/$/, '') || '';
const state = { settings: null, challengeId: null, phone: null, idempotencyKey: null, catalogSource: 'api' };

const fallbackCatalog = {
  services: [
    ['plumbing', 'السباكة وكشف التسربات'], ['electrical', 'الكهرباء والإنارة'], ['ac', 'التكييف والتبريد'],
    ['general', 'الصيانة المنزلية العامة'], ['buildings', 'صيانة الشقق والمباني'], ['appliances', 'صيانة الأجهزة المنزلية'],
    ['carpentry', 'النجارة والأبواب'], ['painting', 'الدهانات والترميم'], ['cctv', 'الكاميرات والأنظمة الذكية']
  ].map(([code, name_ar]) => ({ id: `catalog:${code}`, code, name_ar })),
  serviceAreas: [
    'الياسمين','الملقا','النرجس','العقيق','الصحافة','الروضة','الربوة','قرطبة','غرناطة','اشبيلية',
    'حطين','القيروان','السليمانية','الورود','النخيل','الرائد','المحمدية','الرحمانية','المروج','التعاون',
    'الازدهار','الوادي','الفلاح','الندى','العارض','العليا','الملز','المربع','الشفا','العزيزية',
    'السويدي','لبن','ظهرة لبن','طويق','المونسية','الرمال','الخليج','اليرموك','النسيم','النهضة',
    'الجزيرة','الفيحاء','المصيف','بدر'
  ].map((name_ar, index) => ({ id: `catalog:riyadh:${index}`, name_ar, city: 'الرياض' }))
};

const sheet = document.querySelector('#order-sheet');
const orderForm = document.querySelector('#order-form');
const orderMessage = document.querySelector('#order-message');
const orderSubmit = document.querySelector('#order-submit');
const serviceSelect = document.querySelector('#order-service');
const areaSelect = document.querySelector('#order-area');

async function request(path, options = {}) {
  const { headers = {}, ...requestOptions } = options;
  const response = await fetch(`${apiBase}${path}`, {
    ...requestOptions,
    credentials: 'include',
    headers: { Accept: 'application/json', ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...headers }
  });
  const data = await response.json().catch(() => ({ ok: false, message: 'استجابة غير صالحة من الخادم' }));
  if (!response.ok || data.ok === false) {
    const error = new Error(data.message || 'تعذّر تنفيذ الطلب');
    error.code = data.error;
    throw error;
  }
  return data;
}

function setMessage(element, text = '', type = '') {
  element.textContent = text;
  element.className = `form-message${type ? ` is-${type}` : ''}`;
}

function option(value, label) {
  const node = document.createElement('option');
  node.value = value;
  node.textContent = label;
  return node;
}

function validCatalog(value) {
  return value && Array.isArray(value.services) && value.services.length && Array.isArray(value.serviceAreas) && value.serviceAreas.length;
}

function renderCatalog(catalog, source) {
  const selectedService = serviceSelect.value;
  const selectedArea = areaSelect.value;
  state.settings = catalog;
  state.catalogSource = source;
  serviceSelect.replaceChildren(option('', 'اختر نوع الخدمة'));
  areaSelect.replaceChildren(option('', 'اختر الحي داخل الرياض'));
  catalog.services.forEach((item) => serviceSelect.append(option(item.id, item.name_ar)));
  catalog.serviceAreas.forEach((item) => areaSelect.append(option(item.id, `${item.name_ar} — ${item.city}`)));
  if ([...serviceSelect.options].some((item) => item.value === selectedService)) serviceSelect.value = selectedService;
  if ([...areaSelect.options].some((item) => item.value === selectedArea)) areaSelect.value = selectedArea;
  orderSubmit.disabled = false;
}

function readCachedCatalog() {
  try {
    const cached = JSON.parse(localStorage.getItem('thiqah:catalog') || 'null');
    if (!cached || Date.now() - cached.savedAt > 86_400_000 || !validCatalog(cached.data)) return null;
    return cached.data;
  } catch { return null; }
}

async function loadSettings() {
  const cached = readCachedCatalog();
  renderCatalog(cached || fallbackCatalog, cached ? 'cache' : 'fallback');
  try {
    const data = await request('/v1/settings');
    if (!validCatalog(data)) throw new Error('INVALID_CATALOG');
    renderCatalog(data, 'api');
    localStorage.setItem('thiqah:catalog', JSON.stringify({ savedAt: Date.now(), data }));
    return true;
  } catch {
    return false;
  }
}

function selectRequestedService(trigger) {
  const code = trigger.closest('[data-service-code]')?.dataset.serviceCode;
  if (!code || !state.settings) return;
  const service = state.settings.services.find((item) => item.code === code);
  if (service) serviceSelect.value = service.id;
}

function openSheet(trigger) {
  selectRequestedService(trigger);
  sheet.classList.add('is-open');
  sheet.setAttribute('aria-hidden', 'false');
  document.body.classList.add('is-locked');
  setTimeout(() => serviceSelect.focus(), 200);
}

function closeSheet() {
  sheet.classList.remove('is-open');
  sheet.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('is-locked');
}

document.querySelectorAll('[data-order-open]').forEach((button) => button.addEventListener('click', () => openSheet(button)));
document.querySelectorAll('[data-order-close]').forEach((button) => button.addEventListener('click', closeSheet));
document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && sheet.classList.contains('is-open')) closeSheet(); });

function formPayload(form) {
  const values = Object.fromEntries(new FormData(form));
  return Object.fromEntries(Object.entries(values).map(([key, value]) => [key, typeof value === 'string' ? value.trim() : value]));
}

function showOtpStage() {
  const panel = orderForm.querySelector('.form-grid');
  panel.innerHTML = `
    <div class="otp-stage span-2">
      <span class="service-glyph service-glyph--general"><svg viewBox="0 0 24 24"><path d="M7 10V8a5 5 0 0 1 10 0v2M5 10h14v11H5z"/></svg></span>
      <h3>تحقق من رقم الجوال</h3>
      <p>أرسلنا رمز تحقق إلى <b dir="ltr">${state.phone}</b>. أدخله لإنشاء الطلب بأمان.</p>
      <label>رمز التحقق<input id="order-otp" name="otp" inputmode="numeric" autocomplete="one-time-code" maxlength="8" required></label>
    </div>`;
  orderSubmit.textContent = 'تأكيد وإنشاء الطلب';
  document.querySelectorAll('.sheet__progress span')[1].classList.add('is-active');
  document.querySelector('#order-otp').focus();
}

function showOrderSuccess(order) {
  const token = order.trackingToken || '';
  sessionStorage.setItem('thiqah:last-order', JSON.stringify({ orderNumber: order.orderNumber, trackingToken: token }));
  orderForm.innerHTML = `
    <div class="order-success">
      <span><svg viewBox="0 0 24 24"><path d="m5 12 4 4L19 6"/></svg></span>
      <h3>تم إنشاء طلبك بنجاح</h3>
      <p>احتفظ برقم الطلب ورمز التتبع في مكان آمن.</p>
      <div><small>رقم الطلب</small><strong dir="ltr">${order.orderNumber}</strong></div>
      ${token ? `<div><small>رمز التتبع السري</small><strong class="token-value" dir="ltr">${token}</strong></div>` : ''}
      <button class="button button--primary button--large" type="button" id="success-track">متابعة الطلب</button>
    </div>`;
  document.querySelectorAll('.sheet__progress span').forEach((item) => item.classList.add('is-active'));
  document.querySelector('#success-track').addEventListener('click', () => {
    document.querySelector('#track-number').value = order.orderNumber;
    document.querySelector('#track-token').value = token;
    closeSheet();
    document.querySelector('#track').scrollIntoView({ behavior: 'smooth' });
  });
}

orderForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  setMessage(orderMessage);
  orderSubmit.disabled = true;
  const previous = orderSubmit.textContent;
  orderSubmit.textContent = 'جارٍ التحقق…';
  try {
    if (!state.challengeId) {
      const payload = formPayload(orderForm);
      if (state.catalogSource === 'fallback') {
        sessionStorage.setItem('thiqah:order-draft', JSON.stringify({ ...payload, savedAt: new Date().toISOString() }));
        setMessage(orderMessage, 'حفظنا مسودة طلبك على هذا الجهاز. الإرسال النهائي سيتاح فور تشغيل خدمة الطلبات.', 'success');
        orderSubmit.textContent = previous;
        return;
      }
      state.phone = payload.contactPhone;
      const result = await request('/v1/orders/guest/start', { method: 'POST', body: JSON.stringify(payload) });
      state.challengeId = result.challengeId;
      state.idempotencyKey = crypto.randomUUID();
      showOtpStage();
      setMessage(orderMessage, 'تم إرسال رمز التحقق.', 'success');
    } else {
      const otp = document.querySelector('#order-otp').value.trim();
      const result = await request('/v1/orders/guest/verify', {
        method: 'POST',
        headers: { 'Idempotency-Key': state.idempotencyKey },
        body: JSON.stringify({ challengeId: state.challengeId, phone: state.phone, otp })
      });
      showOrderSuccess(result.order);
    }
  } catch (error) {
    const known = {
      INVALID_PHONE: 'تحقق من كتابة رقم جوال سعودي صحيح.',
      INVALID_OTP: 'رمز التحقق غير صحيح أو انتهت صلاحيته.',
      RATE_LIMITED: 'محاولات كثيرة. انتظر قليلًا ثم أعد المحاولة.'
    };
    setMessage(orderMessage, known[error.code] || 'تعذّر إكمال الطلب الآن. حاول مرة أخرى.', 'error');
    orderSubmit.textContent = previous;
  } finally {
    orderSubmit.disabled = false;
  }
});

document.querySelector('#track-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const message = document.querySelector('#track-message');
  const button = event.currentTarget.querySelector('button');
  const orderNumber = document.querySelector('#track-number').value.trim();
  const token = document.querySelector('#track-token').value.trim();
  setMessage(message, 'جارٍ جلب آخر تحديث…');
  button.disabled = true;
  try {
    const data = await request(`/v1/orders/track?orderNumber=${encodeURIComponent(orderNumber)}&token=${encodeURIComponent(token)}`);
    const statusNames = { received: 'تم الاستلام', assigned: 'تم إسناد الفني', in_progress: 'جارٍ التنفيذ', completed: 'مكتمل', cancelled: 'ملغي' };
    setMessage(message, `الحالة الحالية: ${statusNames[data.order.status] || data.order.status}`, 'success');
  } catch {
    setMessage(message, 'لم نتمكن من العثور على الطلب بهذه البيانات.', 'error');
  } finally {
    button.disabled = false;
  }
});

const lastOrder = JSON.parse(sessionStorage.getItem('thiqah:last-order') || 'null');
if (lastOrder) {
  document.querySelector('#track-number').value = lastOrder.orderNumber || '';
  document.querySelector('#track-token').value = lastOrder.trackingToken || '';
}

const sections = [...document.querySelectorAll('main section[id]')];
const navLinks = [...document.querySelectorAll('.desktop-nav a, .mobile-dock a[href^="#"]')];
const observer = new IntersectionObserver((entries) => {
  const visible = entries.filter((entry) => entry.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
  if (!visible) return;
  navLinks.forEach((link) => link.classList.toggle('is-active', link.getAttribute('href') === `#${visible.target.id}`));
}, { rootMargin: '-35% 0px -55%', threshold: [0, .25, .5] });
sections.forEach((section) => observer.observe(section));

const revealObserver = new IntersectionObserver((entries, instance) => {
  entries.forEach((entry) => {
    if (!entry.isIntersecting) return;
    entry.target.classList.add('is-visible');
    instance.unobserve(entry.target);
  });
}, { rootMargin: '0px 0px -8%', threshold: .12 });
document.querySelectorAll('.section-heading, .service-card, .experience__copy, .metric-panel, .coverage-copy, .district-cloud, .track-card, .app-download__art, .app-download__copy').forEach((element) => {
  element.classList.add('reveal');
  revealObserver.observe(element);
});

loadSettings();
