# Enterprise AI — Frontend

Web UI untuk **Enterprise AI Knowledge System** — platform knowledge management dengan AI assistant, citation verification, dan role-based access control.

**Stack:** React 19 · TypeScript · Vite · React Router · Tailwind-free (CSS custom properties)

## Quick Start

```bash
cd frontend
npm install
npm run dev
```

Buka http://localhost:5173 — otomatis redirect ke halaman login.

## Mock Auth (Development)

Tanpa backend, aplikasi menggunakan **mock auth** secara default. Gunakan akun demo ini untuk login:

| Role | Email | Password |
|---|---|---|
| Admin | `admin@jcp.co.id` | `admin123` |
| Employee | `nadia@jcp.co.id` | `employee123` |

**Admin** bisa akses: Overview, Documents, AI Assistant, People & access.
**Employee** bisa akses: Home, Ask AI, Knowledge library.

Untuk mematikan mock mode (saat backend sudah siap):

```bash
VITE_USE_MOCK_AUTH=false npm run dev
```

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start dev server (port 5173) |
| `npm run build` | TypeScript check + production build |
| `npm run lint` | Run oxlint |
| `npm run preview` | Preview production build |
| `npm run test:e2e` | Run E2E tests (login + chat + users) |

## E2E Tests

```bash
npm run test:e2e
```

Requires Chrome installed. Tests use `puppeteer-core` with system Chrome.

| Suite | Scenarios | Coverage |
|---|---|---|
| Login | 14 | Auth flow, role guard, session restore, logout |
| Chat | 11 | Answer, citation, no-answer, loading, AgentPanel |
| Users | 13 | List, filter, create, delete, employee guard |
| **Total** | **38** | **All passing** |

## Architecture

```
src/
├── api/                  # API client + typed schema
│   ├── client.ts         # Base fetch + ApiError
│   ├── config.ts         # USE_MOCK flag
│   ├── types.ts          # TypeScript interfaces (kontrak API)
│   ├── auth.ts           # login(), me()
│   ├── documents.ts      # list, upload, status, delete
│   ├── chat.ts           # query, conversations
│   ├── users.ts          # list, create, delete
│   ├── mappers.ts        # API ↔ UI type conversion
│   ├── mockAuth.ts       # Mock auth (development)
│   ├── mockDocuments.ts  # Mock documents (development)
│   ├── mockChat.ts       # Mock chat (development)
│   └── mockUsers.ts      # Mock users (development)
├── components/           # Reusable UI components
│   ├── Sidebar.tsx       # Navigation sidebar
│   ├── Topbar.tsx        # Top bar with role switch
│   ├── AgentPanel.tsx    # Knowledge Agent (overview)
│   ├── SourceCard.tsx    # Citation card
│   ├── DashboardLayout.tsx
│   ├── RequireAuth.tsx   # Route guard
│   └── ...               # PageHeading, StatusBadge, Metric, etc.
├── context/              # React context providers
│   ├── AuthProvider.tsx   # Token + user state
│   └── WorkspaceProvider.tsx  # Documents, chat, role
├── hooks/                # Custom hooks
│   ├── useAuth.ts
│   └── useWorkspace.ts
├── pages/                # Route pages
│   ├── LoginPage.tsx
│   ├── OverviewPage.tsx  # Admin + Employee
│   ├── DocumentsPage.tsx
│   ├── ChatPage.tsx
│   └── UsersPage.tsx
├── types/                # Domain types
│   └── domain.ts
├── App.tsx               # Router setup
└── index.css             # Design tokens + all styles
```

## Design System

- **Brand:** Coral/Orange accent (`#ff7043`) on warm off-white (`#f5f5f2`)
- **Font:** Inter (system-ui fallback)
- **Tokens:** CSS custom properties di `:root` (`--brand-600`, `--text-*`, `--bg-*`, etc.)
- **Radius:** 6-8px default, 99px pill/badge
- **Icons:** Lucide React 14-18px

## Env Variables

| Variable | Default | Description |
|---|---|---|
| `VITE_API_BASE_URL` | `http://localhost:8080/api` | Backend API base URL |
| `VITE_USE_MOCK_AUTH` | `true` (dev) | Enable/disable mock backend |

## API Contract

Lihat `src/api/README.md` untuk dokumentasi lengkap kontrak API Frontend ↔ Backend.
