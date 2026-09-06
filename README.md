# Riderapp — Tiffin Subscription & Delivery Platform

Tiffin meals delivered on a daily subscription. Every morning the system turns active
subscriptions into real orders, hands them to riders, tracks them to the door, and settles the
money.

| Folder | What it is |
|---|---|
| `backend/` | The API and all the correctness logic (Postgres, Express) |
| `frontend/rider-app/` | React Native (Expo) app the rider uses, with an offline-safe outbox |
| `frontend/dashboard/` | Web page for the ops team (Vite + React) |

**Decisions and why:** [`DECISIONS.md`](DECISIONS.md)

---

## Requirements

| Tool | Version used | Why |
|---|---|---|
| [Docker Desktop](https://www.docker.com/products/docker-desktop/) | any recent | runs Postgres — nothing else needs installing locally |
| [Node.js](https://nodejs.org/) | v24.x (v18+ should work) | backend and dashboard |
| npm | 12.x | comes with Node |
| [Expo Go](https://expo.dev/go) app | current | on your **phone**, to run the rider app — install from the App Store / Play Store |
| A phone and laptop on the **same Wi-Fi network** | — | the phone talks to the backend over your LAN, not localhost |

No Android Studio / Xcode is required — Expo Go on a physical phone is enough.

---

## Quick start (four terminals)

Run these in order. Each block is its own terminal tab; leave the long-running ones (`npm start`,
`npm run dev`, `npx expo start`) open.

### 1. Database

```bash
docker compose up -d
```

Starts Postgres on `localhost:5433` (mapped from the container's `5432`, so it won't collide with
a Postgres you already have running). Confirm it's healthy:

```bash
docker ps   # should show riderapp-postgres as "Up ... (healthy)"
```

### 2. Backend

```bash
cd backend
npm install
cp .env.example .env      # defaults work as-is for local dev, no edits needed
npm run migrate           # creates all tables
npm run seed               # wipes and inserts demo customers/riders/subscriptions
npm run dev                # http://localhost:3000, restarts on file changes
```

Confirm it's up: `curl http://localhost:3000/health` should return `{"status":"ok"}`.

Re-run `npm run migrate` any time a new file appears under `backend/src/db/migrations/` — it only
applies what hasn't run yet, so it's always safe to re-run.

### 3. Ops dashboard

```bash
cd frontend/dashboard
npm install
npm run dev                # http://localhost:5173
```

Open `http://localhost:5173` in your browser. Its `.env` already points at
`http://localhost:3000` (both run on the same laptop, so `localhost` works here — unlike the
phone).

### 4. Rider app

```bash
cd frontend/rider-app
npm install
```

Before starting, point it at your laptop's **Wi-Fi** IP (not `localhost` — the phone can't reach
that):

```bash
ipconfig            # Windows: find "IPv4 Address" under "Wireless LAN adapter Wi-Fi"
# macOS/Linux: ifconfig or `ipconfig getifaddr en0`
```

```bash
cp .env.example .env
# edit .env: EXPO_PUBLIC_API_URL=http://<that-IP>:3000
npx expo start
```

Scan the QR code with your phone's camera (iOS) or the Expo Go app (Android). If it changes
later (new Wi-Fi network, DHCP renewal), update `.env` and restart with `npx expo start -c`
(the `-c` clears Metro's bundler cache, needed whenever `.env` or a native dependency changes).

**If the phone can't reach the backend:** confirm both devices are on the same Wi-Fi network
first, then check Windows Firewall isn't blocking inbound connections on port 3000.

---

## Tests

```bash
cd backend && npm test              # 55 tests against a real Postgres — no mocks
cd frontend/rider-app && npm test   # 12 headless tests for the offline outbox
cd frontend/dashboard && npm run build   # confirms it still bundles cleanly
```

The backend tests need Postgres running (step 1) and use `TEST_DATABASE_URL` from `.env` — a
separate database from your dev data, created automatically by `docker/init-test-db.sql` the
first time the container starts.

---

## Notes and assumptions

- All business dates are **Indian Standard Time (IST, UTC+5:30)**. India has no daylight saving,
  which keeps this simple.
- Secrets live in `.env` files, which are **not** committed anywhere in this repo (verified via
  `git check-ignore`). `.env.example` in each folder shows what's needed, with safe local
  defaults — nothing in `.env.example` is a real secret.
- The payment webhook is properly HMAC-signed and replay-protected, because that endpoint moves
  money. Rider identity is not — the brief says real auth isn't required there.
