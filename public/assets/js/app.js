/**
 * SMM Panel - Main Application
 */

// STATE
let allServices = [];
let allOrders = [];
let currentUser = null;

// INIT
document.addEventListener('DOMContentLoaded', () => {
  if (API.isLoggedIn()) {
    currentUser = API.getUser();
    showDashboard();
  } else {
    showAuthWrapper();
  }
  bindEvents();
});

function bindEvents() {
  document.getElementById('login-form').addEventListener('submit', handleLogin);
  document.getElementById('register-form').addEventListener('submit', handleRegister);
  document.getElementById('order-qty').addEventListener('input', calcOrderTotal);
  document.addEventListener('click', (e) => {
    const menu = document.getElementById('user-dropdown');
    if (!menu.classList.contains('hidden') && !e.target.closest('.topbar-user')) {
      menu.classList.add('hidden');
    }
  });
}

// AUTH
function showAuthWrapper() {
  document.getElementById('auth-wrapper').classList.remove('hidden');
  document.getElementById('dashboard').classList.add('hidden');
}

function showDashboard() {
  document.getElementById('auth-wrapper').classList.add('hidden');
  document.getElementById('dashboard').classList.remove('hidden');
  initDashboard();
}

function showPage(pageId) {
  document.querySelectorAll('.auth-page').forEach(p => p.classList.remove('active'));
  document.getElementById(pageId).classList.add('active');
}

async function handleLogin(e) {
  e.preventDefault();
  const email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  if (!email || !password) return showToast('error', 'Error', 'Please fill all fields');
  showLoading(true);
  try {
    const res = await API.login(email, password);
    if (res.success) {
      currentUser = res.user;
      showToast('success', 'Welcome back!', 'Hello, ' + currentUser.name + ' \u{1F44B}');
      setTimeout(() => showDashboard(), 500);
    } else {
      showToast('error', 'Login Failed', res.message || 'Invalid credentials');
    }
  } catch (err) {
    showToast('error', 'Error', 'Something went wrong. Please try again.');
  } finally {
    showLoading(false);
  }
}

async function handleRegister(e) {
  e.preventDefault();
  const name = document.getElementById('reg-name').value.trim();
  const email = document.getElementById('reg-email').value.trim();
  const password = document.getElementById('reg-password').value;
  if (!name || !email || !password) return showToast('error', 'Error', 'Please fill all fields');
  if (password.length < 8) return showToast('error', 'Error', 'Password must be at least 8 characters');
  showLoading(true);
  try {
    const res = await API.register(name, email, password);
    if (res.success) {
      currentUser = res.user;
      showToast('success', 'Account Created!', 'Welcome, ' + name + '! \u{1F389}');
      setTimeout(() => showDashboard(), 500);
    } else {
      showToast('error', 'Registration Failed', res.message || 'Could not create account');
    }
  } catch (err) {
    showToast('error', 'Error', 'Something went wrong. Please try again.');
  } finally {
    showLoading(false);
  }
}

function logout() {
  API.logout();
  currentUser = null;
  allServices = [];
  allOrders = [];
  showAuthWrapper();
  showToast('info', 'Logged Out', 'See you next time!');
}

// DASHBOARD INIT
async function initDashboard() {
  updateUserUI();
  navigateTo('new-order', document.querySelector('.nav-item'));
  // Refresh user from server in production
  if (!CONFIG.DEMO_MODE) {
    try {
      currentUser = await API.refreshUser();
    } catch(e) { /* use cached */ }
  }
  updateUserUI();
  await loadServices();
  loadOrders();
  loadTransactions();
  updateReferralLink();
  updateApiKey();
}

function updateUserUI() {
  if (!currentUser) return;
  const initials = currentUser.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  document.getElementById('sidebar-avatar').textContent = initials;
  document.getElementById('topbar-avatar').textContent = initials;
  document.getElementById('sidebar-name').textContent = currentUser.name;
  const firstName = currentUser.name.split(' ')[0];
  document.getElementById('welcome-title').textContent = 'Welcome ' + firstName + ' \u{1F44B}';
  updateBalanceUI();
}

function updateBalanceUI() {
  if (!currentUser) return;
  const bal = formatCurrency(currentUser.balance || 0);
  const spent = formatCurrency(currentUser.total_spent || 0);
  const orders = currentUser.total_orders || 0;
  document.getElementById('stat-balance').textContent = bal;
  document.getElementById('stat-spent').textContent = spent;
  document.getElementById('stat-orders').textContent = orders;
  document.getElementById('topbar-balance').textContent = bal;
}

// NAVIGATION
function navigateTo(section, el) {
  if (el) {
    document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
    el.classList.add('active');
  }
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  const page = document.getElementById('page-' + section);
  if (page) page.classList.add('active');
  const labels = {
    'new-order': 'New Order', 'my-orders': 'My Orders', 'services': 'Services',
    'add-funds': 'Add Funds', 'referral': 'Referral', 'tickets': 'Tickets', 'api-docs': 'API',
  };
  document.getElementById('breadcrumb-current').textContent = labels[section] || section;
  if (window.innerWidth <= 768) closeSidebar();
  if (section === 'my-orders') loadOrders();
  if (section === 'services') renderServicesTable();
  if (section === 'add-funds') loadTransactions();
  return false;
}

function toggleSidebar() {
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebar-overlay');
  sidebar.classList.toggle('open');
  overlay.classList.toggle('active');
}

function closeSidebar() {
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('sidebar-overlay').classList.remove('active');
}

function toggleUserMenu() {
  document.getElementById('user-dropdown').classList.toggle('hidden');
}

// SERVICES
async function loadServices() {
  try {
    allServices = await API.getServices();
    populateCategorySelect();
    renderServicesTable();
    populateServicesCategoryFilter();
  } catch (e) {
    showToast('error', 'Error', 'Failed to load services');
  }
}

function populateCategorySelect() {
  const sel = document.getElementById('category-select');
  const categories = [...new Set(allServices.map(s => s.category))].sort();
  sel.innerHTML = '<option value="">Choose Category</option>';
  categories.forEach(cat => {
    const opt = document.createElement('option');
    opt.value = cat;
    opt.textContent = getCategoryIcon(cat) + ' ' + cat;
    sel.appendChild(opt);
  });
}

function populateServicesCategoryFilter() {
  const sel = document.getElementById('services-category-filter');
  if (!sel) return;
  const categories = [...new Set(allServices.map(s => s.category))].sort();
  sel.innerHTML = '<option value="">All Categories</option>';
  categories.forEach(cat => {
    const opt = document.createElement('option');
    opt.value = cat;
    opt.textContent = cat;
    sel.appendChild(opt);
  });
}

function loadServicesByCategory() {
  const cat = document.getElementById('category-select').value;
  const sel = document.getElementById('service-select');
  sel.innerHTML = '<option value="">Choose Service</option>';
  document.getElementById('service-info').classList.add('hidden');
  const detailContent = document.getElementById('service-detail-content');
  const placeholder = document.querySelector('.service-detail-placeholder');
  if (detailContent) detailContent.classList.add('hidden');
  if (placeholder) placeholder.classList.remove('hidden');
  if (!cat) return;
  allServices.filter(s => s.category === cat).forEach(s => {
    const opt = document.createElement('option');
    opt.value = s.service;
    opt.textContent = s.service + ' | ' + s.name + ' - $' + s.rate + ' per 1000';
    sel.appendChild(opt);
  });
}

function onServiceChange() {
  const serviceId = document.getElementById('service-select').value;
  const detailContent = document.getElementById('service-detail-content');
  const placeholder = document.querySelector('.service-detail-placeholder');
  if (!serviceId) {
    document.getElementById('service-info').classList.add('hidden');
    if (detailContent) detailContent.classList.add('hidden');
    if (placeholder) placeholder.classList.remove('hidden');
    return;
  }
  const service = allServices.find(s => s.service == serviceId);
  if (!service) return;
  document.getElementById('info-min').textContent = service.min;
  document.getElementById('info-max').textContent = formatNumber(service.max);
  document.getElementById('info-rate').textContent = '$' + service.rate + '/1K';
  document.getElementById('service-info').classList.remove('hidden');
  const qtyEl = document.getElementById('order-qty');
  qtyEl.placeholder = 'Min: ' + service.min + ' - Max: ' + formatNumber(service.max);
  qtyEl.min = service.min;
  qtyEl.max = service.max;
  if (placeholder) placeholder.classList.add('hidden');
  if (detailContent) {
    detailContent.classList.remove('hidden');
    document.getElementById('detail-platform').textContent = service.category;
    document.getElementById('detail-name').textContent = service.name;
    document.getElementById('detail-id').textContent = service.service;
    document.getElementById('detail-time').textContent = estimateTime(service);
  }
  calcOrderTotal();
}

function calcOrderTotal() {
  const serviceId = document.getElementById('service-select').value;
  const qty = parseInt(document.getElementById('order-qty').value) || 0;
  if (!serviceId || !qty) { document.getElementById('order-total').textContent = '$0.00'; return; }
  const service = allServices.find(s => s.service == serviceId);
  if (!service) return;
  document.getElementById('order-total').textContent = '$' + (parseFloat(service.rate) * qty / 1000).toFixed(4);
}

function estimateTime(service) {
  const rate = parseFloat(service.rate);
  if (rate < 0.1) return '1-6 hours';
  if (rate < 0.5) return '1-24 hours';
  if (rate < 2) return '1-3 days';
  return '3-7 days';
}

function renderServicesTable() {
  const search = (document.getElementById('services-search') ? document.getElementById('services-search').value : '').toLowerCase();
  const catFilter = document.getElementById('services-category-filter') ? document.getElementById('services-category-filter').value : '';
  let filtered = allServices;
  if (search) filtered = filtered.filter(s => s.name.toLowerCase().includes(search) || String(s.service).includes(search));
  if (catFilter) filtered = filtered.filter(s => s.category === catFilter);
  const tbody = document.getElementById('services-tbody');
  if (!tbody) return;
  if (!filtered.length) {
    tbody.innerHTML = '<tr><td colspan="7" class="empty-state"><i class="fas fa-search"></i><br/>No services found</td></tr>';
    return;
  }
  tbody.innerHTML = filtered.map(s =>
    '<tr>' +
    '<td><strong>#' + s.service + '</strong></td>' +
    '<td>' + escapeHtml(s.name) + '</td>' +
    '<td><span class="status-badge status-processing">' + escapeHtml(s.category) + '</span></td>' +
    '<td><strong>$' + s.rate + '</strong></td>' +
    '<td>' + formatNumber(s.min) + '</td>' +
    '<td>' + formatNumber(s.max) + '</td>' +
    '<td><button class="btn-primary" style="padding:.375rem .875rem;font-size:.75rem" onclick="orderService(' + s.service + ')"><i class="fas fa-cart-plus"></i> Order</button></td>' +
    '</tr>'
  ).join('');
}

function filterServices() { renderServicesTable(); }

function orderService(serviceId) {
  const service = allServices.find(s => s.service == serviceId);
  if (!service) return;
  navigateTo('new-order', document.querySelector('.nav-item'));
  setTimeout(() => {
    document.getElementById('category-select').value = service.category;
    loadServicesByCategory();
    setTimeout(() => {
      document.getElementById('service-select').value = serviceId;
      onServiceChange();
    }, 100);
  }, 100);
}

// ORDERS
async function placeOrder() {
  const serviceId = document.getElementById('service-select').value;
  const link = document.getElementById('order-link').value.trim();
  const qty = parseInt(document.getElementById('order-qty').value);
  if (!serviceId) return showToast('warning', 'Missing Field', 'Please choose a service');
  if (!link) return showToast('warning', 'Missing Field', 'Please enter a link');
  if (!qty || qty < 1) return showToast('warning', 'Missing Field', 'Please enter a valid quantity');
  const service = allServices.find(s => s.service == serviceId);
  if (service) {
    if (qty < service.min) return showToast('warning', 'Invalid Quantity', 'Minimum is ' + service.min);
    if (qty > service.max) return showToast('warning', 'Invalid Quantity', 'Maximum is ' + formatNumber(service.max));
    const total = parseFloat(service.rate) * qty / 1000;
    if (currentUser && total > currentUser.balance) {
      return showToast('error', 'Insufficient Balance', 'You need $' + total.toFixed(4) + ' but have $' + currentUser.balance.toFixed(2));
    }
  }
  showLoading(true);
  try {
    const res = await API.placeOrder(serviceId, link, qty, service ? service.name : '');
    if (res.order) {
      currentUser = API.getUser();
      updateBalanceUI();
      showToast('success', 'Order Placed! \u{1F389}', 'Order #' + res.order + ' has been submitted');
      document.getElementById('order-link').value = '';
      document.getElementById('order-qty').value = '';
      document.getElementById('order-total').textContent = '$0.00';
    } else {
      showToast('error', 'Order Failed', res.error || 'Could not place order');
    }
  } catch (err) {
    showToast('error', 'Error', err.message || 'Something went wrong');
  } finally {
    showLoading(false);
  }
}

async function placeBulkOrder() {
  const input = document.getElementById('bulk-input').value.trim();
  if (!input) return showToast('warning', 'Empty', 'Please enter bulk order data');
  const lines = input.split('\n').filter(l => l.trim());
  const orders = [];
  for (const line of lines) {
    const parts = line.split('|');
    if (parts.length !== 3) return showToast('error', 'Format Error', 'Invalid format on line: ' + line);
    orders.push({ service: parts[0].trim(), link: parts[1].trim(), quantity: parseInt(parts[2].trim()) });
  }
  showLoading(true);
  let success = 0, failed = 0;
  for (const o of orders) {
    try {
      const res = await API.placeOrder(o.service, o.link, o.quantity);
      if (res.order) success++; else failed++;
    } catch { failed++; }
  }
  showLoading(false);
  currentUser = API.getUser();
  updateBalanceUI();
  showToast('success', 'Bulk Order Done', success + ' placed, ' + failed + ' failed');
  if (success > 0) document.getElementById('bulk-input').value = '';
}

async function loadOrders() {
  const tbody = document.getElementById('orders-tbody');
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="8" class="empty-state"><i class="fas fa-spinner fa-spin"></i><br/>Loading...</td></tr>';
  try {
    allOrders = await API.getOrders();
    renderOrdersTable(allOrders);
  } catch (e) {
    tbody.innerHTML = '<tr><td colspan="8" class="empty-state"><i class="fas fa-exclamation-circle"></i><br/>Failed to load orders</td></tr>';
  }
}

function renderOrdersTable(orders) {
  const tbody = document.getElementById('orders-tbody');
  if (!orders.length) {
    tbody.innerHTML = '<tr><td colspan="8" class="empty-state"><i class="fas fa-inbox"></i><br/>No orders yet</td></tr>';
    return;
  }
  tbody.innerHTML = orders.map(o => {
    const service = allServices.find(s => s.service == o.service);
    const sName = service ? service.name : 'Service #' + o.service;
    const status = (o.status || 'pending').toLowerCase();
    return '<tr>' +
      '<td><strong>#' + o.order + '</strong></td>' +
      '<td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="' + escapeHtml(sName) + '">' + escapeHtml(sName) + '</td>' +
      '<td class="link-cell"><a href="' + escapeHtml(o.link) + '" target="_blank" rel="noopener">' + escapeHtml(o.link) + '</a></td>' +
      '<td>' + formatNumber(o.quantity) + '</td>' +
      '<td><strong>$' + parseFloat(o.charge || 0).toFixed(4) + '</strong></td>' +
      '<td>' + formatNumber(o.start_count || 0) + '</td>' +
      '<td>' + formatNumber(o.remains || 0) + '</td>' +
      '<td><span class="status-badge status-' + status + '">' + (o.status || 'Pending') + '</span></td>' +
      '</tr>';
  }).join('');
}

function filterOrders() {
  const search = document.getElementById('orders-search').value.toLowerCase();
  const status = document.getElementById('orders-filter').value.toLowerCase();
  let filtered = allOrders;
  if (search) filtered = filtered.filter(o => String(o.order).includes(search) || String(o.service).includes(search) || (o.link || '').toLowerCase().includes(search));
  if (status) filtered = filtered.filter(o => (o.status || '').toLowerCase() === status);
  renderOrdersTable(filtered);
}

async function searchOrder() {
  const id = document.getElementById('search-order-id').value.trim();
  if (!id) return showToast('warning', 'Missing', 'Please enter an Order ID');
  showLoading(true);
  try {
    const res = await API.getOrderStatus(id);
    const el = document.getElementById('search-result');
    el.classList.remove('hidden');
    if (res.error) {
      el.innerHTML = '<div class="empty-state" style="padding:1rem"><i class="fas fa-times-circle" style="color:var(--danger)"></i><br/>' + res.error + '</div>';
    } else {
      const service = allServices.find(s => s.service == res.service);
      const sName = service ? service.name : 'Service #' + res.service;
      const status = (res.status || 'pending').toLowerCase();
      el.innerHTML =
        '<div class="result-row"><span class="result-label">Order ID</span><span class="result-value">#' + res.order + '</span></div>' +
        '<div class="result-row"><span class="result-label">Service</span><span class="result-value">' + escapeHtml(sName) + '</span></div>' +
        '<div class="result-row"><span class="result-label">Quantity</span><span class="result-value">' + formatNumber(res.quantity) + '</span></div>' +
        '<div class="result-row"><span class="result-label">Start Count</span><span class="result-value">' + formatNumber(res.start_count || 0) + '</span></div>' +
        '<div class="result-row"><span class="result-label">Remains</span><span class="result-value">' + formatNumber(res.remains || 0) + '</span></div>' +
        '<div class="result-row"><span class="result-label">Status</span><span class="result-value"><span class="status-badge status-' + status + '">' + res.status + '</span></span></div>' +
        '<div class="result-row"><span class="result-label">Charge</span><span class="result-value">$' + parseFloat(res.charge || 0).toFixed(4) + '</span></div>';
    }
  } catch (e) {
    showToast('error', 'Error', 'Failed to fetch order status');
  } finally {
    showLoading(false);
  }
}

// ADD FUNDS
function selectPayment(method) {
  document.querySelectorAll('.payment-method').forEach(m => m.classList.remove('active'));
  event.currentTarget.classList.add('active');
}

function setAmount(amount) {
  document.getElementById('fund-amount').value = amount;
}

async function addFunds() {
  const amount = parseFloat(document.getElementById('fund-amount').value);
  if (!amount || amount < CONFIG.MIN_DEPOSIT) return showToast('warning', 'Invalid Amount', 'Minimum deposit is $' + CONFIG.MIN_DEPOSIT);
  showLoading(true);
  try {
    const res = await API.addFunds(amount);
    if (res.success) {
      if (!CONFIG.DEMO_MODE) currentUser = await API.refreshUser();
      else currentUser = API.getUser();
      updateBalanceUI();
      loadTransactions();
      document.getElementById('fund-amount').value = '';
      showToast('success', 'Funds Added!', '$' + amount.toFixed(2) + ' added to your balance');
    } else {
      showToast('error', 'Failed', res.error || 'Could not add funds');
    }
  } catch(e) {
    showToast('error', 'Error', e.message);
  } finally {
    showLoading(false);
  }
}

async function loadTransactions() {
  const list = document.getElementById('transaction-list');
  if (!list) return;
  try {
    const transactions = await API.getTransactions();
    if (!transactions.length) {
      list.innerHTML = '<div class="empty-state"><i class="fas fa-receipt"></i><br/>No transactions yet</div>';
      return;
    }
    list.innerHTML = transactions.map(t =>
      '<div class="transaction-item">' +
      '<div class="transaction-icon ' + t.type + '"><i class="fas fa-' + (t.type === 'credit' ? 'arrow-down' : 'arrow-up') + '"></i></div>' +
      '<div class="transaction-info"><strong>' + escapeHtml(t.description) + '</strong><span>' + formatDate(t.date || t.created_at) + '</span></div>' +
      '<span class="transaction-amount ' + t.type + '">' + (t.type === 'credit' ? '+' : '-') + '$' + parseFloat(t.amount).toFixed(2) + '</span>' +
      '</div>'
    ).join('');
  } catch(e) {
    list.innerHTML = '<div class="empty-state"><i class="fas fa-exclamation-circle"></i><br/>Failed to load transactions</div>';
  }
}

// REFERRAL
function updateReferralLink() {
  if (!currentUser) return;
  const link = CONFIG.APP_URL + '/ref/' + (currentUser.referral_code || 'USER' + currentUser.id);
  const el = document.getElementById('referral-link');
  if (el) el.value = link;
}

function copyReferral() {
  navigator.clipboard.writeText(document.getElementById('referral-link').value)
    .then(() => showToast('success', 'Copied!', 'Referral link copied to clipboard'));
}

// TICKETS
function showNewTicket() { document.getElementById('new-ticket-form').classList.remove('hidden'); }
function hideNewTicket() { document.getElementById('new-ticket-form').classList.add('hidden'); }

async function submitTicket() {
  const subject = document.getElementById('ticket-subject').value.trim();
  const category = document.getElementById('ticket-category').value;
  const message = document.getElementById('ticket-message').value.trim();
  if (!subject || !message) return showToast('warning', 'Missing Fields', 'Please fill subject and message');
  showLoading(true);
  try {
    const res = await API.createTicket(subject, category, message);
    if (res.success) {
      showToast('success', 'Ticket Submitted', 'Our team will respond within 24 hours');
      hideNewTicket();
      document.getElementById('ticket-subject').value = '';
      document.getElementById('ticket-message').value = '';
    } else {
      showToast('error', 'Failed', res.error || 'Could not submit ticket');
    }
  } catch(e) {
    showToast('error', 'Error', e.message);
  } finally {
    showLoading(false);
  }
}

// API DOCS
function updateApiKey() {
  if (!currentUser) return;
  const el = document.getElementById('api-key-display');
  if (el) el.value = currentUser.api_key || 'No API key generated';
}

function copyApiKey() {
  navigator.clipboard.writeText(document.getElementById('api-key-display').value)
    .then(() => showToast('success', 'Copied!', 'API key copied to clipboard'));
}

function regenerateApiKey() {
  const newKey = 'sk_' + Math.random().toString(36).substr(2, 32);
  currentUser = API.updateUser({ api_key: newKey });
  updateApiKey();
  showToast('success', 'Key Regenerated', 'Your new API key is ready');
}

// UTILITIES
function togglePassword(inputId) {
  const input = document.getElementById(inputId);
  const btn = input.nextElementSibling;
  if (input.type === 'password') {
    input.type = 'text';
    btn.querySelector('i').className = 'fas fa-eye-slash';
  } else {
    input.type = 'password';
    btn.querySelector('i').className = 'fas fa-eye';
  }
}

function formatCurrency(amount) {
  return CONFIG.CURRENCY_SYMBOL + parseFloat(amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatNumber(n) {
  return parseInt(n || 0).toLocaleString('en-US');
}

function formatDate(dateStr) {
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function getCategoryIcon(cat) {
  const icons = { 'Instagram': '\u{1F4F8}', 'TikTok': '\u{1F3B5}', 'YouTube': '\u25B6\uFE0F', 'Twitter/X': '\u{1F426}', 'Facebook': '\u{1F44D}', 'Spotify': '\u{1F3A7}', 'Telegram': '\u2708\uFE0F', 'LinkedIn': '\u{1F4BC}', 'Pinterest': '\u{1F4CC}', 'Snapchat': '\u{1F47B}', 'Discord': '\u{1F3AE}', 'Twitch': '\u{1F3AE}' };
  return icons[cat] || '\u{1F310}';
}

function showLoading(show) {
  document.getElementById('loading-overlay').classList.toggle('hidden', !show);
}

function showToast(type, title, message) {
  const icons = { success: 'fa-check-circle', error: 'fa-times-circle', warning: 'fa-exclamation-triangle', info: 'fa-info-circle' };
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = 'toast ' + type;
  toast.innerHTML =
    '<i class="fas ' + (icons[type] || icons.info) + ' toast-icon"></i>' +
    '<div class="toast-body"><div class="toast-title">' + escapeHtml(title) + '</div><div class="toast-msg">' + escapeHtml(message) + '</div></div>' +
    '<button class="toast-close" onclick="removeToast(this.parentElement)"><i class="fas fa-times"></i></button>';
  container.appendChild(toast);
  setTimeout(() => removeToast(toast), 4000);
}

function removeToast(toast) {
  if (!toast || !toast.parentElement) return;
  toast.classList.add('removing');
  setTimeout(() => toast.remove(), 300);
}

// Expose globals
window.loadServices = loadServices;
window.loadServicesByCategory = loadServicesByCategory;
window.onServiceChange = onServiceChange;
