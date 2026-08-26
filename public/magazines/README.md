# /public/magazines

Drop each monthly issue's PDF directly in this folder. Nothing else needs to
change — the site figures out the current edition automatically at build
time (see `scripts/generate-magazine-manifest.ts`).

## File naming (required)

```
YYYY-MM-nombre-que-quieras.pdf
```

Examples:

```
2026-08-revista-tenis.pdf
2026-09-revista-tenis.pdf
```

Only the `YYYY-MM-` prefix matters for sorting; the rest of the filename is
free text. The file with the newest year/month becomes `/revista` (the home
page); every other file stays reachable at `/revista/YYYY-MM`.

## Covers (optional)

Drop an optional cover image at `covers/YYYY-MM.jpg` (`.jpg`, `.jpeg`, `.png`,
or `.webp` all work) to show a real cover on the archive page instead of the
generated placeholder. Match the PDF's YYYY-MM, e.g. `covers/2026-08.jpg` for
`2026-08-revista-tenis.pdf`.

## Publishing a new issue

1. Add the new PDF here (and, optionally, its cover under `covers/`).
2. Commit and push.
3. Vercel builds automatically. `/revista` now shows the new issue; the
   previous one is still available at its own `/revista/YYYY-MM` URL.

No code changes, no manual manifest edits.
