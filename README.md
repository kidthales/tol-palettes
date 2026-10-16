# tol-palettes

Colour scheme data inspired by and sourced from [Paul Tol's notes](https://sronpersonalpages.nl/~pault/), with generators for several environments. Independent project: not affiliated with or endorsed by Paul Tol.

> Status: bootstrapping. See the epic (#1) for scope and the ticket order.

## Scope

- **Values only, with attribution.** The project stores colour values; it does not copy the notes' prose, figures, the PDF or the LaTeX template.
- **No invented names.** A colour name appears only when the official source provides one.
- One hand-verified JSON file per scheme is the only hand-edited layer; every output is generated from it.

## Layout

| Path | Purpose |
|---|---|
| `data/schemes/` | Verified scheme data (JSON) |
| `src/` | Generator code |
| `dist/` | Generated outputs (`css`, `js`, `json`, `py`, `godot`, `aseprite`, `gpl`), committed so drift is visible |
| `tests/` | Schema, data and generator tests |

## Attribution

Sources: the notes page, `tol_colors.py` (Copyright 2022 Paul Tol, 3-clause BSD) and the accompanying PDF. Full attribution and the BSD notice are tracked in the licensing ticket (#3) and will be added to `NOTICE`.

## Conventions

- Conventional Commits.
- Agent configuration and learnings are never tracked (see `.gitignore`); CI fails if they are.
