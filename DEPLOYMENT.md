# Enterprise AI Knowledge System — Deployment Guide

Panduan lengkap untuk menjalankan dan mendeplai seluruh service.

---

## Arsitektur

```
┌─────────────────────────────────────────────────────────┐
│                      CLIENT                             │
│                  Browser (SPA)                          │
└─────────────────────────┬───────────────────────────────┘
                          │ HTTP
┌─────────────────────────▼───────────────────────────────┐
│                 FRONTEND (Vite)                         │
│              http://localhost:5173                       │
└─────────────────────────┬───────────────────────────────┘
                          │ REST API
┌─────────────────────────▼───────────────────────────────┐
│                 BACKEND (NestJS)                         │
│              http://localhost:8000                       │
│  ┌──────────┬──────────┬──────────┬──────────────┐      │
│  │ Auth     │ Users    │ Documents│ Messaging    │      │
│  └──────────┴──────────┴──────────┴──────────────┘      │
└──────┬──────────────────────────────┬───────────────────┘
       │ SQL                          │ HTTP
┌──────▼──────────────┐    ┌──────────▼───────────────────┐
│    PostgreSQL       │    │       AI ENGINE (FastAPI)     │
│   (Docker lokal)    │    │   internal http://ai-api:8000 │
│  + pgvector         │    │  ┌──────────┬──────────┐     │
└─────────────────────┘    │  │ Ingest   │ RAG Ask  │     │
                           │  └──────────┴──────────┘     │
                           └──────────┬───────────────────┘
                                      │ HTTP
                           ┌──────────▼───────────────────┐
                           │      SumoPod API (LLM)       │
                           │   OpenAI-compatible provider │
                           └──────────────────────────────┘
```

---

## Service Components

| Service | Technology | Port | Description |
|---------|-----------|------|-------------|
| **Frontend** | React + Vite + TypeScript | 5173 | Single Page Application |
| **Backend** | NestJS + Prisma | 8000 | REST API + Auth + CRUD |
| **AI Engine** | Python + FastAPI | 8000 (internal only, no host port) | RAG pipeline + LLM |
| **Database** | PostgreSQL + pgvector | 5432 | Container Docker dengan volume persisten |

---

## Quick Start (Local Development)

### Prerequisites

- Node.js 18+ (recommended: 22)
- Python 3.11+
- Git
- Docker Desktop / Docker Engine (untuk PostgreSQL lokal)

### 1. Clone & Install

```bash
git clone https://github.com/GipsyDanger-dev/JCP-Enterprise-AI-Knowledge-System.git
cd JCP-Enterprise-AI-Knowledge-System
```

### 2. Setup Environment

```bash
# Copy environment template
cp .env.example .env

# Edit .env with your credentials (see Environment Variables below)
```

### 3. Install Dependencies

```bash
# Backend
cd backend && npm install && cd ..

# Frontend
cd frontend && npm install && cd ..

# AI Engine
cd AI && pip install -r requirements.txt && cd ..
```

### 4. Setup Database

```bash
# Jalankan PostgreSQL + pgvector lokal
docker compose up -d postgres

# Bila seluruh stack dijalankan melalui Docker, Backend menjalankan migration
# otomatis. Seed akun awal dilakukan satu kali setelah Backend aktif.
docker compose up -d backend
docker compose exec backend npm run prisma:seed
```

### 5. Start Services

Open 3 terminals and run each service:

**Terminal 1 — Backend:**
```bash
cd backend
npm run start:dev
# → http://localhost:8000
```

**Terminal 2 — AI Engine:**

`WORKER_TOKEN` must match the backend value; without it every endpoint except
`/health` answers `503`.

```bash
cd AI
# Windows PowerShell:
$env:AI_PROVIDER_API_KEY="provider-key"
$env:AI_PROVIDER_BASE_URL="https://provider.example/v1"
$env:WORKER_TOKEN="same-token-as-backend"
python -m uvicorn http_api:app --host 127.0.0.1 --port 8001

# Linux/Mac:
AI_PROVIDER_API_KEY=provider-key AI_PROVIDER_BASE_URL=https://provider.example/v1 WORKER_TOKEN=same-token-as-backend python -m uvicorn http_api:app --host 127.0.0.1 --port 8001
# → http://localhost:8001
```

**Terminal 3 — Frontend:**
```bash
cd frontend
npm run dev
# → http://localhost:5173
```

### 6. Verify

```bash
# Health checks
curl http://localhost:8000/health    # → OK
curl http://localhost:8001/health    # → {"status":"ok"}

# Every other AI endpoint needs the shared secret
curl -H "X-Worker-Token: $WORKER_TOKEN" http://localhost:8001/documents
```

---

## Docker Deployment

### Prerequisites

- Docker Desktop / Docker Engine
- Docker Compose v2

### 1. Setup

```bash
# Copy environment template
cp .env.example .env

# Edit .env with your credentials
```

### 2. Build & Run

```bash
docker compose up --build
```

### 3. Access Services

| Service | URL |
|---------|-----|
| Frontend | http://localhost:5173 |
| Backend API | http://localhost:8000 |
| Backend Swagger | http://localhost:8000/api/docs |
| AI Engine | not published to the host (internal `http://ai-api:8000`) |
| AI Swagger | via `docker compose exec ai-api ...` |

### 4. Stop

```bash
docker compose down
```

> **Note:** Use `docker compose down -v` only if you want to delete all database data.

---

## Environment Variables

### Required Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `POSTGRES_USER` | User PostgreSQL lokal | `jcp` |
| `POSTGRES_PASSWORD` | Password PostgreSQL lokal | `strong-local-password` |
| `POSTGRES_DB` | Nama database lokal | `jcp_enterprise_ai` |
| `DATABASE_URL` | Koneksi native dari host ke PostgreSQL Docker | `postgresql://jcp:pass@127.0.0.1:5432/jcp_enterprise_ai?schema=public` |
| `JWT_SECRET` | Secret key for JWT signing | `your-random-secret-min-32-chars` |
| `WORKER_TOKEN` | Shared secret backend ↔ AI service (`X-Worker-Token` header) | `long-random-string` |
| `AI_PROVIDER_API_KEY` | API key provider AI OpenAI-compatible | `provider-key` |
| `AI_PROVIDER_BASE_URL` | Base URL provider AI | `https://provider.example/v1` |

### Optional Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `BACKEND_PORT` | `8000` | Backend listen port (dibaca `main.ts`; Docker memetakan port host yang sama) |
| `FRONTEND_PORT` | `5173` | Vite dev server port (dibaca `vite.config.ts`) |
| `POSTGRES_PORT` | `5432` | Port PostgreSQL yang hanya dipublikasikan ke loopback host |
| `JWT_EXPIRES_IN` | `24h` | JWT token expiration |
| `AI_CHAT_MODEL` | `auto` | Model chat default AI service |
| `AI_EMBEDDINGS_ENABLED` | `false` | Aktifkan hanya bila provider menyediakan endpoint embedding |
| `AI_EMBEDDING_MODEL` | `text-embedding-3-small` | Model embedding apabila endpoint embedding tersedia |
| `AI_SERVICE_URL` | `http://localhost:8001` | AI engine URL from backend (Docker: `http://ai-api:8000`) |
| `VITE_API_BASE_URL` | `http://localhost:8000` | Backend URL from frontend |
| `VITE_USE_MOCK_AUTH` | `false` | Enable mock API (dev only) |

### Seed Variables (Auto-create users on first run)

| Variable | Description | Default |
|----------|-------------|---------|
| `SEED_ADMIN_EMAIL` | Admin login email | `admin@jcp.co.id` |
| `SEED_ADMIN_PASSWORD` | Admin password (min 12 chars) | `admin1234567` |
| `SEED_USER_EMAIL` | Employee login email | `nadia@jcp.co.id` |
| `SEED_USER_PASSWORD` | Employee password (min 12 chars) | `employee12345` |

---

## Default Accounts

| Role | Email | Password | Access |
|------|-------|----------|--------|
| **Admin** | `admin@jcp.co.id` | `admin1234567` | Full access, user management, document upload |
| **Employee** | `nadia@jcp.co.id` | `employee12345` | Knowledge library, AI chat, messaging |

> ⚠️ **Change these passwords before production deployment!**

---

## API Endpoints Reference

### Authentication

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `POST` | `/auth/login` | Public | Login, returns JWT |
| `GET` | `/auth/me` | JWT | Get current user profile |

### Users (Admin only)

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET` | `/users` | ADMIN | List all users |
| `POST` | `/users` | ADMIN | Create new user |
| `PUT` | `/users/:id` | ADMIN | Update user (name, role, photo) |
| `PUT` | `/users/:id/password` | ADMIN | Change user password |
| `DELETE` | `/users/:id` | ADMIN | Deactivate user |

### Documents

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET` | `/documents` | JWT | List documents (admin: all, user: READY only) |
| `POST` | `/documents` | ADMIN | Upload document (multipart) |
| `GET` | `/documents/:id/status` | ADMIN | Get processing status |
| `DELETE` | `/documents/:id` | ADMIN | Delete document |
| `GET` | `/documents/:id/download` | JWT | Download document file |

### AI Chat

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `POST` | `/chat/query` | JWT | Ask AI question (RAG) |

### Messaging

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET` | `/messaging/employee/:id` | JWT | Get/create employee conversation |
| `GET` | `/messaging/conversations` | ADMIN | List all conversations |
| `GET` | `/messaging/:id/messages` | JWT | Get messages |
| `POST` | `/messaging/:id/messages` | JWT | Send message |
| `PUT` | `/messaging/:id/read` | JWT | Mark as read |

### Audit Logs (Admin only)

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET` | `/audit-logs` | ADMIN | List audit logs |

---

## Database Schema

```
users
├── documents
│   └── document_versions
│       ├── document_files (binary storage)
│       └── processing_jobs
├── direct_conversations
│   └── direct_messages
└── audit_logs
```

### Key Tables

- **users** — User accounts with roles (ADMIN/USER)
- **documents** — Document metadata + collection
- **document_versions** — Version history with file checksums
- **document_files** — Binary file storage (PostgreSQL bytea)
- **processing_jobs** — Document processing queue
- **direct_conversations** — Employee ↔ Admin messaging
- **direct_messages** — Chat messages with attachments
- **audit_logs** — Activity audit trail

---

## Production Deployment

### Option 1: VPS (DigitalOcean, AWS EC2, etc.)

```bash
# 1. Install Node.js, Python, PostgreSQL
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs python3-pip

# 2. Clone repository
git clone https://github.com/GipsyDanger-dev/JCP-Enterprise-AI-Knowledge-System.git
cd JCP-Enterprise-AI-Knowledge-System

# 3. Setup environment
cp .env.example .env
nano .env  # Edit with production values

# 4. Install & build
cd backend && npm install && npm run build && cd ..
cd frontend && npm install && npm run build && cd ..
cd AI && pip install -r requirements.txt && cd ..

# 5. Run migrations
cd backend && npx prisma migrate deploy && cd ..

# 6. Start with PM2 (recommended)
npm install -g pm2
pm2 start backend/dist/main.js --name backend
# Bind ke loopback: AI engine hanya boleh dipanggil backend di server yang sama.
WORKER_TOKEN=same-token-as-backend pm2 start "python -m uvicorn http_api:app --host 127.0.0.1 --port 8001" --name ai-engine --cwd AI
pm2 save
pm2 startup
```

### Option 2: Docker Compose (Recommended)

```bash
# 1. Setup
cp .env.example .env
nano .env

# 2. Build & deploy
docker compose -f docker-compose.prod.yml up -d --build

# 3. Run migrations
docker compose exec backend npx prisma migrate deploy

# 4. Seed users
docker compose exec backend npm run prisma:seed
```

### Option 3: Kubernetes

See `k8s/` directory for Kubernetes manifests (if available).

---

## SSL/HTTPS Setup

### With Nginx Reverse Proxy

```nginx
server {
    listen 443 ssl http2;
    server_name your-domain.com;

    ssl_certificate /etc/letsencrypt/live/your-domain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/your-domain.com/privkey.pem;

    # Frontend
    location / {
        proxy_pass http://localhost:5173;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }

    # Backend API
    location /api/ {
        proxy_pass http://localhost:8000/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    # AI Engine sengaja TIDAK di-proxy. Service ini internal: satu-satunya
    # pemanggil yang sah adalah backend, lewat AI_SERVICE_URL.
}
```

### With Let's Encrypt

```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com
```

---

## Monitoring & Logs

### Health Checks

```bash
# Backend
curl http://localhost:8000/health

# AI Engine (host-run). Under Docker the service has no host port; check it with:
#   docker compose exec -T ai-api python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/health')"
curl http://localhost:8001/health

# Database
cd backend && npx prisma studio
```

### Logs

```bash
# Backend logs (PM2)
pm2 logs backend

# AI Engine logs
pm2 logs ai-engine

# Docker logs
docker compose logs -f backend
docker compose logs -f ai-api
```

### Audit Trail

All user actions are logged to `audit_logs` table:

- Login/logout
- User creation/update/deletion
- Document upload/delete
- Processing job status changes

Access via API: `GET /audit-logs` (Admin only)

---

## Troubleshooting

### Common Issues

| Issue | Solution |
|-------|----------|
| `401 Unauthorized` | Check JWT token, ensure user is active |
| `403 Forbidden` | User role doesn't have access |
| `503 AI service unavailable` | Start AI engine (host-run: port 8001) |
| `503 WORKER_TOKEN is not configured` | Set `WORKER_TOKEN` on the AI service |
| `401 Valid worker token required` | Backend `WORKER_TOKEN` differs from the AI service value |
| `Document stuck at QUEUED` | Check AI engine is running |
| `Cannot connect to database` | Pastikan Docker Desktop aktif dan container `postgres` healthy |
| `CORS error` | Ensure frontend URL is allowed |

### Reset Database

```bash
cd backend
npx prisma migrate reset
npm run prisma:seed
```

### Clear Processing Queue

```bash
cd backend
npx prisma db execute --stdin <<< "UPDATE processing_jobs SET status='FAILED' WHERE status='QUEUED';"
```

---

## Security Notes

1. **Never commit `.env` files** — add to `.gitignore`
2. **Change default passwords** before production
3. **Use strong JWT_SECRET** — minimum 32 characters, and a separate random `WORKER_TOKEN`
4. **Enable HTTPS** in production
5. **Restrict CORS** to your domain
6. **Regular backups** of PostgreSQL database
7. **Monitor audit logs** for suspicious activity

---

## Support

- **Documentation:** See `README.md` for project overview
- **API Docs:** http://localhost:8000/api/docs (Swagger)
- **AI Docs:** http://localhost:8001/docs (FastAPI, host-run only — not exposed under Docker)

---

## License

Proprietary — Jogja Creative Platform
