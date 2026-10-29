# iMovies — Movie Ticket Booking Made Simple

MERN movie-ticket-booking platform (B.Tech CSE project): browse movies, pick a show, choose seats on a live seat map, reserve (with a hold timer), pay with a **simulated** checkout, get a ticket and notifications, cancel under explicit rules — plus an admin dashboard.
**Status (2026-10-26):** Phase 6 repository-side fixes and documentation are prepared. Runtime verification is currently blocked by the sandbox Node version, unavailable npm registry, and absent MongoDB replica set; see [`PROJECT_STATUS.md`](PROJECT_STATUS.md) for actual commands/results and [`PREVIEW_STATUS.md`](PREVIEW_STATUS.md) for preview prerequisites.
**Payments are demonstrations only.** No card data is requested, stored or transmitted; nothing here is PCI-relevant and it must not be presented as a real payment flow.

## Repository layout
```
server/   Express + Mongoose API, Socket.IO, Jest tests, seed scripts      (own package-lock.json)
client/   React 19 + Vite + Bootstrap 5 SPA, Vitest tests                  (own package-lock.json)
e2e/      Playwright browser, accessibility (axe) and responsive tests     (own package-lock.json)
package.json   convenience scripts that delegate to the three packages
```

## 1. Prerequisites (required versions and current audit limits)
| Tool | Version | Notes |
|---|---|---|
| Node.js | **`^22.22.2 || ^24.15.0 || >=26.0.0`** (see below) | `.nvmrc` pins `22.22.2`. The audit environment supplied `22.16.0`, below minimum; a supported runtime was not available for verification. |
| MongoDB | MongoDB 6+ recommended | **must be a replica set or sharded cluster** (transactions); no MongoDB instance was available in the 2026-10-26 audit run |
| Chromium | any recent | system Chromium was present, but Playwright package/runtime dependencies were unavailable in the 2026-10-26 audit run |

**Why this Node range?** It is derived from the engines declared in the three lockfiles, not guessed: the client test stack needs it (`jsdom@30.1.3` → `^22.22.2 || ^24.15.0 || >=26.0.0`, `vitest@5.0.5` → `^22.12.0 || ^24.0.0 || >=26.0.0`, `undici@8.12.3` → `>=22.19.0`), the E2E axe package needs `>=22.12.0`, and the server needs at least `^20.19.0 || ^22.13.0 || >=24` (`eslint@10`, `mongodb@7`). The intersection on maintained LTS lines is the range above, declared identically in the root, `server`, `client` and `e2e` `package.json` files (and mirrored in each lockfile's root entry). Node 18 and 20 are **not** supported (Node 18 fails the engines of most dependencies; Node 20 meets some but is end-of-life and fails the client test stack). Node 24.15+ and 26 satisfy the declared engines but have **not been run** here. There is no CI configuration in this repository; if you add one, use Node 22.22.2 or newer.

**Current audit limitation:** this workspace supplied Node.js 22.16.0, below the declared engine range. An attempt to use the package lockfiles was blocked by an unreachable npm registry (`EAI_AGAIN registry.npmjs.org`), so the application tests and builds were not executed during this audit. Historical results recorded in older project notes are not presented as verification of these newer edits.

### MongoDB replica set (required)
Seat reservation, payment and cancellation use multi-document transactions, which MongoDB only allows on a replica set. Pick one:
- **MongoDB Atlas free tier (M0)** — already a replica set. Easiest.
- **Local mongod (use a dedicated demo DB name):**
  ```bash
  mkdir -p ~/mongo-data
  mongod --replSet rs0 --dbpath ~/mongo-data --port 27017 --bind_ip 127.0.0.1   # keep running
  cd server && npm run db:init-replset                                         # once; prints "Replica set rs0 initiated."
  ```
  Windows: `mongod --replSet rs0 --dbpath C:\mongo-data`, then the same init command (not tested on Windows).
- **Docker:** `docker run -d --name mongo -p 27017:27017 mongo:7 --replSet rs0` then `npm run db:init-replset` (not tested).

Connectivity check: start the API and open `http://localhost:5000/api/health` → `{"data":{"status":"ok","db":"connected"}}`.

## 2. Environment configuration
Copy `server/.env.example` to `server/.env` and edit (never commit `.env`; only placeholders are tracked). Generate a JWT secret locally and choose your own admin password; no password is provided by the example.

| Variable | Required | Meaning |
|---|---|---|
| `MONGO_URI` | yes | e.g. `mongodb://127.0.0.1:27017/imovies_demo?replicaSet=rs0` or the Atlas SRV string. `connectDb` checks `hello` and rejects standalone MongoDB. |
| `JWT_SECRET` | yes | ≥ 32 random chars: `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"` |
| `CLIENT_ORIGIN` | yes | comma-separated allowed frontend origins (CORS + CSRF Origin check + Socket.IO); defaults to localhost only in development. Production requires an explicit value. Each entry must be a plain origin such as `https://app.example.com` (no path, no `*`); invalid entries stop startup. |
| `NODE_ENV`, `PORT` | no | `development` / `5000` |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | for admin | used by `npm run seed` / `create-admin` to create the **first** admin (same password rules as registration: 8–72 chars, a letter and a number). Nothing is hard-coded. See *Admin bootstrap* below |
| `SEED_CUSTOMER_EMAIL/PASSWORD` | no | optional demo customer; ignored when `NODE_ENV=production` |
| `SEED_SHOW_DAYS` | no | future demo show horizon (default 21 days, 1–90); repeated `seed` runs top up without duplicating occupied shows |
| `SEED_RESET_ALLOWED_DB`, `SEED_RESET_CONFIRM` | reset only | reset requires database name `imovies_demo` or `imovies_dev`, exact configured target name, and `RESET-IMOVIES-DEMO-DATABASE`; production reset is not supported |
| `COOKIE_SAMESITE`, `COOKIE_SECURE`, `TRUST_PROXY` | prod | production defaults to `SameSite=None; Secure` (cross-site hosting); startup fails if `none` is used without `Secure`. Set `TRUST_PROXY=true` behind a proxy/host load balancer |
| `SEAT_HOLD_MINUTES` (10), `MAX_SEATS_PER_BOOKING` (8), `CANCEL_CUTOFF_HOURS` (2), `CLEANUP_INTERVAL_MS` (60000), `TZ_OFFSET_MINUTES` (330), `BCRYPT_ROUNDS` (12) | no | tunables |
| `AUTH_RATE_LIMIT_MAX` (20 / 15 min), `RESERVE_RATE_LIMIT_MAX` (30 / min) | no | rate limits per client IP (raise only for load/e2e tests) |
| `SMTP_URL`, `EMAIL_FROM` | no | optional email: unset = skipped; `json` = build messages without sending (demo); else a nodemailer URL such as `smtps://user:pass@smtp.host:465` |

Frontend (`client/.env.example`): `VITE_API_URL` — leave empty in development (Vite proxies `/api` and `/socket.io` to `VITE_PROXY_TARGET`, default `http://localhost:5000`, so cookies stay same-origin). Set it to the full API base (e.g. `https://api.example.com/api`) at **build time** for a separately hosted backend.

## 3. Install, seed, run
Install from the committed lockfiles (`npm ci`, not `npm install`):
```bash
npm run install:all          # or: (cd server && npm ci) && (cd client && npm ci) && (cd e2e && npm ci)
cp server/.env.example server/.env   # edit JWT_SECRET, ADMIN_EMAIL, ADMIN_PASSWORD, MONGO_URI
cd server && npm run seed    # first run seeds demo catalogue; every run safely tops up future shows
npm run dev                  # API  http://localhost:5000
cd ../client && npm run dev  # app  http://localhost:5173
```
**Admin bootstrap (fail-closed).** `ADMIN_EMAIL`/`ADMIN_PASSWORD` only ever *create* the first admin. `ADMIN_PASSWORD` is blank in `.env.example` on purpose; set your own strong password locally before seeding. If no account has that email, it is created as `ADMIN`. If it already belongs to an `ADMIN`, nothing is changed (no password reset). If it already belongs to a `CUSTOMER` — for example someone registered that address before you ran the command — the command **aborts with an error and changes nothing**: the account is not promoted and its password is untouched, because promoting it would give admin rights to whoever knows that customer's password. Resolve it deliberately: set `ADMIN_EMAIL` to an unused address, or delete the unwanted account directly in the database, then re-run. There is no API endpoint for promoting users or resetting admin credentials. Run bootstrap **before** exposing the API publicly.

**Movie posters.** The eight seeded demo movies are fictional and ship with original poster artwork: static SVG files in `client/public/posters/<slug>.svg`, referenced by root-relative paths (`/posters/midnight-monsoon.svg`), so they load from the app's own origin with nothing hotlinked. Running `npm run seed` on a database seeded by an older version fills in missing posters for these titles (it never overwrites a poster someone already set). In the admin movie form, `Poster image` accepts an `https://…` URL (use only images you have the right to use) or a `/posters/<file>.(svg|png|jpg|jpeg|webp|avif)` path for files you add to `client/public/posters/`; the API rejects every other scheme or path. There is no image upload feature. A movie without a poster (or whose image fails to load) shows a generated gradient placeholder.

Seeding safety: `npm run seed` does not overwrite existing catalogue records. It idempotently tops up future demo showtimes through `SEED_SHOW_DAYS` (default 21, range 1–90), skips occupied slots, and never schedules a movie before its stored release date. `npm run seed:reset` wipes catalogue, schedule, booking, payment and notification records but keeps user accounts. It is permanently blocked in production, accepts only a dedicated database named `imovies_demo` or `imovies_dev`, requires `SEED_RESET_ALLOWED_DB` to match the database name in `MONGO_URI`, and requires the explicit `SEED_RESET_CONFIRM=RESET-IMOVIES-DEMO-DATABASE` confirmation. Example (only after checking your URI): `SEED_RESET_ALLOWED_DB=imovies_demo SEED_RESET_CONFIRM=RESET-IMOVIES-DEMO-DATABASE npm run seed:reset`. Do not use reset against Atlas production data.

## 4. Scripts
| Where | Command | Purpose |
|---|---|---|
| root | `npm run lint` / `test` / `build` / `test:e2e` | run the same command in each package |
| server | `npm run dev` · `start` · `seed` · `seed:reset` · `create-admin` · `db:init-replset` · `lint` · `test` | `seed:reset` requires an explicit disposable demo DB and confirmation token; production is always refused. |
| client | `npm run dev` · `build` · `preview` · `lint` · `test` | `preview` serves the build on :4173 with the same proxy |
| e2e | `npm test` · `lint` | needs the stack running (see §7) |

## 5. Socket.IO, CORS and API URL
- Seat updates: clients join a per-show room and receive `seats:update {showId}` then refetch. The seat page also polls every 15 s as a fallback (verified by blocking sockets in the browser tests).
- Every browser origin that talks to the API must be listed in `CLIENT_ORIGIN` (used for CORS with credentials, the CSRF `Origin` check on unsafe requests — see §9 — and Socket.IO CORS). A wrong value shows up as `403 Origin not allowed`, `403 Origin header required…`, or missing cookies. Behind a proxy or rewrite, the browser's `Origin` is the **frontend's** origin (the proxy must not strip it).
- Reverse proxies must forward WebSocket upgrades for `/socket.io/`; otherwise Socket.IO silently falls back to long-polling and the 15 s poll.
- Socket.IO runs in the API process (single instance). Scaling to several instances would need a shared adapter (e.g. Redis) — not implemented.

## 6. Production build and deployment (not performed — nothing is deployed; no live URLs exist)
Deploy the three parts separately. All persistent state lives in MongoDB; the API and frontend are stateless and write nothing to disk.

**Database — MongoDB Atlas M0 (free):** create a cluster → Database Access: create a user → Network Access: allow your backend's egress IPs (free hosts often need `0.0.0.0/0`; use a strong password) → copy the SRV connection string and add the database name, e.g. `mongodb+srv://USER:PASS@cluster.example.mongodb.net/imovies?retryWrites=true&w=majority`. M0 has a 512 MB quota and no guaranteed backups. Seed once from your machine with `MONGO_URI` pointing at Atlas and `NODE_ENV=production` (`ADMIN_EMAIL`/`ADMIN_PASSWORD` set; no demo customer is created).

**Backend — Render (or another Node host):** root directory `server`, build `npm ci`, start `npm start`, health check `/api/health`. Startup validates required environment values and rejects a MongoDB standalone server before opening the API. Set `NODE_ENV=production`, `MONGO_URI`, `JWT_SECRET`, `CLIENT_ORIGIN=https://<your-frontend-origin>`, `TRUST_PROXY=true` (and optional `SMTP_URL`). Free tiers sleep when idle, so the first request is slow and the 60 s expiry job pauses while asleep (expired holds are still treated as free and cleaned lazily).

**Frontend — Vercel / Netlify / Cloudflare Pages:** root directory `client`, build `npm run build`, output `dist`, env `VITE_API_URL=https://<backend-host>/api` (set at build time). SPA fallback files are included (`client/vercel.json`, `client/public/_redirects`).

**Cookies across hosts:** with different registrable domains the session cookie is third-party (`SameSite=None; Secure`, HTTPS required on both). Some browsers block third-party cookies, which would break login. Prefer the same site — e.g. `app.example.com` and `api.example.com` (same registrable domain) — or serve both behind one domain.

## 7. Testing
| Check | Command | Needs |
|---|---|---|
| API unit/integration | `cd server && npm test` | Node; starts an in-memory MongoDB replica set (downloads a binary if not cached). Offline/blocked? use `MONGOMS_SYSTEM_BINARY=/path/to/mongod npm test` or `TEST_MONGO_URI="mongodb://127.0.0.1:27017/?replicaSet=rs0" npm test` against a throw-away database. |
| UI unit | `cd client && npm test` | Node |
| Lint | `npm run lint` (root) | ESLint 9 in client (incl. `jsx-a11y`), ESLint in server/e2e |
| Production build | `cd client && npm run build` | |
| Browser end-to-end, accessibility, responsive | see below | running stack + Chromium |

**Browser tests (`e2e/`)** run against the real stack and real MongoDB, so start it first (rate limits raised because the tests register many users):
```bash
# terminal 1: mongod replica set running; then
cd server && AUTH_RATE_LIMIT_MAX=5000 RESERVE_RATE_LIMIT_MAX=5000 SMTP_URL=json \
  CLIENT_ORIGIN=http://localhost:5173,http://127.0.0.1:4173 npm run seed && npm start
# terminal 2
cd client && VITE_ALLOW_SIMULATED_OUTCOME_SELECTION=true npm run build && npm run preview -- --host 127.0.0.1      # http://127.0.0.1:4173
# terminal 3
cd e2e && npx playwright install chromium
E2E_ADMIN_EMAIL=<seeded admin email> E2E_ADMIN_PASSWORD=<seeded admin password> npm test
```
Optional variables: `E2E_BASE_URL` (default `http://127.0.0.1:4173`), `E2E_CHROMIUM_PATH` (use an existing Chromium instead of `playwright install`), `E2E_SHOTS_DIR` (save responsive screenshots). The suites: `customer` (journey, failed payment, cancellation window), `concurrency` (two browsers/same seat, simultaneous reservations and payments, Socket.IO push, polling fallback), `admin` (real endpoints for anonymous/customer/admin + dashboard movie/theater CRUD and show create/edit/delete with confirm dialogs), `a11y` (axe WCAG 2.2 AA scans + keyboard tests), `responsive` (360/390/768/1366/1440 px). The tests create their own users, theaters and shows (names `E2E …`), so use a disposable database.

## 8. API summary (base `/api`, JSON `{success, data | message, errors?}`)
| Method & path | Access | Notes |
|---|---|---|
| `POST /auth/register`, `/auth/login` | public, rate-limited | HTTP-only `token` cookie; role never accepted from input |
| `POST /auth/logout`, `GET /auth/me` | cookie | |
| `GET /movies`, `/movies/genres`, `/movies/:id` | public | `search, genre, status, availability=withShows, page, limit` |
| `POST/PUT/DELETE /movies[/:id]` | admin | delete blocked while shows exist |
| `GET /theaters[/:id]`; `POST/PUT/DELETE` | public / admin | screens locked once shows exist |
| `GET /shows`, `/shows/:id`, `/shows/:id/seats` | public | `movie, theater, date=YYYY-MM-DD`; seat map has status/price/`heldByYou` |
| `POST /shows` | admin | creates a show and seat inventory atomically; overlapping schedules return 409 |
| `PUT /shows/:id` | admin | validates schedule changes; booking history blocks movie/theater/screen/start-time changes; price-only edits affect available seats only |
| `DELETE /shows/:id` | admin | physically deletes only shows with no booking records; otherwise returns 409 and preserves history |
| `POST /bookings/reserve` | customer | `{showId, seats:["A1","A2"]}` — transactional, all-or-nothing |
| `GET /bookings/mine`, `GET /bookings/:id` | owner (admin any) | detail includes `payments[]`, `cancellation` |
| `POST /bookings/:id/release` · `/pay` · `/cancel` | owner | Payment is simulated. Local/test mode can send an outcome for exercising failure paths; production outcome is selected server-side. |
| `GET /notifications`, `POST /notifications/read-all`, `POST /notifications/:id/read` | customer | `meta.unread` |
| `GET /admin/stats`, `GET /admin/bookings`, `POST /admin/bookings/:id/cancel` | admin | admin cancel may override the cut-off |

## 9. Security notes
### CSRF model (cookie authentication, no CSRF token)
The session is an HTTP-only cookie (`SameSite=Lax` in development, `SameSite=None; Secure` by default in production for cross-site hosting). Because `SameSite=None` does not stop cross-site requests, the API enforces strict `Origin` validation on every **unsafe** method (anything but `GET`/`HEAD`/`OPTIONS`):
1. If an `Origin` header is present it must **exactly equal** one normalised entry of `CLIENT_ORIGIN` (`null`, look-alike hosts, other ports/schemes, trailing slashes and comma lists are all rejected with 403).
2. If the request carries the auth cookie it **must** carry an allowed `Origin` — a cookie-bearing mutation without `Origin` is rejected (403 `Origin header required`). Browsers always send `Origin` on cross-origin `POST/PUT/PATCH/DELETE` and on same-origin `fetch()` calls of those methods, so the SPA (including through the Vite/host proxy) is unaffected; this was exercised with real Chromium in the E2E suite.
3. A request with **neither** `Origin` nor the cookie has no ambient credential to abuse (the API accepts no other credential: no bearer tokens, no API keys), so scripts can still call the public endpoints (login/register) and receive 401 on protected ones. There is no other supported non-browser client path.
4. Safe methods are never blocked by this check (they must not change state); CORS still withholds foreign pages from reading responses. Authentication and authorisation run separately afterwards and are unaffected by it.

Assumptions: the frontend origin(s) are listed exactly in `CLIENT_ORIGIN`; browsers are modern (send `Origin` on unsafe requests); proxies forward `Origin` unchanged; you do not add other cookie-authenticated clients. A double-submit/synchroniser CSRF token was considered and not adopted because the Origin policy already closes the missing-header gap without changing the client; it can be added later as defence in depth.

### Show scheduling concurrency
MongoDB cannot express "no two time ranges overlap" as a unique index, so `createShow`, `updateShow`, and `deleteShow` serialise schedule mutations per screen: each screen (theater + screen name) has one lock document (`ScreenSchedule`). Inside the transaction (snapshot read concern, majority write concern) the service (1) increments that document's `version`, (2) re-reads the movie/theater and runs the overlap query with the same session, then (3) inserts the show and its seats. Snapshot isolation gives first-committer-wins on the lock document: a competing creation either committed before our snapshot (its show is visible to our overlap query → 409) or is in flight/committed afterwards (our `$inc` fails with a WriteConflict, a `TransientTransactionError`; the transaction is aborted and re-run in a fresh snapshot that sees the winner → 409). Retries are bounded (5 attempts with jittered backoff; commit-result-unknown retries the commit only, 3 times); if contention persists the API answers 409 rather than ever committing without the check. A failed transaction rolls back the lock increment, show and seats together. Different screens use different lock documents and do not contend. Updates lock source and target screens in stable order. If booking history exists, movie/theater/screen/start-time changes are rejected; price edits change only AVAILABLE seat inventory, preserving held/booked-seat and booking price snapshots. Delete checks booking history and removes the show plus seat inventory in one transaction. Assumptions: MongoDB is a replica set; all show mutations go through this service; the unique indexes (`ScreenSchedule` on theater+screen, `Show` on theater+screen+start) exist (Mongoose builds them at startup).

### Other controls
bcryptjs hashing; JWT only in an HTTP-only cookie (never in a response body); role always read from the database; zod validation on every input with unknown fields stripped and operator objects rejected; 50 KB body limit; Helmet headers; CORS allow-list with credentials plus an `Origin` check on mutating requests; rate limits on auth and reservation; generic login errors with a cached dummy bcrypt hash generated at the **configured** work factor (unknown-email logins cost the same as wrong-password logins; verified by tests of configuration and behaviour, not wall-clock timing); fail-closed admin bootstrap (above); generic 500 responses (no stack/internals); prices/totals/ownership/state transitions computed or enforced on the server; admin routes protected server-side (the UI guard is cosmetic); startup refuses missing/short secrets. Not covered: CSRF tokens (relies on SameSite + the strict Origin policy above), account lockout/MFA/password reset, per-account rate limits, dependency auto-updates.

## 10. Troubleshooting
| Symptom | Cause / fix |
|---|---|
| `Transaction numbers are only allowed on a replica set member` | MongoDB is standalone → start with `--replSet rs0` and run `npm run db:init-replset`, or use Atlas; URI needs `?replicaSet=rs0` locally |
| `ECONNREFUSED 127.0.0.1:27017` / health shows `db: disconnected` | mongod not running or wrong `MONGO_URI` |
| `Invalid environment configuration … JWT_SECRET` | secret missing or < 32 chars |
| `403 Origin not allowed` / `403 Origin header required…`, or login works but you stay logged out | frontend origin missing from `CLIENT_ORIGIN`; in production check HTTPS, `COOKIE_SAMESITE=none`, `COOKIE_SECURE=true`, `TRUST_PROXY=true`, and third-party-cookie blocking (see §6) |
| `429 Too many attempts` while testing | auth rate limit (20 / 15 min per IP) — wait or raise `AUTH_RATE_LIMIT_MAX` for tests |
| Seat map updates only every 15 s | WebSocket blocked by a proxy; allow upgrades on `/socket.io/` |
| `mongodb-memory-server` cannot download a binary | use `MONGOMS_SYSTEM_BINARY` or `TEST_MONGO_URI` (§7) |
| Playwright: browser not found | `npx playwright install chromium` or set `E2E_CHROMIUM_PATH` |
| e2e: `Set E2E_ADMIN_EMAIL and E2E_ADMIN_PASSWORD` | pass the credentials you seeded |
| `create-admin`/`seed` abort with "…already exists with role CUSTOMER… NOT promoted" | someone registered `ADMIN_EMAIL` first; see *Admin bootstrap* in §3 |
| Creating a show returns 409 "overlapping" or "being changed by another request" | the screen already has a show in that window (duration + 15 min cleaning buffer), or two admins raced; retry with a different time |
| Empty catalogue / no upcoming shows | run `npm run seed`; it tops up through `SEED_SHOW_DAYS` (default 21). It skips shows before the stored release date and occupied screen slots. A reset is only for `imovies_demo`/`imovies_dev` and requires explicit confirmation. |
| `EADDRINUSE :5000` | another process uses the port; change `PORT` (and `VITE_PROXY_TARGET`) |

## 11. Manual QA checklist (each item also has an automated browser test unless marked manual)
- [ ] Register / login / bad login / logout · browse, search, filter · pick show · seat selection with legend
- [ ] Reserve → booking page with countdown · pay (success) → ticket, SIM reference, notification + navbar badge · pay (fail) → failure screen, seats released
- [ ] Cancel (≥ 2 h ahead) → refunded; inside the window the button is disabled with the reason
- [ ] Two browsers on one seat → one winner, clear conflict message · live update without reload · polling fallback
- [ ] Customers get "Admins only" and 403 from admin APIs; admin movie/theater CRUD and show create/edit/delete with confirmation dialogs
- [ ] **Manual:** look at the app on a real phone and with a screen reader (NVDA/VoiceOver) — automated axe + keyboard tests do not replace this
- [ ] **Manual:** real SMTP delivery with your provider; deployment to your hosts

## 12. Known limitations
**Show management supports create, edit, and safe delete.** Shows with booking history cannot be structurally edited or physically deleted; price-only edits update available seats and preserve booked/held seat price snapshots. There is still no whole-show cancellation workflow with refund/notification policy, so a booked show cannot be withdrawn through admin. There is no user-management or password-reset UI; Socket.IO is single-instance; admin lists are limited (movies 10/page, next 100 upcoming shows); native `window.confirm` dialogs remain for destructive actions. Seed movies include original local poster artwork.
