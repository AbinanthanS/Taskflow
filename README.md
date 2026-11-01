# Taskflow — Collaborative AI-Powered Kanban Board

Taskflow is a modern, real-time collaborative project management application built on a PERN-like stack (PostgreSQL, Express 5, React 19, Node 22) with real-time Socket.IO synchronization and AI capabilities powered by Google Gemini.

---

## Architecture Overview

```
                      ┌────────────────────────────┐
                      │    React 19 Frontend UI    │
                      │   (Vite, Tailwind-like,    │
                      │     dnd-kit, Socket.IO)    │
                      └─────────────┬──────────────┘
                                    │ HTTP / WebSocket
                                    ▼
                      ┌────────────────────────────┐
                      │    Node 22 Express API     │
                      │ (Helmet, Rate Limiter,     │
                      │  Socket.IO server, Auth)   │
                      └──────┬──────────────┬──────┘
                             │              │
            PostgreSQL Query │              │ Google Gemini API
                             ▼              ▼
                    ┌────────────┐    ┌─────────────┐
                    │ PostgreSQL │    │ Gemini 3.1  │
                    │  Database  │    │  Flash-Lite │
                    └────────────┘    └─────────────┘
```

- **Frontend**: React 19 single-page app built with Vite, `@dnd-kit` for fluid drag-and-drop, and `socket.io-client` for live presence and board updates.
- **Backend**: Express 5 on Node.js 22, CommonJS architecture, `pg` pool with transaction support, Helmet headers, IP/user rate limiting, and centralized error handling.
- **Database**: PostgreSQL with UUID primary keys (`pgcrypto`), relational integrity with cascading deletes and foreign keys, schema migrations, and optimized composite indices.
- **Realtime**: Socket.IO with rooms (`board:<id>`, `user:<id>`), presence tracking (per-user with throttled cursors), and event broadcasting.
- **AI**: Google Gemini (`@google/genai`) for task generation from goals and task breakdown into actionable sub-items.

---

## Role & Permission Matrix

Taskflow enforces a three-tier hierarchical role model on boards: `owner` > `admin` > `member`.

| Action | Owner | Admin | Member |
| :--- | :---: | :---: | :---: |
| **Delete Board** | ✅ | ❌ | ❌ |
| **Update Board** (title, description, color) | ✅ | ✅ | ❌ |
| **Manage Columns** (create, edit, delete) | ✅ | ✅ | ❌ |
| **Add Member** | ✅ | ✅ | ❌ |
| **Remove Member** | ✅ | ✅ (members only) | ❌ |
| **Change Member Role to Admin** | ✅ | ❌ | ❌ |
| **Change Member Role to Member** | ✅ | ❌ | ❌ |
| **Alter Owner Role** | ❌ | ❌ | ❌ |
| **Manage Tasks** (create, edit, move, delete) | ✅ | ✅ | ✅ |
| **Assign Tasks** | Board members only | Board members only | Board members only |
| **AI Task Generation / Breakdown** | ✅ | ✅ | ✅ |

*Note: Admins cannot remove or demote the board owner or other admins. Only the owner can promote members to admin or transfer ownership.*

---

## Environment Variables

### Backend (`/Backend/.env`)

| Variable | Description | Default / Example |
| :--- | :--- | :--- |
| `PORT` | Port for the backend Express server | `5000` |
| `NODE_ENV` | Environment (`development` or `production`) | `development` |
| `DATABASE_URL` | PostgreSQL connection URL | `postgresql://user:pass@localhost:5432/taskflow` |
| `DATABASE_SSL_REJECT_UNAUTHORIZED` | In production, set to `false` to permit self-signed SSL certs | `true` |
| `JWT_SECRET` | Secret key for JWT signing (≥ 32 chars in production) | `your_long_random_jwt_secret_key...` |
| `CLIENT_URL` | Allowed frontend origin for CORS | `http://localhost:5173` |
| `GEMINI_API_KEY` | Google Gemini API key for AI features | `your_gemini_api_key` |
| `GEMINI_MODEL` | Gemini model identifier | `gemini-3.1-flash-lite` |

### Frontend (`/Frontend/UI/.env`)

| Variable | Description | Default / Example |
| :--- | :--- | :--- |
| `VITE_API_URL` | Backend HTTP API base URL | `http://localhost:5000/api` |
| `VITE_SOCKET_URL` | Backend Socket.IO server base URL | `http://localhost:5000` |

---

## Getting Started

### Prerequisites
- Node.js 22+
- PostgreSQL 14+ (or Docker)

### Option A: Running with Docker Compose

To run PostgreSQL and the Backend automatically:
```bash
docker compose up -d
```

### Option B: Local Development

1. **Install Dependencies**:
   ```bash
   cd Backend && npm install
   cd ../Frontend/UI && npm install
   ```

2. **Configure Environment Variables**:
   - Copy `Backend/.env.example` to `Backend/.env` and update values.
   - Copy `Frontend/UI/.env.example` to `Frontend/UI/.env` (if applicable).

3. **Initialize Database & Run Migrations**:
   ```bash
   cd Backend
   npm run db:init     # Runs schema migrations to initialize tables
   npm run db:seed     # Seeds initial demo users and boards
   ```

4. **Run Backend**:
   ```bash
   cd Backend
   npm run dev
   ```

5. **Run Frontend**:
   ```bash
   cd Frontend/UI
   npm run dev
   ```
   Open `http://localhost:5173` in your browser.

---

## Running Tests

### Backend Tests
The backend test suite uses Node's native `node:test` test runner and `supertest`:
```bash
cd Backend
npm test
```
*Note: Database-backed tests check for `DATABASE_URL_TEST`. If not specified, DB-dependent integration tests cleanly skip with an informative notice.*

### Frontend Lint and Build
```bash
cd Frontend/UI
npm run lint
npm run build
```
