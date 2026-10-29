# iMovies Preview Status

**As of 2026-10-26, there is no hosted preview and no verified public URL.** The repository has been prepared for a local preview, but this remediation run could not execute the application: Node.js 22.16.0 is below the declared engine range, npm registry access failed (`EAI_AGAIN registry.npmjs.org`), and there was no MongoDB replica-set service. System Chromium was present, but Playwright dependencies were unavailable.

Older preview notes in the supplied archive report earlier successful runs in another environment. They were not re-run here and do not validate the new show-editing, database guard, seeding, or payment changes.

## Local preview steps

1. Install Node.js 22.22.2 or another version accepted by the package engines.
2. Install MongoDB and run it as a replica set, or create an eligible MongoDB Atlas cluster. For local setup, start `mongod --replSet rs0 --dbpath <demo-data-path> --port 27017 --bind_ip 127.0.0.1` and run `cd server && npm run db:init-replset` once.
3. Copy `server/.env.example` to `server/.env`; set a random `JWT_SECRET`, a private `ADMIN_PASSWORD`, and the intended demo `MONGO_URI`. Do not commit `.env`.
4. From the root, install package lockfiles with `npm run install:all`.
5. Run `cd server && npm run seed && npm run dev`, then `cd client && npm run dev`. Open `http://localhost:5173`.
6. Follow README §7 for backend/client test commands and the complete Playwright suite. Browser tests need the full stack, a disposable database, `E2E_ADMIN_EMAIL`, and `E2E_ADMIN_PASSWORD`.

## Deployment status

- Backend / frontend: not deployed.
- MongoDB Atlas: no connection verified in this run.
- Render / Vercel: no authenticated deployment attempted.
- Screenshots: none generated during this run.
- Simulation disclaimer: checkout is a demonstration only; there is no integrated real payment gateway and no real money is charged.
