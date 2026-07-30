# Amulet Integra

`amulet_integra/` is the non-destructive integration workspace for the Amuletmaiden **Face** and **Archive** sites.

## Preservation contract

1. **Published versions are immutable.** A directory under `versions/` is never edited after it is published.
2. **Every revision gets a new version directory.** Use `versions/YYYY-MM-DD-<slug>/`; do not reuse a prior name.
3. **Copy, never move, source sites.** The Face and Archive source directories remain intact and editable in their original locations.
4. **Only pointers are mutable.** `current.json` and the root `index.html` may point to a newer immutable version; old versions remain directly addressable.
5. **Record provenance.** Each version contains `version.json` with source paths or source commit IDs, copied-at time, file counts, checksums where practical, known limitations, and the README instructions applied.
6. **No silent overwrite.** Automation must fail if its target version directory already exists or if a destination file differs from the version manifest.
7. **Public review is required.** Private source bundles, internal K–T doctrine, local paths, credentials, and unreviewed personal material must not be published to GitHub Pages.

## Intended Pages structure

```text
amulet_integra/
  index.html                 # stable landing page
  current.json               # pointer to the selected immutable version
  versions.json              # append-only version catalogue
  assets/                    # integration-shell assets
  versions/
    YYYY-MM-DD-slug/
      index.html             # integrated Face + Archive entrypoint
      face/                  # copied Face site snapshot
      archive/               # copied Archive site snapshot
      version.json           # provenance and integrity record
```

## Integration principles

- Follow both source READMEs; when they conflict, preserve both behaviors and document the chosen seam.
- Keep original HTML, Kata color, typography, layout, motion, media, tags, chronology, and permalinks wherever technically possible.
- Add integration as a shell around the two sites before rewriting either one.
- Prefer progressive enhancement: both source snapshots should remain usable without the integration JavaScript.
- Use relative URLs so every historical version remains independently browsable on GitHub Pages.
- Fix navigation, accessibility, search, performance, and link integrity without flattening the original work.

## Release procedure

1. Inventory both source sites and read their README files.
2. Choose explicit source revisions and copy them into a new version directory.
3. Apply integration changes only inside that new version.
4. Validate internal links, entrypoints, media references, and accidental private-path exposure.
5. Append the version to `versions.json`.
6. Update `current.json` only after validation.
7. Preserve the previous current version permanently.

This folder is intentionally separate from all existing Pages projects and cannot overwrite them by construction.
