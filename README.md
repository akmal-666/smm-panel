# SMM Panel

Full-featured SMM Panel — Cloudflare Pages + D1 Database + GitHub Auto-Deploy.

## Stack

- **Frontend**: Vanilla JS, CSS (no framework, no build step)
- **Backend**: Cloudflare Pages Functions (serverless)
- **Database**: Cloudflare D1 (SQLite, free tier)
- **Auth**: JWT (HS256 via Web Crypto API)
- **SMM Provider**: Any panel with standard API (JAP, SMMFollows, Peakerr, etc.)

---

## Production Setup

### Step 1 — Push to GitHub

```bash
cd "smm panel"
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/YOUR_USERNAME/smm-panel.git
git push -u origin main
```

### Step 2 — Create D1 Database

```bash
npm install -g wrangler
wrangler login
wrangler d1 create smm-panel-db
```

Copy the `database_id` from output, paste into `wrangler.toml`:
```toml
[[d1_databases]]
binding = "DB"
database_name = "smm-panel-db"
database_id = "PASTE_YOUR_ID_HERE"
```

Run migrations:
```bash
wrangler d1 execute smm-panel-db --file=migrations/schema.sql
```

### Step 3 — Connect to Cloudflare Pages

1. Go to [dash.cloudflare.com](https://dash.cloudflare.com) → **Pages**
2. **Create a project** → **Connect to Git** → select your repo
3. Build settings:
   - Framework preset: **None**
   - Build command: *(leave empty)*
   - Build output directory: `public`
4. **Save and Deploy**

### Step 4 — Set Environment Variables

In Cloudflare Pages → **Settings** → **Environment Variables**:

| Variable | Value | Notes |
|---|---|---|
| `PROVIDER_API_URL` | `https://justanotherpanel.com/api/v2` | Your SMM provider URL |
| `PROVIDER_API_KEY` | `your_api_key` | From your provider dashboard |
| `JWT_SECRET` | `random-string-min-32-chars` | Generate: `openssl rand -hex 32` |
| `WEBHOOK_SECRET` | `random-string` | For payment gateway callbacks |

### Step 5 — Bind D1 to Pages

In Cloudflare Pages → **Settings** → **Functions** → **D1 database bindings**:
- Variable name: `DB`
- D1 database: `smm-panel-db`

### Step 6 — Disable Demo Mode

In `public/assets/js/config.js`:
```js
DEMO_MODE: false,
```

Commit and push — GitHub Actions will auto-deploy.

---

## GitHub Actions Auto-Deploy

Add these secrets in GitHub → **Settings** → **Secrets and variables** → **Actions**:

| Secret | Where to get |
|---|---|
| `CLOUDFLARE_API_TOKEN` | Cloudflare → My Profile → API Tokens → Create Token (use "Edit Cloudflare Workers" template) |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare → right sidebar on any page |

---

## API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/auth/login` | Login |
| POST | `/api/auth/register` | Register |
| GET | `/api/user` | Get profile |
| PUT | `/api/user` | Update profile/password |
| GET | `/api/orders` | List orders |
| POST | `/api/orders` | Place order |
| GET | `/api/transactions` | List transactions |
| POST | `/api/transactions` | Add funds (webhook) |
| GET | `/api/tickets` | List tickets |
| POST | `/api/tickets` | Create ticket |
| POST | `/api/proxy` | Proxy to SMM provider |

---

## Recommended SMM Providers

| Provider | URL | Instagram Followers/1K |
|---|---|---|
| **JustAnotherPanel** | justanotherpanel.com | ~$0.50 |
| **SMMFollows** | smmfollows.com | from $0.003 |
| **Peakerr** | peakerr.com | ~$0.50–1.50 |

All use the same API format — just change `PROVIDER_API_URL`.

---

## Project Structure

```
smm panel/
├── public/                      # Static frontend
│   ├── index.html
│   └── assets/
│       ├── css/style.css
│       └── js/
│           ├── config.js        # App config (set DEMO_MODE here)
│           ├── api.js           # API client
│           └── app.js           # UI logic
├── functions/                   # Cloudflare Pages Functions
│   ├── _utils.js                # JWT, password hashing, helpers
│   └── api/
│       ├── auth/
│       │   ├── login.js
│       │   └── register.js
│       ├── user.js
│       ├── orders.js
│       ├── transactions.js
│       ├── tickets.js
│       └── proxy.js             # SMM provider proxy
├── migrations/
│   └── schema.sql               # D1 database schema
├── .github/workflows/deploy.yml
└── wrangler.toml
```
