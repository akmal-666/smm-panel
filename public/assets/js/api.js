/**
 * API Module
 * Handles all communication with the backend (Cloudflare Worker proxy)
 * and local storage for demo/auth state
 */

const API = {
  // ============================================================
  // AUTH (localStorage-based for demo; replace with real backend)
  // ============================================================
  
  async login(email, password) {
    if (CONFIG.DEMO_MODE) {
      // Demo: accept any credentials
      const user = { ...DEMO_DATA.user, email };
      user.name = email.split('@')[0].replace(/[^a-zA-Z]/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) || 'User';
      localStorage.setItem('smm_user', JSON.stringify(user));
      localStorage.setItem('smm_token', 'demo_token_' + Date.now());
      return { success: true, user };
    }
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    return res.json();
  },

  async register(name, email, password) {
    if (CONFIG.DEMO_MODE) {
      const user = { ...DEMO_DATA.user, name, email };
      localStorage.setItem('smm_user', JSON.stringify(user));
      localStorage.setItem('smm_token', 'demo_token_' + Date.now());
      return { success: true, user };
    }
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, password }),
    });
    return res.json();
  },

  logout() {
    localStorage.removeItem('smm_user');
    localStorage.removeItem('smm_token');
    localStorage.removeItem('smm_orders');
  },

  getUser() {
    const u = localStorage.getItem('smm_user');
    return u ? JSON.parse(u) : null;
  },

  isLoggedIn() {
    return !!localStorage.getItem('smm_token');
  },

  updateUser(data) {
    const user = this.getUser();
    if (user) {
      const updated = { ...user, ...data };
      localStorage.setItem('smm_user', JSON.stringify(updated));
      return updated;
    }
    return null;
  },

  // ============================================================
  // PROVIDER API (via Cloudflare Worker proxy)
  // ============================================================

  async getServices() {
    if (CONFIG.DEMO_MODE) {
      return DEMO_DATA.services;
    }
    try {
      const res = await fetch('/api/proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'services' }),
      });
      return res.json();
    } catch (e) {
      console.error('Failed to fetch services:', e);
      return [];
    }
  },

  async placeOrder(serviceId, link, quantity) {
    if (CONFIG.DEMO_MODE) {
      const service = DEMO_DATA.services.find(s => s.service == serviceId);
      const charge = ((service?.rate || 1) * quantity / 1000).toFixed(4);
      const orderId = Math.floor(Math.random() * 90000) + 10000;
      const order = {
        order: orderId,
        service: serviceId,
        link,
        quantity,
        start_count: 0,
        remains: quantity,
        status: 'Pending',
        charge,
      };
      // Save to local orders
      const orders = this.getLocalOrders();
      orders.unshift(order);
      localStorage.setItem('smm_orders', JSON.stringify(orders));
      // Deduct balance
      const user = this.getUser();
      if (user) {
        this.updateUser({
          balance: Math.max(0, user.balance - parseFloat(charge)),
          total_spent: (user.total_spent || 0) + parseFloat(charge),
          total_orders: (user.total_orders || 0) + 1,
        });
      }
      return { order: orderId };
    }
    try {
      const res = await fetch('/api/proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'add', service: serviceId, link, quantity }),
      });
      return res.json();
    } catch (e) {
      throw new Error('Failed to place order');
    }
  },

  async getOrderStatus(orderId) {
    if (CONFIG.DEMO_MODE) {
      const orders = this.getLocalOrders();
      const order = orders.find(o => o.order == orderId) ||
        DEMO_DATA.orders.find(o => o.order == orderId);
      if (!order) return { error: 'Order not found' };
      return order;
    }
    try {
      const res = await fetch('/api/proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'status', order: orderId }),
      });
      return res.json();
    } catch (e) {
      throw new Error('Failed to get order status');
    }
  },

  async getOrders() {
    if (CONFIG.DEMO_MODE) {
      const local = this.getLocalOrders();
      return [...local, ...DEMO_DATA.orders];
    }
    try {
      const res = await fetch('/api/proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'orders' }),
      });
      return res.json();
    } catch (e) {
      return [];
    }
  },

  getLocalOrders() {
    const o = localStorage.getItem('smm_orders');
    return o ? JSON.parse(o) : [];
  },

  // ============================================================
  // TRANSACTIONS
  // ============================================================

  getTransactions() {
    const t = localStorage.getItem('smm_transactions');
    return t ? JSON.parse(t) : [];
  },

  addTransaction(type, amount, description) {
    const transactions = this.getTransactions();
    transactions.unshift({
      id: Date.now(),
      type,
      amount,
      description,
      date: new Date().toISOString(),
    });
    localStorage.setItem('smm_transactions', JSON.stringify(transactions.slice(0, 50)));
  },
};
