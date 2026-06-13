# denlockhart.com — Agent Instructions

Edit this file to tell AI assistants how to work in this repo.

## What this repo is

A **multi-project static site** for Dennis Lockhart's personal web projects. It is hosted at [denlockhart.com](https://denlockhart.com/).

This is **not** a single-application repository. Think of it as a small project host:

- **Site shell** at the repo root — home page that lists projects
- **Individual projects** in `projects/<slug>/` — each is self-contained
- **Netlify** deploys the whole repo; `netlify.toml` maps short public URLs to project folders

## Live site

- **Home:** https://denlockhart.com/
- **Repo:** https://github.com/denlockhart/vf-army-builder
- **Hosting:** Netlify (`netlify.toml` at repo root)

## Repository layout

```
denlockhart.com/
  index.html              # Home page — project index
  site.css                # Home page styles only
  netlify.toml            # Publish dir, URL rewrites, headers
  projects/
    army-builder/         # VF Army Builder (only project so far)
      README.md
      index.html, app.js, style.css, ...
      data/               # Game reference data (not user saves)
```

## Working on a specific project

1. Identify which project under `projects/` you are changing.
2. Read that project's `README.md` for project-specific rules.
3. Keep changes scoped to that project folder unless you are updating the home page, site styles, or Netlify config.
4. User-specific data (saved army lists, preferences, etc.) belongs in **browser localStorage**, not in the repo.

## Adding a new project

1. Create `projects/<slug>/` with the app files.
2. Add a project card to root `index.html`.
3. Add `projects/<slug>/README.md`.
4. Add Netlify rewrites in `netlify.toml` if the project needs a short URL (see root `README.md`).
5. Optionally add `.cursor/rules/<slug>.mdc` with `globs: projects/<slug>/**/*`.

## Local development

```bash
npx serve .
# Home:        http://localhost:3000/
# Army builder: http://localhost:3000/projects/army-builder/
#               (or /army-builder/ if your server applies netlify.toml rewrites)
```

## Deployment (Netlify)

- Production branch: `main`
- Pushes to `main` trigger production deploys (15 credits each on Netlify free tier).
- Only push to GitHub when asked to deploy.

## Coding conventions (repo-wide)

- **Static site** — no framework, no bundler, no build step unless a project explicitly adds one.
- Keep diffs small and focused; match the style of the project you are editing.
- Do not add dependencies unless there is a clear need.
- Do not add markdown/docs files unless requested (except updating README/AGENTS when structure changes).

## Git and commits

- Create commits when you complete a feature or request.
- Do not push unless explicitly asked.

## Things to avoid

- Treating this repo as only the army builder — check whether changes belong at the site root or inside a project folder.
- Putting user-specific saved data in the repo — that belongs in localStorage.
- Over-engineering shared abstractions across projects — each project should stay self-contained.
