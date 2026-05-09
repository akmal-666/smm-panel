/**
 * Cloudflare Pages Function - API Proxy
 * File: functions/api/proxy.js
 *
 * This proxies requests to your SMM provider API,
 * keeping your API key secret on the server side.
 *
 * Set these in Cloudflare Pages > Settings > Environment Variables:
 *   PROVIDER_API_URL  = https://justanotherpanel.com/api/v2
 *   PROVIDER_API_KEY  = your_api_key_here
 */

export async function onRequestPost(context) {
  const { request, env } = context;

  const PROVIDER_URL = env.PROVIDER_API_URL || 'https://justanotherpanel.com/api/v2';
  const PROVIDER_KEY = env.PROVIDER_API_KEY || '';

  // CORS headers
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  };

  try {
    const body = await request.json();
    const { action, service, link, quantity, order, orders } = body;

    if (!action) {
      return new Response(JSON.stringify({ error: 'Missing action' }), { status: 400, headers: corsHeaders });
    }

    // Build form data for provider API
    const formData = new URLSearchParams();
    formData.append('key', PROVIDER_KEY);
    formData.append('action', action);

    if (action === 'add') {
      if (!service || !link || !quantity) {
        return new Response(JSON.stringify({ error: 'Missing required fields: service, link, quantity' }), { status: 400, headers: corsHeaders });
      }
      formData.append('service', service);
      formData.append('link', link);
      formData.append('quantity', quantity);
    }

    if (action === 'status' && order) {
      formData.append('order', order);
    }

    if (action === 'status' && orders) {
      formData.append('orders', Array.isArray(orders) ? orders.join(',') : orders);
    }

    // Call provider API
    const providerRes = await fetch(PROVIDER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: formData.toString(),
    });

    if (!providerRes.ok) {
      return new Response(JSON.stringify({ error: 'Provider API error: ' + providerRes.status }), { status: 502, headers: corsHeaders });
    }

    const data = await providerRes.json();
    return new Response(JSON.stringify(data), { status: 200, headers: corsHeaders });

  } catch (err) {
    return new Response(JSON.stringify({ error: 'Internal error: ' + err.message }), { status: 500, headers: corsHeaders });
  }
}

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}
