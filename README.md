# WSU Gradschool Slate Editor

HTML newsletter editor for **Friday Focus**, **Graduate School Briefing**, and **Slate Campaign** templates. This is a **Next.js** app, split out from the former WSU Graduate School tools monorepo as its own repository.

**Repository:** [github.com/gcrouch-wsu/wsu-gradschool-slate-editor](https://github.com/gcrouch-wsu/wsu-gradschool-slate-editor)

## What it does

- Rich editing (Tiptap) with preview, import/export HTML, validation, and plain-text generation.
- Template switching with defaults loaded from API routes (`/api/defaults/...`).
- Local auto-save / restore flows for in-progress drafts.

## Requirements

- **Node.js** 18+ (20+ recommended)
- **npm**

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

For production hosting on **Railway** or another Node host, use **`npm run build`** followed by **`npm run start`** so the platform-provided **`PORT`** is respected.

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
| `npm run start` | Production server (`next start`) |
| `npm run lint` | ESLint |
| `npm run format` | Prettier write |
| `npm run checkfmt` | Prettier check |

## Deployment

Deploy from **this** repo with **repository root** as the app root. Target platform: **Railway** or any Node host that runs `npm run build` and `npm run start` with `PORT` set.

## Related WSU Graduate School tools

This repo is maintained independently from the other Graduate School tools.

## Environment variables

No environment variables are required for this app in normal operation. If you add hosting-specific settings later, document them here and use `.env.local` locally (never commit secrets).
