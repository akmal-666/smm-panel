/**
 * API Module - Production + Demo Mode
 */

const API = {
  TOKEN_KEY: 'smm_token',
  USER_KEY: 'smm_user',

  // ── Token helpers ──
  getToken() { return localStorage.getItem(this.TOKEN_KEY); },
  setToken(t) { localStorage.setItem(this.TOKEN_KEY, t); },
  isLoggedIn() { return !!this.getToken(); },

  getUser() {
    const u = localStorage.getItem(this.USER_KEY);
    return u ? JSON.parse(u) : null;
  },
  setUser(u) { localStorage.setItem(this.USER_KEY, JSON.stringify(u)); },

  updateUser(data) {
    const user = this.getUser();
    if (!user) return null;
    const updated = { ...user, ...data };
    this.setUser(updated);
    return updated;
  },

  logout() {
    localStorage.removeItem(this.TOKEN_KEY);
    localStorage.removeItem(this.USER_KEY);
    localStorage.removeItem('smm_orders');
    localStorage.removeItem('smm_transactions');
  },

  // ── Fetch helper ──
  async _fetch(url, options = {}) {
    const token = this.getToken();
    const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
    if (token) headers['Authorization'] = 'Bearer ' + token;
    const res = await fetch(url, { ...options, headers });
    if (res.status === 401) {
      this.logout();
      window.location.reload();
      throw new Error('Session expired');
    }
    return res.json();
  },

  // ── AUTH ──
  async login(email, password) {
    if (CONFIG.DEMO_MODE) {
      const user = { ...DEMO_DATA.user, email };
      user.name = email.split('@')[0].replace(/[^a-zA-Z]/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) || 'User';
      this.setUser(user);
      this.setToken('demo_token_' + Date.now());
      return { success: true, user };
    }
    const data = await this._fetch('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    if (data.success) {
      this.setToken(data.token);
      this.setUser(data.user);
    }
    return data;
  },

  async register(name, email, password) {
    if (CONFIG.DEMO_MODE) {
      const user = { ...DEMO_DATA.user, name, email };
      this.setUser(user);
      this.setToken('demo_token_' + Date.now());
      return { success: true, user };
    }
    const data = await this._fetch('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ name, email, password }),
    });
    if (data.success) {
      this.setToken(data.token);
      this.setUser(data.user);
    }
    return data;
  },

  async refreshUser() {
    if (CONFIG.DEMO_MODE) return this.getUser();
    const data = await this._fetch('/api/user');
    if (data.success) this.setUser(data.user);
    return data.user;
  },

  // ── SERVICES ──
  async getServices() {
    if (CONFIG.DEMO_MODE) return DEMO_DATA.services;
    const data = await this._fetch('/api/proxy', {
      method: 'POST',
      body: JSON.stringify({ action: 'services' }),
    });
    // AsokaPanel mengembalikan array langsung
    // rate sudah dikonversi ke IDR oleh backend (proxy.js)
    return Array.isArray(data) ? data : [];
  },

  // ── ORDERS ──
  async placeOrder(serviceId, link, quantity, serviceName) {
    if (CONFIG.DEMO_MODE) {
      const service = DEMO_DATA.services.find(s => s.service == serviceId);
      const charge = ((service ? parseFloat(service.rate) : 1) * quantity / 1000).toFixed(4);
      const orderId = Math.floor(Math.random() * 90000) + 10000;
      const order = { order: orderId, service: serviceId, link, quantity, start_count: 0, remains: quantity, status: 'Pending', charge };
      const orders = this._getLocalOrders();
      orders.unshift(order);
      localStorage.setItem('smm_orders', JSON.stringify(orders));
      this.updateUser({
        balance: Math.max(0, (this.getUser().balance || 0) - parseFloat(charge)),
        total_spent: (this.getUser().total_spent || 0) + parseFloat(charge),
        total_orders: (this.getUser().total_orders || 0) + 1,
      });
      return { order: orderId, charge };
    }
    return this._fetch('/api/orders', {
      method: 'POST',
      body: JSON.stringify({ service_id: serviceId, service_name: serviceName, link, quantity }),
    });
  },

  async getOrders() {
    if (CONFIG.DEMO_MODE) return [...this._getLocalOrders(), ...DEMO_DATA.orders];
    const data = await this._fetch('/api/orders');
    return data.orders || [];
  },

  async getOrderStatus(orderId) {
    if (CONFIG.DEMO_MODE) {
      const all = [...this._getLocalOrders(), ...DEMO_DATA.orders];
      return all.find(o => o.order == orderId) || { error: 'Order not found' };
    }
    return this._fetch('/api/proxy', {
      method: 'POST',
      body: JSON.stringify({ action: 'status', order: orderId }),
    });
  },

  _getLocalOrders() {
    const o = localStorage.getItem('smm_orders');
    return o ? JSON.parse(o) : [];
  },

  // ── TRANSACTIONS ──
  async getTransactions() {
    if (CONFIG.DEMO_MODE) {
      const t = localStorage.getItem('smm_transactions');
      return t ? JSON.parse(t) : [];
    }
    const data = await this._fetch('/api/transactions');
    return data.transactions || [];
  },

  async addFunds(amount) {
    if (CONFIG.DEMO_MODE) {
      this.updateUser({ balance: (this.getUser().balance || 0) + amount });
      const txns = await this.getTransactions();
      txns.unshift({ id: Date.now(), type: 'credit', amount, description: 'Top-up manual', date: new Date().toISOString() });
      localStorage.setItem('smm_transactions', JSON.stringify(txns.slice(0, 50)));
      return { success: true };
    }
    return this._fetch('/api/transactions', {
      method: 'POST',
      body: JSON.stringify({ amount, description: 'Deposit via panel' }),
    });
  },

  // ── TICKETS ──
  async getTickets() {
    if (CONFIG.DEMO_MODE) return [];
    const data = await this._fetch('/api/tickets');
    return data.tickets || [];
  },

  async createTicket(subject, category, message) {
    if (CONFIG.DEMO_MODE) return { success: true, ticket_id: Date.now() };
    return this._fetch('/api/tickets', {
      method: 'POST',
      body: JSON.stringify({ subject, category, message }),
    });
  },

  // ── ADMIN: SERVICES CRUD ──
  async adminGetServices() {
    return this._fetch('/api/admin/services');
  },

  async adminAddService(data) {
    return this._fetch('/api/admin/services', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async adminUpdateService(data) {
    return this._fetch('/api/admin/services', {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  async adminDeleteService(id) {
    return this._fetch('/api/admin/services?id=' + id, { method: 'DELETE' });
  },
};
