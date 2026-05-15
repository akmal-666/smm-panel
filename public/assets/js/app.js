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
      showToast('success', 'Welcome back!', 'Hello, ' + currentUser.name + ' 👋');
      setTimeout(() => showDashboard(), 500);
    } else {
      showToast('error', 'Login Gagal', res.error || res.message || 'Email atau password salah');
    }
  } catch (err) {
    showToast('error', 'Error', 'Something went wrong. Please try again.');
  } finally {
    showLoading(false);
  }
}

async function handleRegister(e) {
  e.preventDefault();
  showToast('error', 'Tidak Tersedia', 'Registrasi tidak dibuka. Hubungi admin.');
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
  // Tampilkan menu admin jika role admin
  if (currentUser && currentUser.role === 'admin') {
    document.querySelectorAll('.nav-admin-only').forEach(el => el.classList.remove('hidden'));
    // Grid jadi 3 kolom untuk admin
    document.getElementById('stats-grid-main').classList.add('stats-grid-3');
    // Fetch saldo provider
    loadProviderBalance();
  }
  await loadServices();
  loadOrders();
  updateApiKey();

  // Auto-refresh saldo setiap 60 detik
  if (!CONFIG.DEMO_MODE) {
    setInterval(async () => {
      try {
        currentUser = await API.refreshUser();
        updateBalanceUI();
      } catch { /* silent */ }
    }, 60000);
  }
}

function updateUserUI() {
  if (!currentUser) return;
  const initials = currentUser.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  // topbar avatar (masih ada)
  const topbarAvatar = document.getElementById('topbar-avatar');
  if (topbarAvatar) topbarAvatar.textContent = initials;
  // sidebar avatar (opsional, mungkin sudah dihapus)
  const sidebarAvatar = document.getElementById('sidebar-avatar');
  if (sidebarAvatar) sidebarAvatar.textContent = initials;
  const sidebarName = document.getElementById('sidebar-name');
  if (sidebarName) sidebarName.textContent = currentUser.name;
  const firstName = currentUser.name.split(' ')[0];
  const welcomeTitle = document.getElementById('welcome-title');
  if (welcomeTitle) welcomeTitle.textContent = 'Welcome ' + firstName + ' 👋';
  updateBalanceUI();
}

function updateBalanceUI() {
  if (!currentUser) return;
  const spent = formatCurrency(currentUser.total_spent || 0);
  const orders = currentUser.total_orders || 0;
  const statBalance = document.getElementById('stat-balance');
  if (statBalance) statBalance.textContent = formatCurrency(currentUser.balance || 0);
  document.getElementById('stat-spent').textContent = spent;
  document.getElementById('stat-orders').textContent = orders;
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
    'tickets': 'Tickets', 'api-docs': 'API',
    'admin-services': 'Manage Services', 'admin-users': 'Manage Users',
    'admin-report': 'Laporan Keuangan',
  };
  document.getElementById('breadcrumb-current').textContent = labels[section] || section;
  if (window.innerWidth <= 768) closeSidebar();
  if (section === 'my-orders') loadOrders();
  if (section === 'services') renderServicesTable();
  if (section === 'admin-services') loadAdminServices();
  if (section === 'admin-users') loadUsers();
  if (section === 'admin-report') loadReport();
  return false;
}

function switchOrderTab(tab, btn) {
  document.querySelectorAll('.order-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
  if (btn) btn.classList.add('active');
  const tabEl = document.getElementById('tab-' + tab);
  if (tabEl) tabEl.classList.add('active');
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
  resetLinkInput();
  if (!cat) return;
  allServices.filter(s => s.category === cat).forEach(s => {
    const opt = document.createElement('option');
    opt.value = s.service;
    opt.textContent = s.service + ' | ' + s.name + ' - Rp ' + parseInt(s.rate).toLocaleString('id-ID') + ' per 1000';
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
    resetLinkInput();
    return;
  }
  const service = allServices.find(s => s.service == serviceId);
  if (!service) return;
  document.getElementById('info-min').textContent = service.min;
  document.getElementById('info-max').textContent = formatNumber(service.max);
  document.getElementById('info-rate').textContent = formatCurrency(service.rate) + '/1K';
  document.getElementById('service-info').classList.remove('hidden');

  // Tampilkan harga provider jika tersedia
  const providerRow = document.getElementById('info-provider-row');
  if (service.rate_usd && providerRow) {
    document.getElementById('info-rate-usd').textContent = '$' + parseFloat(service.rate_usd).toFixed(4) + '/1K';
    document.getElementById('info-rate-idr-provider').textContent = '≈ ' + formatCurrency(service.rate_provider_idr) + '/1K';
    document.getElementById('info-kurs').textContent = '(kurs $1 = Rp ' + (service.kurs_usd || 0).toLocaleString('id-ID') + ')';
    providerRow.classList.remove('hidden');
  } else if (providerRow) {
    providerRow.classList.add('hidden');
  }  const qtyEl = document.getElementById('order-qty');
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
  // Update smart link input
  updateLinkInput(service);
  calcOrderTotal();
}

// ── SMART LINK INPUT ──
// Mapping kategori + keyword → prefix URL dan label input
const LINK_CONFIGS = {
  // Instagram
  'instagram': {
    default:  { prefix: 'https://instagram.com/', label: 'Username Instagram', placeholder: 'contoh: bkhrakmal' },
    post:     { prefix: 'https://instagram.com/p/', label: 'Link Post Instagram', placeholder: 'contoh: ABC123xyz' },
    reel:     { prefix: 'https://instagram.com/reel/', label: 'Link Reel Instagram', placeholder: 'contoh: ABC123xyz' },
    story:    { prefix: 'https://instagram.com/', label: 'Username Instagram', placeholder: 'contoh: bkhrakmal' },
    tv:       { prefix: 'https://instagram.com/tv/', label: 'Link IGTV', placeholder: 'contoh: ABC123xyz' },
    comment:  { prefix: 'https://instagram.com/p/', label: 'Link Post Instagram', placeholder: 'contoh: ABC123xyz' },
    like:     { prefix: 'https://instagram.com/p/', label: 'Link Post Instagram', placeholder: 'contoh: ABC123xyz' },
    view:     { prefix: 'https://instagram.com/p/', label: 'Link Post/Reel', placeholder: 'contoh: ABC123xyz' },
    save:     { prefix: 'https://instagram.com/p/', label: 'Link Post Instagram', placeholder: 'contoh: ABC123xyz' },
    impression: { prefix: 'https://instagram.com/p/', label: 'Link Post Instagram', placeholder: 'contoh: ABC123xyz' },
  },
  // TikTok
  'tiktok': {
    default:  { prefix: 'https://tiktok.com/@', label: 'Username TikTok', placeholder: 'contoh: bkhrakmal' },
    video:    { prefix: 'https://tiktok.com/@user/video/', label: 'Link Video TikTok', placeholder: 'contoh: 7123456789' },
    like:     { prefix: 'https://tiktok.com/@user/video/', label: 'Link Video TikTok', placeholder: 'contoh: 7123456789' },
    view:     { prefix: 'https://tiktok.com/@user/video/', label: 'Link Video TikTok', placeholder: 'contoh: 7123456789' },
    comment:  { prefix: 'https://tiktok.com/@user/video/', label: 'Link Video TikTok', placeholder: 'contoh: 7123456789' },
    share:    { prefix: 'https://tiktok.com/@user/video/', label: 'Link Video TikTok', placeholder: 'contoh: 7123456789' },
    live:     { prefix: 'https://tiktok.com/@', label: 'Username TikTok', placeholder: 'contoh: bkhrakmal' },
  },
  // YouTube
  'youtube': {
    default:  { prefix: 'https://youtube.com/channel/', label: 'Channel ID / URL', placeholder: 'contoh: UCxxxxxx atau @channelname' },
    video:    { prefix: 'https://youtube.com/watch?v=', label: 'Video ID YouTube', placeholder: 'contoh: dQw4w9WgXcQ' },
    view:     { prefix: 'https://youtube.com/watch?v=', label: 'Video ID YouTube', placeholder: 'contoh: dQw4w9WgXcQ' },
    like:     { prefix: 'https://youtube.com/watch?v=', label: 'Video ID YouTube', placeholder: 'contoh: dQw4w9WgXcQ' },
    comment:  { prefix: 'https://youtube.com/watch?v=', label: 'Video ID YouTube', placeholder: 'contoh: dQw4w9WgXcQ' },
    subscriber: { prefix: 'https://youtube.com/@', label: 'Channel YouTube', placeholder: 'contoh: channelname' },
    sub:      { prefix: 'https://youtube.com/@', label: 'Channel YouTube', placeholder: 'contoh: channelname' },
    hour:     { prefix: 'https://youtube.com/watch?v=', label: 'Video ID YouTube', placeholder: 'contoh: dQw4w9WgXcQ' },
  },
  // Facebook
  'facebook': {
    default:  { prefix: 'https://facebook.com/', label: 'Username / Page Facebook', placeholder: 'contoh: namapage' },
    post:     { prefix: 'https://facebook.com/', label: 'Link Post Facebook', placeholder: 'contoh: namapage/posts/123' },
    like:     { prefix: 'https://facebook.com/', label: 'Link Post / Page Facebook', placeholder: 'contoh: namapage' },
    video:    { prefix: 'https://facebook.com/', label: 'Link Video Facebook', placeholder: 'contoh: namapage/videos/123' },
    comment:  { prefix: 'https://facebook.com/', label: 'Link Post Facebook', placeholder: 'contoh: namapage/posts/123' },
    share:    { prefix: 'https://facebook.com/', label: 'Link Post Facebook', placeholder: 'contoh: namapage/posts/123' },
  },
  // Twitter/X
  'twitter': {
    default:  { prefix: 'https://x.com/', label: 'Username Twitter/X', placeholder: 'contoh: elonmusk' },
    tweet:    { prefix: 'https://x.com/i/status/', label: 'Tweet ID', placeholder: 'contoh: 1234567890' },
    like:     { prefix: 'https://x.com/i/status/', label: 'Tweet ID', placeholder: 'contoh: 1234567890' },
    retweet:  { prefix: 'https://x.com/i/status/', label: 'Tweet ID', placeholder: 'contoh: 1234567890' },
    reply:    { prefix: 'https://x.com/i/status/', label: 'Tweet ID', placeholder: 'contoh: 1234567890' },
  },
  // Spotify
  'spotify': {
    default:  { prefix: 'https://open.spotify.com/track/', label: 'Track ID Spotify', placeholder: 'contoh: 4uLU6hMCjMI75M1A2tKUQC' },
    play:     { prefix: 'https://open.spotify.com/track/', label: 'Track ID Spotify', placeholder: 'contoh: 4uLU6hMCjMI75M1A2tKUQC' },
    follower: { prefix: 'https://open.spotify.com/artist/', label: 'Artist ID Spotify', placeholder: 'contoh: 0TnOYISbd1XYRBk9myaseg' },
    playlist: { prefix: 'https://open.spotify.com/playlist/', label: 'Playlist ID Spotify', placeholder: 'contoh: 37i9dQZF1DXcBWIGoYBM5M' },
  },
  // Telegram
  'telegram': {
    default:  { prefix: 'https://t.me/', label: 'Username Telegram', placeholder: 'contoh: namagroup' },
    member:   { prefix: 'https://t.me/', label: 'Username Channel/Group', placeholder: 'contoh: namagroup' },
    view:     { prefix: 'https://t.me/', label: 'Link Post Telegram', placeholder: 'contoh: namagroup/123' },
    reaction: { prefix: 'https://t.me/', label: 'Link Post Telegram', placeholder: 'contoh: namagroup/123' },
  },
  // Threads
  'threads': {
    default:  { prefix: 'https://threads.net/@', label: 'Username Threads', placeholder: 'contoh: bkhrakmal' },
  },
  // LinkedIn
  'linkedin': {
    default:  { prefix: 'https://linkedin.com/in/', label: 'Profile LinkedIn', placeholder: 'contoh: namaprofile' },
  },
};

function getLinkConfig(service) {
  const cat = (service.category || '').toLowerCase();
  const name = (service.name || '').toLowerCase();

  // Cari platform yang cocok
  let platformKey = null;
  for (const key of Object.keys(LINK_CONFIGS)) {
    if (cat.includes(key) || name.includes(key)) {
      platformKey = key;
      break;
    }
  }
  if (!platformKey) return null;

  const configs = LINK_CONFIGS[platformKey];

  // Cari tipe yang cocok berdasarkan nama service
  for (const [type, cfg] of Object.entries(configs)) {
    if (type === 'default') continue;
    if (name.includes(type)) return cfg;
  }

  return configs.default;
}

function updateLinkInput(service) {
  const cfg = getLinkConfig(service);
  const prefixEl = document.getElementById('link-prefix');
  const inputEl = document.getElementById('order-link');
  const labelEl = document.getElementById('link-label');
  const hintEl = document.getElementById('link-hint');

  // Reset value saat ganti service
  inputEl.value = '';

  if (cfg) {
    prefixEl.textContent = cfg.prefix;
    prefixEl.classList.remove('hidden');
    inputEl.placeholder = cfg.placeholder;
    inputEl.type = 'text';
    labelEl.textContent = cfg.label;
    hintEl.textContent = 'URL lengkap: ' + cfg.prefix + cfg.placeholder.replace('contoh: ', '');
  } else {
    // Fallback: input URL lengkap
    prefixEl.classList.add('hidden');
    prefixEl.textContent = '';
    inputEl.placeholder = 'Masukkan URL lengkap...';
    inputEl.type = 'url';
    labelEl.textContent = 'Link';
    hintEl.textContent = '';
  }
}

function resetLinkInput() {
  const prefixEl = document.getElementById('link-prefix');
  const inputEl = document.getElementById('order-link');
  const labelEl = document.getElementById('link-label');
  const hintEl = document.getElementById('link-hint');
  prefixEl.classList.add('hidden');
  prefixEl.textContent = '';
  inputEl.value = '';
  inputEl.placeholder = 'Masukkan link lengkap...';
  inputEl.type = 'text';
  labelEl.textContent = 'Link';
  hintEl.textContent = '';
}

function getFullLink() {
  const prefixEl = document.getElementById('link-prefix');
  const inputEl = document.getElementById('order-link');
  const val = inputEl.value.trim();
  if (!val) return '';
  // Kalau user sudah input URL lengkap (mulai http), pakai langsung
  if (val.startsWith('http://') || val.startsWith('https://')) return val;
  // Kalau prefix tersembunyi, return as-is
  if (prefixEl.classList.contains('hidden')) return val;
  // Gabungkan prefix + input
  return prefixEl.textContent + val;
}

function calcOrderTotal() {
  const serviceId = document.getElementById('service-select').value;
  const qty = parseInt(document.getElementById('order-qty').value) || 0;
  if (!serviceId || !qty) { document.getElementById('order-total').textContent = 'Rp 0'; return; }
  const service = allServices.find(s => s.service == serviceId);
  if (!service) return;
  const total = Math.ceil(parseFloat(service.rate) * qty / 1000);
  document.getElementById('order-total').textContent = formatCurrency(total);
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
    '<td><strong>' + formatCurrency(s.rate) + '</strong></td>' +
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
  const link = getFullLink();
  const qty = parseInt(document.getElementById('order-qty').value);
  if (!serviceId) return showToast('warning', 'Missing Field', 'Please choose a service');
  if (!link) return showToast('warning', 'Missing Field', 'Please enter a link');
  if (!qty || qty < 1) return showToast('warning', 'Missing Field', 'Please enter a valid quantity');
  const service = allServices.find(s => s.service == serviceId);
  if (service) {
    if (qty < service.min) return showToast('warning', 'Invalid Quantity', 'Minimum is ' + service.min);
    if (qty > service.max) return showToast('warning', 'Invalid Quantity', 'Maximum is ' + formatNumber(service.max));
    const total = Math.ceil(parseFloat(service.rate) * qty / 1000);
    if (currentUser && total > currentUser.balance) {
      return showToast('error', 'Saldo Tidak Cukup', 'Dibutuhkan ' + formatCurrency(total) + ' tapi saldo kamu ' + formatCurrency(currentUser.balance));
    }
  }
  showLoading(true);
  try {
    const res = await API.placeOrder(serviceId, link, qty, service ? service.name : '');
    if (res.order || res.success) {
      // Refresh dari server agar saldo akurat
      try { currentUser = await API.refreshUser(); } catch { currentUser = API.getUser(); }
      updateBalanceUI();
      showToast('success', 'Order Placed! 🎉', 'Order #' + res.order + ' berhasil dikirim');
      document.getElementById('order-link').value = '';
      document.getElementById('order-qty').value = '';
      document.getElementById('order-total').textContent = 'Rp 0';
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
  // Refresh dari server setelah bulk order
  try { currentUser = await API.refreshUser(); } catch { currentUser = API.getUser(); }
  updateBalanceUI();
  showToast('success', 'Bulk Order Done', success + ' placed, ' + failed + ' failed');
  if (success > 0) document.getElementById('bulk-input').value = '';
}

async function loadOrders() {
  const tbody = document.getElementById('orders-tbody');
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="9" class="empty-state"><i class="fas fa-spinner fa-spin"></i><br/>Loading...</td></tr>';
  try {
    allOrders = await API.getOrders();
    renderOrdersTable(allOrders);
    // Setelah render, fetch status realtime dari AsokaPanel untuk order yang aktif
    syncOrderStatuses();
  } catch (e) {
    tbody.innerHTML = '<tr><td colspan="9" class="empty-state"><i class="fas fa-exclamation-circle"></i><br/>Failed to load orders</td></tr>';
  }
}

// Extract username/ID yang mudah dibaca dari URL
function extractTarget(link) {
  if (!link) return '-';
  try {
    const url = new URL(link);
    const host = url.hostname.replace('www.', '');
    const path = url.pathname.replace(/\/$/, '');

    // Instagram: /username atau /p/postid atau /reel/id
    if (host.includes('instagram.com')) {
      const parts = path.split('/').filter(Boolean);
      if (parts[0] === 'p' || parts[0] === 'reel' || parts[0] === 'tv') return parts[0] + '/' + (parts[1] || '');
      return '@' + (parts[0] || path);
    }
    // TikTok: /@username atau /@user/video/id
    if (host.includes('tiktok.com')) {
      const parts = path.split('/').filter(Boolean);
      if (parts[1] === 'video') return '@' + parts[0].replace('@','') + '/video/' + (parts[2] || '');
      return parts[0] || path;
    }
    // YouTube: /watch?v=id atau /@channel
    if (host.includes('youtube.com')) {
      if (url.searchParams.get('v')) return 'video/' + url.searchParams.get('v');
      const parts = path.split('/').filter(Boolean);
      return parts[0] || path;
    }
    // Twitter/X
    if (host.includes('x.com') || host.includes('twitter.com')) {
      const parts = path.split('/').filter(Boolean);
      if (parts[1] === 'status') return '@' + parts[0] + '/status/' + (parts[2] || '');
      return '@' + (parts[0] || path);
    }
    // Telegram
    if (host.includes('t.me')) {
      return path.replace('/', '') || path;
    }
    // Spotify
    if (host.includes('spotify.com')) {
      const parts = path.split('/').filter(Boolean);
      return parts.slice(-2).join('/');
    }
    // Default: ambil path terakhir
    const parts = path.split('/').filter(Boolean);
    return parts[parts.length - 1] || link;
  } catch {
    // Bukan URL valid, return as-is (mungkin sudah username)
    return link.length > 30 ? link.slice(0, 30) + '…' : link;
  }
}

function renderOrdersTable(orders) {
  const tbody = document.getElementById('orders-tbody');
  if (!orders.length) {
    tbody.innerHTML = '<tr><td colspan="9" class="empty-state"><i class="fas fa-inbox"></i><br/>No orders yet</td></tr>';
    return;
  }
  tbody.innerHTML = orders.map(o => {
    // DB fields: id, provider_order_id, service_id, service_name, link, quantity, charge, start_count, remains, status
    const orderId = o.provider_order_id || o.id || '-';
    const sName = o.service_name || (allServices.find(s => s.service == o.service_id)?.name) || 'Service #' + (o.service_id || '-');
    const sCategory = allServices.find(s => s.service == o.service_id)?.category || '';
    const status = (o.status || 'pending').toLowerCase();
    const target = extractTarget(o.link);
    const startId = 'start-' + (o.provider_order_id || o.id);
    const remainsId = 'remains-' + (o.provider_order_id || o.id);
    const statusId = 'status-' + (o.provider_order_id || o.id);
    return '<tr>' +
      '<td><strong>#' + escapeHtml(String(orderId)) + '</strong></td>' +
      '<td>' + (sCategory ? '<span class="status-badge status-processing" style="font-size:.7rem">' + escapeHtml(sCategory) + '</span>' : '-') + '</td>' +
      '<td style="max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="' + escapeHtml(sName) + '">' + escapeHtml(sName) + '</td>' +
      '<td><span class="target-cell" title="' + escapeHtml(o.link || '') + '">' + escapeHtml(target) + '</span></td>' +
      '<td>' + formatNumber(o.quantity) + '</td>' +
      '<td><strong>' + formatCurrency(o.charge || 0) + '</strong></td>' +
      '<td id="' + startId + '">' + formatNumber(o.start_count || 0) + '</td>' +
      '<td id="' + remainsId + '">' + formatNumber(o.remains || 0) + '</td>' +
      '<td id="' + statusId + '"><span class="status-badge status-' + status + '">' + (o.status || 'Pending') + '</span></td>' +
      '</tr>';
  }).join('');
}

// Sync semua order aktif dari AsokaPanel (admin only)
async function syncAllOrders() {
  const btn = document.getElementById('btn-sync-orders');
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Syncing...'; }
  try {
    const res = await API._fetch('/api/admin/sync', { method: 'POST' });
    if (res.success) {
      showToast('success', 'Sync Selesai', res.message);
      await loadOrders();
    } else {
      showToast('error', 'Sync Gagal', res.error || 'Terjadi kesalahan');
    }
  } catch (e) {
    showToast('error', 'Error', e.message);
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-cloud-download-alt"></i> Sync Status'; }
  }
}

// Sync status realtime dari AsokaPanel untuk semua order yang belum selesai
async function syncOrderStatuses() {
  if (CONFIG.DEMO_MODE) return;
  // Ambil order yang perlu di-sync (bukan Completed/Cancelled)
  const activeOrders = allOrders.filter(o =>
    o.provider_order_id &&
    !['completed', 'cancelled', 'partial'].includes((o.status || '').toLowerCase())
  );
  if (!activeOrders.length) return;

  // Batch max 100 order IDs sekaligus
  const ids = activeOrders.map(o => o.provider_order_id).slice(0, 100);
  try {
    const res = await API._fetch('/api/proxy', {
      method: 'POST',
      body: JSON.stringify({ action: 'status', orders: ids }),
    });
    if (!res || res.error) return;

    // Update DOM langsung tanpa re-render seluruh tabel
    for (const [orderId, data] of Object.entries(res)) {
      if (data.error) continue;
      const startEl = document.getElementById('start-' + orderId);
      const remainsEl = document.getElementById('remains-' + orderId);
      const statusEl = document.getElementById('status-' + orderId);
      if (startEl) startEl.textContent = formatNumber(data.start_count || 0);
      if (remainsEl) remainsEl.textContent = formatNumber(data.remains || 0);
      if (statusEl) {
        const st = (data.status || 'Pending').toLowerCase();
        statusEl.innerHTML = '<span class="status-badge status-' + st + '">' + (data.status || 'Pending') + '</span>';
      }
      // Update data lokal juga
      const order = allOrders.find(o => o.provider_order_id == orderId);
      if (order) {
        order.start_count = data.start_count || 0;
        order.remains = data.remains || 0;
        order.status = data.status || order.status;
      }
    }
  } catch (e) {
    // Silent fail — data dari DB tetap tampil
  }
}

function filterOrders() {
  const search = document.getElementById('orders-search').value.toLowerCase();
  const status = document.getElementById('orders-filter').value.toLowerCase();
  let filtered = allOrders;
  if (search) filtered = filtered.filter(o =>
    String(o.provider_order_id || o.id || '').includes(search) ||
    String(o.service_id || '').includes(search) ||
    (o.service_name || '').toLowerCase().includes(search) ||
    (o.link || '').toLowerCase().includes(search)
  );
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
        '<div class="result-row"><span class="result-label">Charge</span><span class="result-value">' + formatCurrency(res.charge || 0) + '</span></div>';
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
  if (!amount || amount < CONFIG.MIN_DEPOSIT) return showToast('warning', 'Jumlah Tidak Valid', 'Minimum deposit adalah ' + formatCurrency(CONFIG.MIN_DEPOSIT));
  showLoading(true);
  try {
    const res = await API.addFunds(amount);
    if (res.success) {
      if (!CONFIG.DEMO_MODE) currentUser = await API.refreshUser();
      else currentUser = API.getUser();
      updateBalanceUI();
      loadTransactions();
      document.getElementById('fund-amount').value = '';
      showToast('success', 'Saldo Ditambahkan!', formatCurrency(amount) + ' berhasil ditambahkan ke saldo kamu');
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
      '<span class="transaction-amount ' + t.type + '">' + (t.type === 'credit' ? '+' : '-') + formatCurrency(t.amount) + '</span>' +
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
  if (CONFIG.CURRENCY === 'IDR') {
    return 'Rp ' + parseInt(amount || 0).toLocaleString('id-ID');
  }
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

// ── ADMIN: MANAGE SERVICES ──
let allAdminServices = [];   // service aktif di DB lokal
let allProviderServices = []; // semua service dari provider

async function loadAdminServices() {
  const tbody = document.getElementById('admin-active-tbody');
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="9" class="empty-state"><i class="fas fa-spinner fa-spin"></i><br/>Loading...</td></tr>';
  try {
    const res = await API.adminGetServices();
    if (!res.success) throw new Error(res.error || 'Gagal load');
    allAdminServices = res.services || [];
    renderAdminActiveTable();
  } catch (e) {
    tbody.innerHTML = '<tr><td colspan="8" class="empty-state"><i class="fas fa-exclamation-circle"></i><br/>' + escapeHtml(e.message) + '</td></tr>';
  }
}

function renderAdminActiveTable() {
  const search = (document.getElementById('admin-active-search')?.value || '').toLowerCase();
  let list = allAdminServices;
  if (search) list = list.filter(s => s.name.toLowerCase().includes(search) || String(s.service_id).includes(search));
  const tbody = document.getElementById('admin-active-tbody');
  if (!list.length) {
    tbody.innerHTML = '<tr><td colspan="8" class="empty-state"><i class="fas fa-inbox"></i><br/>Belum ada service aktif. Aktifkan dari tabel provider di bawah.</td></tr>';
    return;
  }
  tbody.innerHTML = list.map(s => {
    const activeClass = s.is_active ? 'status-completed' : 'status-cancelled';
    const activeLabel = s.is_active ? '✅ Aktif' : '❌ Nonaktif';
    return '<tr>' +
      '<td><strong>' + escapeHtml(String(s.service_id)) + '</strong></td>' +
      '<td style="word-break:break-word;white-space:normal">' + escapeHtml(s.name) + '</td>' +
      '<td><span class="status-badge status-processing">' + escapeHtml(s.category) + '</span></td>' +
      '<td><strong>' + formatCurrency(s.rate) + '</strong></td>' +
      '<td>' + formatNumber(s.min_order) + '</td>' +
      '<td>' + formatNumber(s.max_order) + '</td>' +
      '<td><span class="status-badge ' + activeClass + '">' + activeLabel + '</span></td>' +
      '<td style="white-space:nowrap">' +
        '<button class="btn-warning" style="margin-right:.375rem" onclick="openEditModal(' + s.id + ')">' +
          '<i class="fas fa-edit"></i> Edit' +
        '</button>' +
        '<button class="btn-outline" style="padding:.3rem .7rem;font-size:.75rem;color:var(--danger);border-color:var(--danger)" onclick="deleteAdminService(' + s.id + ', \'' + escapeHtml(s.name).replace(/'/g, "\\'") + '\')">' +
          '<i class="fas fa-trash"></i>' +
        '</button>' +
      '</td>' +
      '</tr>';
  }).join('');
}

function filterAdminActive() { renderAdminActiveTable(); }

async function loadProviderServices() {
  const tbody = document.getElementById('admin-provider-tbody');
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="6" class="empty-state"><i class="fas fa-spinner fa-spin"></i><br/>Mengambil data dari provider...</td></tr>';
  try {
    const data = await API._fetch('/api/proxy', {
      method: 'POST',
      body: JSON.stringify({ action: 'services_all' }),
    });
    if (data.error) throw new Error(data.error);
    allProviderServices = Array.isArray(data) ? data : [];
    renderProviderTable();
    populateProviderCatFilter();
  } catch (e) {
    tbody.innerHTML = '<tr><td colspan="6" class="empty-state"><i class="fas fa-exclamation-circle"></i><br/>' + escapeHtml(e.message) + '</td></tr>';
  }
}

function populateProviderCatFilter() {
  const sel = document.getElementById('admin-provider-cat');
  if (!sel) return;
  const cats = [...new Set(allProviderServices.map(s => s.category))].sort();
  sel.innerHTML = '<option value="">Semua Kategori</option>';
  cats.forEach(c => { const o = document.createElement('option'); o.value = c; o.textContent = c; sel.appendChild(o); });
}

function renderProviderTable() {
  const search = (document.getElementById('admin-provider-search')?.value || '').toLowerCase();
  const cat = document.getElementById('admin-provider-cat')?.value || '';
  let list = allProviderServices;
  if (search) list = list.filter(s => s.name.toLowerCase().includes(search) || String(s.service).includes(search));
  if (cat) list = list.filter(s => s.category === cat);
  const tbody = document.getElementById('admin-provider-tbody');
  if (!list.length) {
    tbody.innerHTML = '<tr><td colspan="6" class="empty-state"><i class="fas fa-search"></i><br/>Tidak ada service ditemukan</td></tr>';
    return;
  }
  tbody.innerHTML = list.map(s => {
    const isActive = s.is_active === 1;
    const statusBadge = isActive
      ? '<span class="status-badge status-completed">✅ Aktif</span>'
      : '<span class="status-badge status-cancelled">❌ Belum aktif</span>';
    const actionBtn = isActive
      ? '<button class="btn-warning" onclick="openEditModalFromProvider(\'' + s.service + '\')">' +
          '<i class="fas fa-edit"></i> Edit' +
        '</button>'
      : '<button class="btn-success" onclick="openActivateModal(\'' + s.service + '\')">' +
          '<i class="fas fa-plus"></i> Aktifkan' +
        '</button>';
    return '<tr>' +
      '<td><strong>' + escapeHtml(String(s.service)) + '</strong></td>' +
      '<td style="word-break:break-word;white-space:normal">' + escapeHtml(s.name) + '</td>' +
      '<td><span class="status-badge status-processing">' + escapeHtml(s.category) + '</span></td>' +
      '<td>' + formatCurrency(s.rate_default_idr || 0) + '<br/><small style="color:var(--gray-400)">$' + parseFloat(s.rate_provider_usd || 0).toFixed(4) + '/1K</small></td>' +
      '<td>' + statusBadge + '</td>' +
      '<td>' + actionBtn + '</td>' +
      '</tr>';
  }).join('');
}

function filterAdminProvider() { renderProviderTable(); }

// Buka modal untuk aktifkan service baru dari provider
function openActivateModal(serviceId) {
  const s = allProviderServices.find(x => String(x.service) === String(serviceId));
  if (!s) return;
  document.getElementById('modal-db-id').value = '';
  document.getElementById('modal-service-id').value = s.service;
  document.getElementById('modal-svc-id-display').value = s.service;
  document.getElementById('modal-svc-name').value = s.name;
  document.getElementById('modal-svc-category').value = s.category;
  document.getElementById('modal-svc-rate').value = s.rate_default_idr || '';
  document.getElementById('modal-svc-min').value = s.min_order || 10;
  document.getElementById('modal-svc-max').value = s.max_order || 100000;
  document.getElementById('modal-svc-active').value = '1';
  document.getElementById('modal-title').textContent = 'Aktifkan Service #' + s.service;
  document.getElementById('modal-save-text').textContent = 'Aktifkan Service';
  updateModalPreview();
  document.getElementById('admin-service-modal').classList.remove('hidden');
}

// Buka modal edit dari tabel provider (service sudah aktif)
function openEditModalFromProvider(serviceId) {
  const s = allProviderServices.find(x => String(x.service) === String(serviceId));
  if (!s || !s.db_id) return;
  openEditModal(s.db_id);
}

// Buka modal edit dari tabel aktif
function openEditModal(dbId) {
  const s = allAdminServices.find(x => x.id === dbId);
  if (!s) return;
  document.getElementById('modal-db-id').value = s.id;
  document.getElementById('modal-service-id').value = s.service_id;
  document.getElementById('modal-svc-id-display').value = s.service_id;
  document.getElementById('modal-svc-name').value = s.name;
  document.getElementById('modal-svc-category').value = s.category;
  document.getElementById('modal-svc-rate').value = s.rate;
  document.getElementById('modal-svc-min').value = s.min_order;
  document.getElementById('modal-svc-max').value = s.max_order;
  document.getElementById('modal-svc-active').value = s.is_active ? '1' : '0';
  document.getElementById('modal-title').textContent = 'Edit Service #' + s.service_id;
  document.getElementById('modal-save-text').textContent = 'Simpan Perubahan';
  updateModalPreview();
  document.getElementById('admin-service-modal').classList.remove('hidden');
}

function closeServiceModal(e) {
  if (e && e.target !== document.getElementById('admin-service-modal')) return;
  document.getElementById('admin-service-modal').classList.add('hidden');
}

function updateModalPreview() {
  const rate = parseFloat(document.getElementById('modal-svc-rate')?.value) || 0;
  const preview = document.getElementById('modal-rate-preview');
  if (!preview) return;
  preview.textContent = rate > 0 ? '→ 1000 unit = ' + formatCurrency(rate) : '';
}

async function saveServiceModal() {
  const dbId = document.getElementById('modal-db-id').value;
  const service_id = document.getElementById('modal-service-id').value;
  const name = document.getElementById('modal-svc-name').value.trim();
  const category = document.getElementById('modal-svc-category').value.trim();
  const rate = parseFloat(document.getElementById('modal-svc-rate').value);
  const min_order = parseInt(document.getElementById('modal-svc-min').value) || 10;
  const max_order = parseInt(document.getElementById('modal-svc-max').value) || 100000;
  const is_active = document.getElementById('modal-svc-active').value === '1';

  if (!name) return showToast('warning', 'Validasi', 'Nama service wajib diisi');
  if (!category) return showToast('warning', 'Validasi', 'Kategori wajib diisi');
  if (isNaN(rate) || rate < 0) return showToast('warning', 'Validasi', 'Harga tidak valid');
  if (max_order < min_order) return showToast('warning', 'Validasi', 'Max order harus lebih besar dari min');

  showLoading(true);
  try {
    let res;
    if (dbId) {
      res = await API.adminUpdateService({ id: parseInt(dbId), service_id, name, category, rate, min_order, max_order, is_active });
    } else {
      res = await API.adminAddService({ service_id, name, category, rate, min_order, max_order, is_active });
    }
    if (res.success) {
      showToast('success', 'Berhasil!', res.message);
      document.getElementById('admin-service-modal').classList.add('hidden');
      await loadAdminServices();
      await loadServices(); // reload untuk user juga
      // Update provider table status jika sudah di-load
      if (allProviderServices.length) await loadProviderServices();
    } else {
      showToast('error', 'Gagal', res.error || 'Terjadi kesalahan');
    }
  } catch (e) {
    showToast('error', 'Error', e.message);
  } finally {
    showLoading(false);
  }
}

async function deleteAdminService(id, name) {
  if (!confirm('Hapus service "' + name + '"?\n\nService ini tidak akan bisa diorder oleh user.')) return;
  showLoading(true);
  try {
    const res = await API.adminDeleteService(id);
    if (res.success) {
      showToast('success', 'Dihapus', '"' + name + '" berhasil dihapus');
      await loadAdminServices();
      await loadServices();
      if (allProviderServices.length) await loadProviderServices();
    } else {
      showToast('error', 'Gagal', res.error || 'Tidak bisa menghapus');
    }
  } catch (e) {
    showToast('error', 'Error', e.message);
  } finally {
    showLoading(false);
  }
}

// ── ADMIN: MANAGE USERS ──
let allUsers = [];

async function loadUsers() {
  const tbody = document.getElementById('users-tbody');
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="7" class="empty-state"><i class="fas fa-spinner fa-spin"></i><br/>Loading...</td></tr>';
  try {
    const res = await API.adminGetUsers();
    if (!res.success) throw new Error(res.error || 'Gagal load');
    allUsers = res.users || [];
    renderUsersTable();
  } catch (e) {
    tbody.innerHTML = '<tr><td colspan="7" class="empty-state"><i class="fas fa-exclamation-circle"></i><br/>' + escapeHtml(e.message) + '</td></tr>';
  }
}

function renderUsersTable() {
  const search = (document.getElementById('users-search')?.value || '').toLowerCase();
  let list = allUsers;
  if (search) list = list.filter(u => u.name.toLowerCase().includes(search) || u.email.toLowerCase().includes(search));
  const tbody = document.getElementById('users-tbody');
  if (!list.length) {
    tbody.innerHTML = '<tr><td colspan="7" class="empty-state"><i class="fas fa-users"></i><br/>Belum ada user</td></tr>';
    return;
  }
  tbody.innerHTML = list.map(u => {
    const roleClass = u.role === 'admin' ? 'status-completed' : 'status-processing';
    return '<tr>' +
      '<td><strong>#' + u.id + '</strong></td>' +
      '<td>' + escapeHtml(u.name) + '</td>' +
      '<td>' + escapeHtml(u.email) + '</td>' +
      '<td><strong>' + formatCurrency(u.balance || 0) + '</strong></td>' +
      '<td>' + formatNumber(u.total_orders || 0) + '</td>' +
      '<td><span class="status-badge ' + roleClass + '">' + u.role + '</span></td>' +
      '<td style="white-space:nowrap">' +
        (u.role !== 'admin' ? '<button class="btn-success" style="margin-right:.375rem" onclick="openTopupModal(' + u.id + ',\'' + escapeHtml(u.name).replace(/'/g, "\\'") + '\')">' +
          '<i class="fas fa-plus-circle"></i> Top Up' +
        '</button>' : '') +
        (u.role !== 'admin' ? '<button class="btn-outline" style="padding:.3rem .7rem;font-size:.75rem;color:var(--danger);border-color:var(--danger)" onclick="deleteUser(' + u.id + ',\'' + escapeHtml(u.name).replace(/'/g, "\\'") + '\')">' +
          '<i class="fas fa-trash"></i>' +
        '</button>' : '<span style="color:var(--gray-400);font-size:.75rem">—</span>') +
      '</td>' +
      '</tr>';
  }).join('');
}

function filterUsers() { renderUsersTable(); }

async function createUser() {
  const name = document.getElementById('new-user-name').value.trim();
  const email = document.getElementById('new-user-email').value.trim();
  const password = document.getElementById('new-user-password').value;
  const balance = parseFloat(document.getElementById('new-user-balance').value) || 0;

  if (!name) return showToast('warning', 'Validasi', 'Nama wajib diisi');
  if (!email) return showToast('warning', 'Validasi', 'Email wajib diisi');
  if (!password || password.length < 8) return showToast('warning', 'Validasi', 'Password minimal 8 karakter');

  showLoading(true);
  try {
    const res = await API.adminCreateUser({ name, email, password, balance });
    if (res.success) {
      showToast('success', 'Berhasil!', 'Akun untuk ' + name + ' berhasil dibuat');
      document.getElementById('new-user-name').value = '';
      document.getElementById('new-user-email').value = '';
      document.getElementById('new-user-password').value = '';
      document.getElementById('new-user-balance').value = '0';
      await loadUsers();
    } else {
      showToast('error', 'Gagal', res.error || 'Tidak bisa membuat user');
    }
  } catch (e) {
    showToast('error', 'Error', e.message);
  } finally {
    showLoading(false);
  }
}

function openTopupModal(userId, userName) {
  document.getElementById('topup-user-id').value = userId;
  document.getElementById('topup-user-name').textContent = 'User: ' + userName;
  document.getElementById('topup-amount').value = '';
  document.getElementById('topup-modal').classList.remove('hidden');
}

function closeTopupModal(e) {
  if (e && e.target !== document.getElementById('topup-modal')) return;
  document.getElementById('topup-modal').classList.add('hidden');
}

async function doTopup() {
  const userId = document.getElementById('topup-user-id').value;
  const amount = parseFloat(document.getElementById('topup-amount').value);
  if (!amount || amount < 1000) return showToast('warning', 'Validasi', 'Jumlah minimal Rp 1.000');
  showLoading(true);
  try {
    const res = await API.adminUpdateUser({ id: parseInt(userId), action: 'topup', amount });
    if (res.success) {
      showToast('success', 'Top Up Berhasil!', formatCurrency(amount) + ' ditambahkan ke saldo user');
      document.getElementById('topup-modal').classList.add('hidden');
      await loadUsers();
    } else {
      showToast('error', 'Gagal', res.error || 'Top up gagal');
    }
  } catch (e) {
    showToast('error', 'Error', e.message);
  } finally {
    showLoading(false);
  }
}

async function deleteUser(id, name) {
  if (!confirm('Hapus user "' + name + '"?\n\nSemua data user ini akan dihapus.')) return;
  showLoading(true);
  try {
    const res = await API.adminDeleteUser(id);
    if (res.success) {
      showToast('success', 'Dihapus', '"' + name + '" berhasil dihapus');
      await loadUsers();
    } else {
      showToast('error', 'Gagal', res.error || 'Tidak bisa menghapus');
    }
  } catch (e) {
    showToast('error', 'Error', e.message);
  } finally {
    showLoading(false);
  }
}

// ── PROVIDER BALANCE ──
async function loadProviderBalance() {
  const el = document.getElementById('stat-provider-balance');
  if (!el) return;
  try {
    const [balData, kursData] = await Promise.all([
      API._fetch('/api/proxy', { method: 'POST', body: JSON.stringify({ action: 'balance' }) }),
      fetch('https://api.frankfurter.app/latest?from=USD&to=IDR').then(r => r.json()).catch(() => null),
    ]);
    if (balData.balance !== undefined) {
      const usd = parseFloat(balData.balance) || 0;
      const kurs = kursData?.rates?.IDR || 16300;
      const idr = Math.round(usd * kurs);
      el.innerHTML = formatCurrency(idr) + '<br><small style="color:var(--gray-400);font-size:.7rem">(' + usd.toFixed(2) + ' USD)</small>';
    } else {
      el.textContent = 'Error';
    }
  } catch (e) {
    el.textContent = 'Error';
  }
}

// Fix icon di input-wrapper — pastikan icon tidak overlap
function fixInputIcons() {
  document.querySelectorAll('.input-wrapper .input-icon').forEach(icon => {
    icon.style.position = 'absolute';
    icon.style.left = '.875rem';
    icon.style.pointerEvents = 'none';
    icon.style.color = 'var(--gray-400)';
    const input = icon.nextElementSibling;
    if (input) input.style.paddingLeft = '2.5rem';
  });
}
document.addEventListener('DOMContentLoaded', fixInputIcons);

// ── ADMIN: LAPORAN KEUANGAN ──
let reportPeriod = 'month';

function setReportPeriod(period, btn) {
  reportPeriod = period;
  document.querySelectorAll('.period-btn').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  const customRange = document.getElementById('custom-date-range');
  if (period === 'custom') {
    customRange.classList.remove('hidden');
    // Set default: bulan ini
    const now = new Date();
    const from = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
    const to = now.toISOString().split('T')[0];
    if (!document.getElementById('report-from').value) document.getElementById('report-from').value = from;
    if (!document.getElementById('report-to').value) document.getElementById('report-to').value = to;
  } else {
    customRange.classList.add('hidden');
    loadReport();
  }
}

async function loadReport() {
  // Tampilkan loading di semua section
  ['rpt-revenue','rpt-orders','rpt-users','rpt-topup'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
  });

  let url = '/api/admin/report?period=' + reportPeriod;
  if (reportPeriod === 'custom') {
    const from = document.getElementById('report-from').value;
    const to = document.getElementById('report-to').value;
    if (!from || !to) return showToast('warning', 'Validasi', 'Pilih tanggal dari dan sampai');
    url += '&from=' + from + '&to=' + to;
  }

  try {
    const data = await API._fetch(url);
    if (!data.success) throw new Error(data.error || 'Gagal load laporan');
    renderReport(data);
  } catch (e) {
    showToast('error', 'Error', e.message);
  }
}

function renderReport(data) {
  const { summary, daily_revenue, top_users, top_services, balance_snapshot, period } = data;

  // Period label
  const label = document.getElementById('report-period-label');
  if (label) label.textContent = 'Periode: ' + period.from + ' s/d ' + period.to;

  // Summary cards
  document.getElementById('rpt-revenue').textContent = formatCurrency(summary.total_revenue || 0);
  document.getElementById('rpt-orders').textContent = formatNumber(summary.total_orders || 0);
  document.getElementById('rpt-users').textContent = formatNumber(summary.active_users || 0);
  document.getElementById('rpt-topup').textContent = formatCurrency(summary.total_topup || 0);

  // Status breakdown
  const statusEl = document.getElementById('rpt-status-breakdown');
  const total = summary.total_orders || 1;
  const statuses = [
    { label: 'Completed',  count: summary.orders_completed || 0,  revenue: summary.revenue_completed || 0,  color: '#10b981' },
    { label: 'Processing', count: summary.orders_processing || 0, revenue: summary.revenue_processing || 0, color: '#2563eb' },
    { label: 'Pending',    count: summary.orders_pending || 0,    revenue: summary.revenue_pending || 0,    color: '#f59e0b' },
    { label: 'Cancelled',  count: summary.orders_cancelled || 0,  revenue: summary.revenue_cancelled || 0,  color: '#ef4444' },
  ];
  statusEl.innerHTML = statuses.map(s => {
    const pct = Math.round((s.count / total) * 100);
    return '<div class="status-row">' +
      '<span class="status-row-label">' + s.label + '</span>' +
      '<div class="status-row-bar-wrap"><div class="status-row-bar" style="width:' + pct + '%;background:' + s.color + '"></div></div>' +
      '<span class="status-row-val">' + formatNumber(s.count) + ' (' + pct + '%)</span>' +
      '</div>' +
      '<div style="font-size:.75rem;color:var(--gray-400);margin-left:108px;margin-top:-.25rem;margin-bottom:.25rem">' + formatCurrency(s.revenue) + '</div>';
  }).join('');

  // Balance snapshot
  const balEl = document.getElementById('rpt-balance-snapshot');
  balEl.innerHTML =
    '<div class="status-row"><span class="status-row-label">Total User</span><span class="status-row-val" style="width:auto">' + formatNumber(balance_snapshot.user_count) + ' user</span></div>' +
    '<div class="status-row" style="margin-top:.5rem"><span class="status-row-label">Total Saldo</span><span class="status-row-val" style="width:auto;color:var(--success);font-size:1rem">' + formatCurrency(balance_snapshot.total_balance) + '</span></div>' +
    '<p style="font-size:.75rem;color:var(--gray-400);margin-top:.75rem"><i class="fas fa-info-circle"></i> Snapshot saldo semua user saat ini (bukan dalam periode)</p>';

  // Chart harian
  renderDailyChart(daily_revenue || []);

  // Top users
  const tuBody = document.getElementById('rpt-top-users');
  if (!top_users.length) {
    tuBody.innerHTML = '<tr><td colspan="4" class="empty-state">Tidak ada data</td></tr>';
  } else {
    tuBody.innerHTML = top_users.map((u, i) =>
      '<tr>' +
      '<td><strong>' + (i + 1) + '</strong></td>' +
      '<td>' + escapeHtml(u.name) + '<br/><small style="color:var(--gray-400)">' + escapeHtml(u.email) + '</small></td>' +
      '<td>' + formatNumber(u.order_count) + '</td>' +
      '<td><strong>' + formatCurrency(u.total_spent) + '</strong></td>' +
      '</tr>'
    ).join('');
  }

  // Top services
  const tsBody = document.getElementById('rpt-top-services');
  if (!top_services.length) {
    tsBody.innerHTML = '<tr><td colspan="4" class="empty-state">Tidak ada data</td></tr>';
  } else {
    tsBody.innerHTML = top_services.map((s, i) =>
      '<tr>' +
      '<td><strong>' + (i + 1) + '</strong></td>' +
      '<td style="word-break:break-word;white-space:normal;font-size:.8rem">' + escapeHtml(s.service_name || 'Service #' + s.service_id) + '</td>' +
      '<td>' + formatNumber(s.order_count) + '</td>' +
      '<td><strong>' + formatCurrency(s.total_revenue) + '</strong></td>' +
      '</tr>'
    ).join('');
  }
}

function renderDailyChart(dailyData) {
  const wrapper = document.getElementById('rpt-chart');
  if (!dailyData.length) {
    wrapper.innerHTML = '<div class="empty-state"><i class="fas fa-chart-line"></i><br/>Tidak ada data untuk periode ini</div>';
    return;
  }

  const maxRevenue = Math.max(...dailyData.map(d => d.revenue), 1);

  const bars = dailyData.map(d => {
    const heightPct = Math.max((d.revenue / maxRevenue) * 100, 1);
    const dateLabel = d.date ? d.date.slice(5) : ''; // MM-DD
    return '<div class="chart-col">' +
      '<div class="chart-bar" style="height:' + heightPct + '%">' +
        '<div class="chart-bar-tooltip">' + d.date + '<br/>' + formatCurrency(d.revenue) + '<br/>' + formatNumber(d.order_count) + ' order</div>' +
      '</div>' +
      '<span class="chart-date">' + dateLabel + '</span>' +
      '</div>';
  }).join('');

  wrapper.innerHTML = '<div class="report-chart">' + bars + '</div>';
}
