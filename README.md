# SMM Panel

Full-featured SMM (Social Media Marketing) panel built for Cloudflare Pages + GitHub auto-deploy.

## Features

- New Order (single & bulk)
- My Orders with status tracking
- Services browser
- Add Funds with transaction history
- Referral program
- Support tickets
- API documentation
- Responsive on all devices

## Quick Start

### 1. Clone & Push to GitHub

```bash
git init
git add .
git commit -m "Initial SMM Panel"
git remote add origin https://github.com/YOUR_USERNAME/smm-panel.git
git push -u origin main
```

### 2. Connect to Cloudflare Pages

1. Go to [Cloudflare Pages](https://pages.cloudflare.com)
2. Click **Create a project** > **Connect to Git**
3. Select your repository
4. Build settings:
   - **Framework preset**: None
   - **Build command**: *(leave empty)*
   - **Build output directory**: `public`
5. Click **Save and Deploy**

### 3. Set Environment Variables

In Cloudflare Pages > Settings > Environment Variables, add:

| Variable | Value |
|---|---|
| `PROVIDER_API_URL` | `https://justanotherpanel.com/api/v2` |
| `PROVIDER_API_KEY` | `your_api_key_here` |

### 4. Disable Demo Mode

In `public/assets/js/config.js`, set:
```js
DEMO_MODE: false,
```

## Recommended SMM Providers

| Provider | URL | Notes |
|---|---|---|
| **JustAnotherPanel** | justanotherpanel.com | Cheapest, most popular |
| **SMMFollows** | smmfollows.com | Fast delivery |
| **Peakerr** | peakerr.com | Wide service range |
| **SMMKings** | smmkings.com | Good quality |

All providers use the same API format (`action`, `key`, `service`, `link`, `quantity`).

## Project Structure

```
smm panel/
├── public/                  # Static files (deployed to Cloudflare Pages)
│   ├── index.html
│   └── assets/
│       ├── css/style.css
│       └── js/
│           ├── config.js    # App config & demo data
│           ├── api.js       # API module
│           └── app.js       # Main app logic
├── functions/               # Cloudflare Pages Functions
│   └── api/
│       └── proxy.js         # API proxy (keeps key secret)
├── .github/
│   └── workflows/
│       └── deploy.yml       # GitHub Actions auto-deploy
└── wrangler.toml
```

## Switching Providers

Just change `PROVIDER_API_URL` in Cloudflare environment variables. No code changes needed.
