# WSU Gradschool Slate Editor

HTML newsletter editor for **Friday Focus**, **Graduate School Briefing**, and **Slate Campaign** templates. This is a **Next.js** app, split out from the former WSU Graduate School tools monorepo as its own repository.

**Repository:** [github.com/gcrouch-wsu/wsu-gradschool-slate-editor](https://github.com/gcrouch-wsu/wsu-gradschool-slate-editor)

## What it does

- Rich editing (Tiptap) with preview, import/export HTML, validation, and plain-text generation.
- Template switching with defaults loaded from API routes (`/api/defaults/...`).
- Local auto-save / restore flows for in-progress drafts.

## Requirements

- **Node.js** 20.9 or newer (the app declares `engines.node`)
- **npm**
- PostgreSQL only when trying shared newsletters locally. The editor at `/` runs without a database, including on Vercel.

## Quick start

1. Clone this repository:

```bash
git clone https://github.com/gcrouch-wsu/wsu-gradschool-slate-editor.git
cd wsu-gradschool-slate-editor
```

2. Install dependencies:

```bash
npm install
```

3. Run the development server:

```bash
npm run dev
```

By default the dev script uses **port 3001**. If that port is busy, adjust the `dev` script in `package.json` or set `PORT` in your environment before running `next dev`.

4. Production build (local smoke test):

```bash
npm run build
npm run start
```

`npm run start` runs `node scripts/start.mjs`, which binds `HOSTNAME` (default `0.0.0.0`) and `PORT` (default `3000`). That works on Windows and in a container. Do not rely on a shell default such as `${PORT:-3000}`.

## Project structure

```text
wsu-gradschool-slate-editor/
|-- app/                    # Next.js App Router (UI, API routes)
|-- components/             # React components
|-- lib/                    # Config, defaults, utilities
|-- types/                  # TypeScript types
|-- public/                 # Static assets (if present)
|-- package.json
|-- next.config.js
|-- tailwind.config.ts
|-- tsconfig.json
```

## Available scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Development server (`next dev`, port 3001) |
| `npm run build` | Production build (`next build`) |
| `npm run start` | Production server on `PORT` / `HOSTNAME` |
| `npm run lint` | ESLint |
| `npm run check` | Typecheck |
| `npm run test` | Unit and PostgreSQL tests |
| `npm run migrate` | Apply ordered SQL migrations |
| `npm run create-admin` | Provision the first administrator from an Okta issuer and subject |
| `npm run format` | Prettier write |
| `npm run checkfmt` | Prettier check |

## Authentication and shared editing

`AUTH_MODE=local` is the Vercel setup. Editors sign in with an email and password stored for that account. Passwords are hashed. Drafts are shared newsletters in Postgres.

`AUTH_MODE=development` is for local tests and is refused in production. It is not the staff login.

`AUTH_MODE=okta` is a future release. It does not replace local accounts until you select it.

## Deployment

The current host is Vercel. Create a Postgres database, set `AUTH_MODE=local`, `DATABASE_URL`, `SESSION_SECRET`, and `PUBLIC_ORIGIN`, then run migrations and create accounts. The steps are in [docs/deployment.md](docs/deployment.md). Do not commit `.env`.

Okta sign-in and an AWS move are later work.

## Related WSU Graduate School tools

This repo is maintained independently from the other Graduate School tools.

## Environment variables

See `.env.example`. Vercel does not need them. Okta mode, when that release is turned on, refuses to start cleanly unless the issuer, client id, client secret, session secret, public origin, and database URL are set.
