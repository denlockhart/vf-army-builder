# denlockhart.com

Source for [denlockhart.com](https://denlockhart.com/) — a static site that hosts **Dennis Lockhart's side projects**. Each project is a self-contained app under `projects/`, listed on the home page.

Hosted on [Netlify](https://www.netlify.com/). Domain registered with [GoDaddy](https://www.godaddy.com/).

## Live URLs

| Page | URL |
|------|-----|
| Home | https://denlockhart.com/ |
| Valour & Fortitude Army Builder | https://denlockhart.com/army-builder/ |
| Source | https://github.com/denlockhart/vf-army-builder |

## Purpose

This repository is **not** a single-app repo. It is the monorepo for Dennis Lockhart's personal web projects:

- **Site root** (`index.html`, `site.css`) — home page that links to each project
- **`projects/`** — one folder per project; each project owns its own code and assets
- **`netlify.toml`** — hosting config, URL rewrites, and cache headers for the whole site

When you add a new project, you add a folder under `projects/`, link it from the home page, and add any Netlify redirects it needs.

## Repository layout

```
denlockhart.com/
  index.html              # Home page — lists all projects
  site.css                # Home page styles
  netlify.toml            # Netlify publish + redirects
  AGENTS.md               # Instructions for AI coding assistants
  .cursor/rules/          # Cursor project rules
  projects/
    army-builder/         # Valour & Fortitude army list builder
      README.md           # Project-specific docs
      index.html
      app.js
      data/               # Game reference data (unit catalogs)
        catalog.json
        armies/*.json
```

## Projects

| Project | Folder | Public URL | Description |
|---------|--------|------------|-------------|
| Valour & Fortitude Army Builder | `projects/army-builder/` | `/army-builder/` | Build napoleonic army lists and export PDFs |

See each project's `README.md` for project-specific details.

## Local development

No build step. Serve the repo root with any static file server:

```bash
npx serve .
```

Then open:

- Home: http://localhost:3000/
- Army Builder: http://localhost:3000/army-builder/

The `/army-builder/` URL is rewritten to `projects/army-builder/` by `netlify.toml`. Local dev servers may not apply those rewrites — use `/projects/army-builder/` locally, or a server that supports `_redirects`/`netlify.toml` rules.

## Adding a new project

1. Create `projects/<slug>/` with the app's `index.html` and assets.
2. Add a project card to `index.html` on the home page.
3. Add a `projects/<slug>/README.md` describing the project.
4. If the project needs a short public URL (e.g. `/my-tool/`), add a rewrite in `netlify.toml`:

   ```toml
   [[redirects]]
     from = "/my-tool/*"
     to = "/projects/my-tool/:splat"
     status = 200
   ```

5. Optionally add a scoped Cursor rule in `.cursor/rules/`.

## Deployment

- **Production branch:** `main`
- Pushes to `main` trigger Netlify production deploys.
- Only push when you intend to deploy.

## AI assistant docs

- [`AGENTS.md`](AGENTS.md) — repo-wide instructions for AI agents
- [`.cursor/rules/`](.cursor/rules/) — Cursor rules (site-wide and per-project)
