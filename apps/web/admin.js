const apiBase = document.querySelector('meta[name="api-base"]')?.content.replace(/\/$/, '') || '';
const state = {
  demo: new URLSearchParams(location.search).get('demo') === '1',
  csrfToken: sessionStorage.getItem('thiqah:admin-csrf') || '',
  challengeToken: '',
  dashboard: null,
  access: null,
  view: 'overview',
  accessTab: 'employee'
};

const permissionLabels = {
  'dashboard.read': 'عرض لوحة المؤشرات',
  'customers.read': 'عرض بيانات العملاء',
  'orders.read': 'عرض الطلبات',
  'orders.manage': 'إدارة وإسناد الطلبات',
  'quotes.manage': 'إدارة عروض الأسعار',
  'technicians.read': 'عرض الفنيين',
  'technicians.manage': 'إدارة الفنيين',
  'staff.manage': 'إدارة الموظفين والصلاحيات',
  'assigned_orders.read': 'عرض المهام المسندة',
  'order_status.update': 'تحديث حالة المهمة',
  'work_media.upload': 'رفع صور التنفيذ',
  'work_notes.create': 'إضافة ملاحظات العمل'
};

const roleLabels = { owner: 'مالك النظام', admin: 'مدير تشغيل', operator: 'مشغل طلبات', support: 'خدمة عملاء', finance: 'مالية', technician: 'فني' };
const statusLabels = {
  new: 'جديد', triage: 'تحت المراجعة', quoted: 'عرض مرسل', customer_approved: 'معتمد',
  assigned: 'تم الإسناد', technician_accepted: 'قبله الفني', on_the_way: 'في الطريق',
  in_progress: 'قيد التنفيذ', awaiting_customer_confirmation: 'بانتظار التأكيد', completed: 'مكتمل', cancelled: 'ملغي'
};
const activeStatuses = new Set(['triage', 'quoted', 'customer_approved', 'assigned', 'technician_accepted', 'on_the_way', 'in_progress', 'awaiting_customer_confirmation']);

const demoDashboard = {
  actor: { id: 'demo-owner', username: 'admin', displayName: 'صالح', role: 'owner', permissions: Object.keys(permissionLabels).slice(0, 8) },
  summary: { customers_total: 284, customers_month: 37, orders_total: 416, orders_today: 18, orders_active: 12, orders_completed: 329, technicians_active: 16, technicians_available: 9, completion_rate: 79 },
  weeklyOrders: [
    { day: '2026-08-29', orders: 11 }, { day: '2026-08-30', orders: 17 }, { day: '2026-08-31', orders: 13 },
    { day: '2026-09-01', orders: 23 }, { day: '2026-09-02', orders: 19 }, { day: '2026-09-03', orders: 26 }, { day: '2026-09-04', orders: 18 }
  ],
  orderStatuses: [{ status: 'completed', count: 329 }, { status: 'in_progress', count: 12 }, { status: 'new', count: 31 }, { status: 'quoted', count: 24 }, { status: 'cancelled', count: 20 }],
  recentOrders: [
    { order_number: 'ORD-2026-100416', contact_name: 'عبدالله القحطاني', contact_phone: '055 612 8401', service_name: 'صيانة تكييف', status: 'in_progress', appointment_date: '2026-09-04', created_at: '2026-09-04T12:20:00Z' },
    { order_number: 'ORD-2026-100415', contact_name: 'نورة العتيبي', contact_phone: '050 778 2340', service_name: 'كشف تسربات', status: 'assigned', appointment_date: '2026-09-04', created_at: '2026-09-04T11:42:00Z' },
    { order_number: 'ORD-2026-100414', contact_name: 'محمد الدوسري', contact_phone: '053 901 6622', service_name: 'أعمال كهرباء', status: 'completed', appointment_date: '2026-09-04', created_at: '2026-09-04T10:15:00Z' },
    { order_number: 'ORD-2026-100413', contact_name: 'سارة الحربي', contact_phone: '056 340 1198', service_name: 'سباكة عامة', status: 'new', appointment_date: '2026-09-05', created_at: '2026-09-04T09:35:00Z' },
    { order_number: 'ORD-2026-100412', contact_name: 'خالد المطيري', contact_phone: '054 558 7321', service_name: 'صيانة سخان', status: 'quoted', appointment_date: '2026-09-05', created_at: '2026-09-04T08:54:00Z' },
    { order_number: 'ORD-2026-100411', contact_name: 'ريم الشمري', contact_phone: '059 240 8715', service_name: 'صيانة تكييف', status: 'cancelled', appointment_date: '2026-09-04', created_at: '2026-09-03T21:18:00Z' }
  ],
  recentCustomers: [
    { id: 'c1', name: 'سارة الحربي', phone: '056 340 1198', email: 's.alharbi@example.com', status: 'active', created_at: '2026-09-04T09:20:00Z' },
    { id: 'c2', name: 'خالد المطيري', phone: '054 558 7321', email: 'khaled@example.com', status: 'active', created_at: '2026-09-03T18:20:00Z' },
    { id: 'c3', name: 'ريم الشمري', phone: '059 240 8715', email: 'reem@example.com', status: 'active', created_at: '2026-09-03T12:20:00Z' },
    { id: 'c4', name: 'محمد الدوسري', phone: '053 901 6622', email: 'm.aldosari@example.com', status: 'active', created_at: '2026-09-02T15:20:00Z' },
    { id: 'c5', name: 'نورة العتيبي', phone: '050 778 2340', email: 'noura@example.com', status: 'active', created_at: '2026-09-01T09:20:00Z' },
    { id: 'c6', name: 'عبدالله القحطاني', phone: '055 612 8401', email: 'abdullah@example.com', status: 'active', created_at: '2026-08-30T08:20:00Z' }
  ],
  servicePerformance: [
    { name_ar: 'صيانة التكييف', orders: 126, completed: 103 }, { name_ar: 'السباكة', orders: 94, completed: 78 },
    { name_ar: 'الكهرباء', orders: 82, completed: 61 }, { name_ar: 'كشف التسربات', orders: 67, completed: 54 }, { name_ar: 'الصيانة العامة', orders: 47, completed: 33 }
  ]
};

const demoAccess = {
  permissionCatalog: {
    employee: Object.keys(permissionLabels).slice(0, 8),
    technician: Object.keys(permissionLabels).slice(8),
    roleDefaults: {
      operator: ['dashboard.read', 'customers.read', 'orders.read', 'orders.manage', 'technicians.read'],
      support: ['dashboard.read', 'customers.read', 'orders.read'],
      finance: ['dashboard.read', 'orders.read', 'quotes.manage'],
      admin: ['dashboard.read', 'customers.read', 'orders.read', 'orders.manage', 'quotes.manage', 'technicians.read', 'technicians.manage']
    }
  },
  staff: [
    { id: 's1', display_name: 'صالح', username: 'admin', role: 'owner', status: 'active', permissions: null, created_at: '2026-08-21T10:00:00Z' },
    { id: 's2', display_name: 'أحمد السبيعي', username: 'ahmed.ops', role: 'operator', status: 'active', permissions: ['dashboard.read', 'customers.read', 'orders.read', 'orders.manage'], created_at: '2026-09-01T10:00:00Z' },
    { id: 's3', display_name: 'منى الغامدي', username: 'mona.support', role: 'support', status: 'active', permissions: ['dashboard.read', 'customers.read', 'orders.read'], created_at: '2026-08-28T10:00:00Z' }
  ],
  technicians: [
    { id: 't1', name: 'ياسر العمري', phone: '055 221 4800', specialty: 'تكييف وتبريد', status: 'active', availability: 'available', permissions: Object.keys(permissionLabels).slice(8), created_at: '2026-08-20T10:00:00Z' },
    { id: 't2', name: 'سعد القحطاني', phone: '050 997 3412', specialty: 'سباكة وتسربات', status: 'active', availability: 'busy', permissions: Object.keys(permissionLabels).slice(8), created_at: '2026-08-23T10:00:00Z' },
    { id: 't3', name: 'ماجد الحربي', phone: '053 446 2107', specialty: 'كهرباء وإنارة', status: 'active', availability: 'available', permissions: Object.keys(permissionLabels).slice(8), created_at: '2026-08-26T10:00:00Z' }
  ]
};

async function request(path, options = {}) {
  const { headers = {}, ...rest } = options;
  const response = await fetch(`${apiBase}${path}`, {
    credentials: 'include', ...rest,
    headers: { Accept: 'application/json', ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...headers }
  });
  const data = await response.json().catch(() => ({ ok: false, message: 'استجابة غير صالحة من الخادم' }));
  if (!response.ok || data.ok === false) {
    const error = new Error(data.message || 'تعذّر تنفيذ الطلب');
    error.code = data.error;
    error.status = response.status;
    throw error;
  }
  return data;
}

const el = (selector, root = document) => root.querySelector(selector);
const all = (selector, root = document) => [...root.querySelectorAll(selector)];
const formatNumber = (value) => new Intl.NumberFormat('ar-SA').format(Number(value || 0));
const formatDate = (value, options = { day: 'numeric', month: 'short' }) => value ? new Intl.DateTimeFormat('ar-SA', options).format(new Date(value)) : '—';
const escapeHtml = (value) => String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char]);
const initials = (name) => String(name || 'م').trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join('');

function busy(form, enabled, label = 'جارٍ التحقق…') {
  const button = el('button[type="submit"]', form);
  button.dataset.label ||= button.textContent.trim();
  button.disabled = enabled;
  button.textContent = enabled ? label : button.dataset.label;
}

function showAlert(target, text = '', type = '') {
  target.textContent = text;
  target.className = `login-alert${type ? ` is-${type}` : ''}`;
}

function statusClass(status) {
  if (status === 'completed') return 'status-completed';
  if (status === 'cancelled') return 'status-cancelled';
  if (status === 'new') return 'status-new';
  return 'status-progress';
}

function statusPill(status) {
  return `<span class="status-pill ${statusClass(status)}">${escapeHtml(statusLabels[status] || status)}</span>`;
}

function orderRows(orders) {
  return orders.map((order) => `<tr data-search-value="${escapeHtml(`${order.order_number} ${order.contact_name} ${order.contact_phone} ${order.service_name}`.toLowerCase())}" data-status="${escapeHtml(order.status)}">
    <td><span class="order-cell"><strong dir="ltr">${escapeHtml(order.order_number)}</strong><small>${formatDate(order.created_at, { hour: 'numeric', minute: '2-digit' })}</small></span></td>
    <td><strong>${escapeHtml(order.contact_name)}</strong></td>
    <td dir="ltr">${escapeHtml(order.contact_phone || '—')}</td>
    <td>${escapeHtml(order.service_name)}</td>
    <td>${statusPill(order.status)}</td>
    <td>${formatDate(order.appointment_date, { day: 'numeric', month: 'short' })}</td>
  </tr>`).join('');
}

function renderKpis(summary) {
  all('[data-kpi]').forEach((node) => { node.textContent = formatNumber(summary[node.dataset.kpi]); });
  el('#orders-count').textContent = formatNumber(summary.orders_active);
}

function renderWeekly(rows) {
  const max = Math.max(...rows.map((row) => Number(row.orders)), 1);
  el('#weekly-chart').innerHTML = rows.map((row) => {
    const height = Math.max(5, Math.round((Number(row.orders) / max) * 100));
    const day = new Intl.DateTimeFormat('ar-SA', { weekday: 'short' }).format(new Date(`${row.day}T12:00:00Z`));
    return `<div class="bar-column"><div class="bar-track"><i class="bar" style="height:${height}%" data-value="${formatNumber(row.orders)}"></i></div><span>${escapeHtml(day)}</span></div>`;
  }).join('');
}

function renderStatuses(rows, total) {
  const colors = ['#0d9488', '#f7a928', '#3178b9', '#7e8d9a', '#c85a51'];
  let position = 0;
  const stops = rows.map((row, index) => {
    const start = position;
    position += total ? (Number(row.count) / total) * 100 : 0;
    return `${colors[index % colors.length]} ${start}% ${position}%`;
  });
  if (position < 100) stops.push(`#e7edef ${position}% 100%`);
  el('#status-donut').style.background = `conic-gradient(${stops.join(',')})`;
  el('#status-legend').innerHTML = rows.slice(0, 5).map((row, index) => `<div class="legend-item"><i style="background:${colors[index % colors.length]}"></i><span>${escapeHtml(statusLabels[row.status] || row.status)}</span><b>${formatNumber(row.count)}</b></div>`).join('');
}

function renderServices(rows) {
  const max = Math.max(...rows.map((row) => Number(row.orders)), 1);
  el('#service-performance').innerHTML = rows.map((row) => `<div class="service-row"><span>${escapeHtml(row.name_ar)}</span><b>${formatNumber(row.orders)}</b><i><span style="width:${Math.round((Number(row.orders) / max) * 100)}%"></span></i></div>`).join('');
}

function renderCustomers(rows) {
  el('#customer-grid').innerHTML = rows.length ? rows.map((customer) => `<article class="customer-card" data-search-value="${escapeHtml(`${customer.name} ${customer.phone} ${customer.email || ''}`.toLowerCase())}"><span class="customer-avatar">${escapeHtml(initials(customer.name))}</span><div><b>${escapeHtml(customer.name)}</b><span>${escapeHtml(customer.phone)}</span><span>${escapeHtml(customer.email || 'بدون بريد')}</span><small>انضم ${formatDate(customer.created_at)}</small></div></article>`).join('') : '<p class="empty-state">لا يوجد عملاء بعد.</p>';
}

function renderDashboard(data) {
  state.dashboard = data;
  const name = data.actor?.displayName || data.actor?.display_name || 'صالح';
  el('.page-heading h1').innerHTML = `هلا والله ${escapeHtml(name)} <em>👋</em>`;
  el('#profile-name').textContent = name;
  el('#profile-avatar').textContent = initials(name);
  el('#profile-role').textContent = roleLabels[data.actor?.role] || 'إدارة';
  el('#today-label').textContent = new Intl.DateTimeFormat('ar-SA', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date());
  renderKpis(data.summary);
  renderWeekly(data.weeklyOrders);
  renderStatuses(data.orderStatuses, Number(data.summary.orders_total));
  renderServices(data.servicePerformance);
  el('#recent-orders').innerHTML = orderRows(data.recentOrders);
  el('#all-orders').innerHTML = orderRows(data.recentOrders);
  renderCustomers(data.recentCustomers);
  applyPermissions(data.actor?.permissions || []);
}

function effectiveAccountPermissions(account, type) {
  if (account.role === 'owner') return state.access.permissionCatalog.employee;
  if (Array.isArray(account.permissions)) return account.permissions;
  if (type === 'employee') return state.access.permissionCatalog.roleDefaults[account.role] || [];
  return state.access.permissionCatalog.technician;
}

function renderAccounts() {
  if (!state.access) return;
  const isEmployee = state.accessTab === 'employee';
  const accounts = isEmployee ? state.access.staff : state.access.technicians;
  el('#staff-count').textContent = formatNumber(state.access.staff.length);
  el('#tech-count').textContent = formatNumber(state.access.technicians.length);
  el('#account-grid').innerHTML = accounts.length ? accounts.map((account) => {
    const name = isEmployee ? account.display_name : account.name;
    const sub = isEmployee ? `@${account.username} · ${roleLabels[account.role] || account.role}` : `${account.phone} · ${account.specialty || 'فني صيانة'}`;
    const permissions = effectiveAccountPermissions(account, state.accessTab);
    return `<article class="account-card"><div class="account-head"><span>${escapeHtml(initials(name))}</span><div><b>${escapeHtml(name)}</b><small>${escapeHtml(sub)}</small></div><i class="${account.status === 'active' ? '' : 'is-disabled'}">${account.status === 'active' ? 'نشط' : 'موقوف'}</i></div><div class="permission-tags">${permissions.slice(0, 4).map((permission) => `<span>${escapeHtml(permissionLabels[permission] || permission)}</span>`).join('')}${permissions.length > 4 ? `<span>+${formatNumber(permissions.length - 4)}</span>` : ''}</div><div class="account-meta"><span>${isEmployee ? 'موظف' : `الحالة: ${account.availability === 'busy' ? 'مشغول' : 'متاح'}`}</span><span>منذ ${formatDate(account.created_at)}</span></div></article>`;
  }).join('') : '<p class="empty-state">لا توجد حسابات في هذا القسم.</p>';
}

function applyPermissions(permissions) {
  all('[data-permission]').forEach((node) => { node.hidden = !permissions.includes(node.dataset.permission); });
}

async function loadAccess() {
  if (state.access) return renderAccounts();
  try {
    state.access = state.demo ? structuredClone(demoAccess) : await request('/v1/admin/access');
    renderAccounts();
  } catch (error) {
    el('#account-grid').innerHTML = `<p class="empty-state">${error.status === 403 ? 'لا يملك حسابك صلاحية إدارة المستخدمين.' : 'تعذّر تحميل الحسابات.'}</p>`;
  }
}

function switchView(view) {
  state.view = view;
  all('[data-view-panel]').forEach((panel) => panel.classList.toggle('is-active', panel.dataset.viewPanel === view));
  all('[data-view]').forEach((button) => button.classList.toggle('is-active', button.dataset.view === view));
  el('#sidebar').classList.remove('is-open');
  if (view === 'access') loadAccess();
  scrollTo({ top: 0, behavior: 'smooth' });
}

function showDashboard() {
  el('#login-screen').hidden = true;
  el('#dashboard').hidden = false;
  el('#demo-badge').hidden = !state.demo;
}

async function loadDashboard() {
  const data = state.demo ? structuredClone(demoDashboard) : await request('/v1/admin/dashboard');
  renderDashboard(data);
  showDashboard();
}

const loginForm = el('#admin-login-form');
loginForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  showAlert(el('#login-message'));
  busy(loginForm, true);
  try {
    const values = Object.fromEntries(new FormData(loginForm));
    const result = await request('/v1/auth/admin/login', { method: 'POST', body: JSON.stringify(values) });
    state.challengeToken = result.challengeToken;
    loginForm.hidden = true;
    el('#mfa-form').hidden = false;
    el('#mfa-form input').focus();
  } catch (error) {
    showAlert(el('#login-message'), error.code === 'RATE_LIMITED' ? 'محاولات كثيرة. انتظر قليلًا ثم أعد المحاولة.' : 'بيانات الدخول غير صحيحة أو خدمة الإدارة غير متاحة الآن.');
  } finally { busy(loginForm, false); }
});

const mfaForm = el('#mfa-form');
mfaForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  showAlert(el('#mfa-message'));
  busy(mfaForm, true);
  try {
    const code = new FormData(mfaForm).get('code');
    const result = await request('/v1/auth/admin/mfa/verify', { method: 'POST', body: JSON.stringify({ challengeToken: state.challengeToken, code, clientType: 'web' }) });
    state.csrfToken = result.csrfToken;
    sessionStorage.setItem('thiqah:admin-csrf', state.csrfToken);
    await loadDashboard();
  } catch { showAlert(el('#mfa-message'), 'رمز المصادقة غير صحيح أو انتهت صلاحيته.'); }
  finally { busy(mfaForm, false); }
});

all('[data-view]').forEach((button) => button.addEventListener('click', () => switchView(button.dataset.view)));
all('[data-go-view]').forEach((button) => button.addEventListener('click', () => switchView(button.dataset.goView)));
all('[data-sidebar-close]').forEach((button) => button.addEventListener('click', () => el('#sidebar').classList.remove('is-open')));
el('#menu-button').addEventListener('click', () => el('#sidebar').classList.add('is-open'));

el('#order-status-filter').addEventListener('change', (event) => {
  all('#all-orders tr').forEach((row) => { row.hidden = Boolean(event.target.value) && row.dataset.status !== event.target.value; });
});

all('[data-table-search]').forEach((input) => input.addEventListener('input', () => {
  const query = input.value.trim().toLowerCase();
  const selector = input.dataset.tableSearch === 'orders' ? '#all-orders tr' : '#customer-grid .customer-card';
  all(selector).forEach((item) => { item.hidden = query && !item.dataset.searchValue.includes(query); });
}));

el('#global-search').addEventListener('input', (event) => {
  if (!event.target.value.trim()) return;
  switchView('orders');
  const tableSearch = el('[data-table-search="orders"]');
  tableSearch.value = event.target.value;
  tableSearch.dispatchEvent(new Event('input'));
});

all('[data-access-tab]').forEach((button) => button.addEventListener('click', () => {
  state.accessTab = button.dataset.accessTab;
  all('[data-access-tab]').forEach((item) => item.classList.toggle('is-active', item === button));
  renderAccounts();
}));

const modal = el('#account-modal');
function permissionsForForm() {
  const form = el('#account-form');
  const type = form.accountType.value;
  const catalog = state.access?.permissionCatalog || demoAccess.permissionCatalog;
  if (type === 'employee') return catalog.roleDefaults[form.role.value] || [];
  return catalog.technician;
}

function renderPermissionOptions(selected = permissionsForForm()) {
  const type = el('#account-form').accountType.value;
  const catalog = state.access?.permissionCatalog || demoAccess.permissionCatalog;
  el('#permission-grid').innerHTML = catalog[type].map((permission) => `<label class="permission-option"><input type="checkbox" name="permissions" value="${escapeHtml(permission)}" ${selected.includes(permission) ? 'checked' : ''}><span>${escapeHtml(permissionLabels[permission] || permission)}</span></label>`).join('');
}

function setAccountType(type) {
  const form = el('#account-form');
  form.accountType.value = type;
  all('[data-account-type]').forEach((button) => button.classList.toggle('is-active', button.dataset.accountType === type));
  all('[data-employee-field]').forEach((field) => { field.hidden = type !== 'employee'; all('input,select', field).forEach((input) => { input.required = type === 'employee'; }); });
  all('[data-technician-field]').forEach((field) => { field.hidden = type !== 'technician'; all('input,select', field).forEach((input) => { input.required = type === 'technician'; }); });
  el('[name="email"]', form).required = type === 'employee';
  renderPermissionOptions();
}

function openAccountModal() {
  modal.classList.add('is-open');
  modal.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
  setAccountType('employee');
  setTimeout(() => el('[name="displayName"]', modal).focus(), 180);
}

function closeAccountModal() {
  modal.classList.remove('is-open');
  modal.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';
  el('#account-form').reset();
  showAlert(el('#account-message'));
}

all('[data-open-account]').forEach((button) => button.addEventListener('click', openAccountModal));
all('[data-close-account]').forEach((button) => button.addEventListener('click', closeAccountModal));
all('[data-account-type]').forEach((button) => button.addEventListener('click', () => setAccountType(button.dataset.accountType)));
el('[name="role"]', modal).addEventListener('change', () => renderPermissionOptions());
document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && modal.classList.contains('is-open')) closeAccountModal(); });

const accountForm = el('#account-form');
accountForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  showAlert(el('#account-message'));
  busy(accountForm, true, 'جارٍ إنشاء الحساب…');
  try {
    const entries = new FormData(accountForm);
    const type = entries.get('accountType');
    const payload = { permissions: entries.getAll('permissions'), password: entries.get('password') };
    if (type === 'employee') Object.assign(payload, { displayName: entries.get('displayName'), username: entries.get('username'), email: entries.get('email'), role: entries.get('role') });
    else Object.assign(payload, { name: entries.get('displayName'), phone: entries.get('phone'), email: entries.get('email') || undefined, specialty: entries.get('specialty') });
    if (state.demo) {
      const created = { id: crypto.randomUUID(), status: 'active', created_at: new Date().toISOString(), permissions: payload.permissions, ...(type === 'employee' ? { display_name: payload.displayName, username: payload.username, role: payload.role } : { name: payload.name, phone: payload.phone, specialty: payload.specialty, availability: 'available' }) };
      (type === 'employee' ? state.access.staff : state.access.technicians).unshift(created);
      showAlert(el('#account-message'), 'تمت محاكاة إنشاء الحساب داخل المعاينة فقط.', 'success');
      renderAccounts();
      setTimeout(closeAccountModal, 850);
    } else {
      await request(type === 'employee' ? '/v1/admin/staff' : '/v1/admin/technicians', { method: 'POST', headers: { 'X-CSRF-Token': state.csrfToken }, body: JSON.stringify(payload) });
      state.access = null;
      await loadAccess();
      showAlert(el('#account-message'), 'تم إنشاء الحساب وتطبيق الصلاحيات.', 'success');
      setTimeout(closeAccountModal, 850);
    }
  } catch (error) {
    const messages = { ACCOUNT_ALREADY_EXISTS: 'بيانات الحساب مستخدمة مسبقًا.', WEAK_PASSWORD: 'كلمة المرور يجب أن تكون 10 أحرف على الأقل.', INVALID_PHONE: 'أدخل رقم جوال سعودي صحيحًا.', FORBIDDEN: 'لا تملك صلاحية إنشاء هذا الحساب.' };
    showAlert(el('#account-message'), messages[error.code] || 'تعذّر إنشاء الحساب. راجع البيانات وحاول مرة أخرى.');
  } finally { busy(accountForm, false); }
});

el('#logout-button').addEventListener('click', async () => {
  try {
    if (!state.demo) await request('/v1/auth/logout', { method: 'POST', headers: { 'X-CSRF-Token': state.csrfToken } });
  } catch {} finally {
    sessionStorage.removeItem('thiqah:admin-csrf');
    location.assign('/admin');
  }
});

async function initialize() {
  if (state.demo) {
    state.access = structuredClone(demoAccess);
    await loadDashboard();
    return;
  }
  try { await loadDashboard(); }
  catch { el('#login-screen').hidden = false; }
}

initialize();
