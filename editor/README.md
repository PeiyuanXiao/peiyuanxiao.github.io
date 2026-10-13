# Website editor

Local, form-based editor for this site's publications, talks and author profile.
User instructions are in [../EDITING-GUIDE.md](../EDITING-GUIDE.md) (section 0).

**Start:** double-click `编辑网站.bat` in the repo root, or run `node editor/server.mjs --open`
after loading the toolchain (`. F:\dev\env.ps1`). The editor runs on http://localhost:4313 and
starts `hugo server` on port 1313 for the live preview (or reuses one that is already running).

It only reads and writes files under `content/publications`, `content/events`,
`data/authors/me.yaml` and `assets/media/authors/`. It never commits or pushes.

## Layout

| Path | Role |
| --- | --- |
| `server.mjs` | HTTP API + static files, starts Hugo, localhost-only |
| `lib/yamlfile.mjs` | Format-preserving YAML edits: only changed values are rewritten |
| `lib/content.mjs` | Publication/talk bundles, attachments, profile; deletions go to `.trash/` |
| `lib/citation.mjs` | DOI lookup (doi.org, then Crossref) and BibTeX parsing |
| `lib/git.mjs` | Read-only change list, diffs and per-file revert |
| `ui/` | Browser UI (Preact + htm, no build step); strings in `ui/i18n.js` |
| `test.mjs` | Self-test: `node editor/test.mjs` |

## Notes

- Run `node editor/test.mjs` after upgrading the `yaml` package or Hugo Blox; it checks that every
  content file still round-trips byte-for-byte.
- New front-matter fields: add them to the form in `ui/publication.js` / `ui/event.js`.
  Fields the form does not know about are preserved on save.
- `H:` is exFAT (no symlinks), hence `node-linker=hoisted` in `.npmrc`.
