# Valour & Fortitude Army Builder

Build napoleonic army lists for [Perry Miniatures' Valour & Fortitude](https://www.perry-miniatures.com/valour-fortitude/) rules. Pick an era and army sheet, add units and brigades, and export a PDF army list.

- **Live:** https://denlockhart.com/army-builder/
- **Folder:** `projects/army-builder/`
- **Rules source:** https://www.perry-miniatures.com/valour-fortitude/vf-army-sheets/

## Layout

```
projects/army-builder/
  index.html          # App entry
  app.js              # Main logic
  style.css
  fate-cards.js
  jspdf.umd.min.js    # Vendored PDF library — do not edit casually
  data/
    catalog.json      # Eras and army sheet index
    armies/*.json     # Unit profiles per army sheet
```

## Data vs user saves

| Kind | Where | Purpose |
|------|-------|---------|
| **Game reference data** | `data/*.json` in this folder | Unit catalogs, stats, points — same for all users |
| **User army lists** | Browser `localStorage` | Per-user drafts and saved lists (not in the repo) |

The `data/` folder is **not** for saving user armies. It ships the official unit database with the site. `netlify.toml` maps `/api/catalog` and `/api/army/:id` to these JSON files.

## Adding a new army sheet

1. Create `data/armies/<id>.json` matching the existing schema.
2. Register it in `data/catalog.json` under the correct era.
3. Army `id` should match the filename (without `.json`).

Verify stats and points against official Perry army sheets before changing them.

## Local development

Serve the **repo root** (not this folder alone) so API redirects work on Netlify, or open `/projects/army-builder/` directly:

```bash
npx serve .   # from repo root
```

## Conventions

- Vanilla JS — plain functions, `state` object, `$()` helper
- Do not edit `jspdf.umd.min.js` unless upgrading the library
- Cache-bust CSS/JS with `?v=` in `index.html` when assets change materially
