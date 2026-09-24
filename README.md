# app-monorepo

A Turborepo-managed monorepo with two independently-deployable apps:

- `apps/web` — React + Vite + TypeScript SPA
- `apps/server` — Express + TypeScript API

Turborepo sits on top of npm workspaces: npm handles installing and linking dependencies across `apps/*`, and Turborepo orchestrates/caches the `dev`/`build`/`lint` tasks declared in `turbo.json`.

## Development

```bash
npm install
npm run dev
```

`npm run dev` runs `turbo run dev`, which starts both apps' dev servers concurrently (this task is `persistent` and uncached in `turbo.json`, since dev servers watch files and never "finish"):

- `apps/web`: Vite dev server at http://localhost:5173
- `apps/server`: `tsx watch` at http://localhost:3001

In dev, `apps/web/vite.config.ts` proxies any request to `/api/*` to `http://localhost:3001`, so the frontend can call `fetch("/api/health")` with no CORS setup needed. Try it — the sample `App.tsx` calls this on mount and renders the result.

## How the build works

```bash
npm run build
```

This runs `turbo run build`. Turborepo:

1. Reads the dependency graph across workspaces. `web` and `server` don't depend on each other today, so they build in parallel (the `dependsOn: ["^build"]` rule in `turbo.json` only matters once a shared `packages/*` library is introduced — it makes sure that builds first).
2. Hashes each package's inputs (source files, `package.json`, lockfile). If nothing changed since the last successful build, it replays the cached `outputs` (`dist/**`) instead of re-running the build — you'll see `>>> FULL TURBO` and near-instant timing on a repeat run with no changes.
3. On a cache miss, it runs each package's own `build` script:
   - `apps/web`: `tsc -b && vite build` — type-checks, then bundles into `apps/web/dist/`: minified, hashed-filename JS/CSS/assets plus a self-contained `index.html`. This is a fully static site — no Node runtime needed to serve it.
   - `apps/server`: `tsc -p tsconfig.json` — transpiles `src/**/*.ts` into plain (unbundled) `.js` in `apps/server/dist/`. This still needs a Node runtime (`node dist/index.js`) and the package's `node_modules` (express, cors) to run.

## Deployment

Two apps, two artifacts, two reasonable deployment patterns:

### Pattern A — separate deployments (recommended default)

- **`apps/web`**: deploy the static `apps/web/dist/` output to a static host/CDN — Vercel, Netlify, Cloudflare Pages, or S3+CloudFront. Build command: `npm run build --workspace=web` (or `turbo run build --filter=web`); output directory: `apps/web/dist`.
- **`apps/server`**: deploy to a Node-capable host — Render, Railway, Fly.io, a VPS, or a Docker container. Deploy steps: `npm ci`, `npm run build --workspace=server`, then `npm run start --workspace=server` (runs `node dist/index.js`).
- **Wiring the two together**: since they're on different origins in production, set:
  - `VITE_API_URL` (build-time env on the static host) to the server's real URL, e.g. `https://api.yourdomain.com`
  - `CORS_ORIGIN` (runtime env on the server) to the web app's real origin, e.g. `https://app.yourdomain.com`
- **Why this is the default**: independent release cycles (ship a frontend fix without redeploying the API), and CI can skip rebuilding whichever app didn't change (`turbo run build --filter=...[HEAD^]`).

### Pattern B — monolith (simpler, single deploy)

Have Express serve the built SPA itself, so there's only one deployable:

```ts
import path from "node:path";
const webDist = path.resolve(import.meta.dirname, "../../web/dist");
app.use(express.static(webDist));
app.get("*", (_req, res) => res.sendFile(path.join(webDist, "index.html")));
```

(Add this after the `/api/*` routes so API routes still take priority.) Build both apps, then deploy just `apps/server` — with `apps/web/dist` alongside it — to one Node host. No CORS config needed since everything is same-origin, and `VITE_API_URL` can be left unset (defaults to relative `/api`). Trade-off: no independent scaling or CDN edge-caching of static assets. Good fit for small or early-stage projects where operational simplicity matters more than that.

## Extending the monorepo

Add a `packages/*` workspace (e.g. `packages/shared` for types/utilities shared between `web` and `server`) once there's real shared code — the `dependsOn: ["^build"]` rule in `turbo.json` already ensures such a package builds before the apps that import it.
