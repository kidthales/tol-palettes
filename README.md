# tol-palettes

Colour scheme data inspired by and sourced from [Paul Tol's notes](https://sronpersonalpages.nl/~pault/), with multi-environment generators. Independent project: not affiliated with or endorsed by Paul Tol.

## Scope & Policy

- **Values only, with attribution.** The project stores colour values and structural lookup rules (`data/schemes/*.json`); it does not copy the notes' prose, figures, the PDF or the LaTeX template.
- **No invented names.** A colour name appears only when the official `tol_colors.py` module provides one (the 6 qualitative schemes: `bright`, `high-contrast`, `vibrant`, `muted`, `medium-contrast`, `light`).
- **Single source of truth.** One hand-verified JSON file per scheme (22 schemes total) is the only canonical data layer; every environment output in `dist/` is deterministically generated from it.

## Layout & Generated Outputs

| Path | Command | Description |
|---|---|---|
| `data/schemes/*.json` | `npm run validate` | 22 verified scheme JSON files validated against `schema/scheme.schema.json` |
| `dist/css/` | `npm run generate:css` | Per-scheme CSS custom properties (`<id>.css`) and bundle (`tol.css`) — see [`docs/css.md`](docs/css.md) |
| `dist/js/` & `dist/json/` | `npm run generate:js` | Tree-shakeable ESM module (`index.js` + `index.d.ts`) and flat `schemes.json` — see [`docs/js.md`](docs/js.md) |
| `dist/py/` | `npm run generate:py` | Python module (`tol_palettes.py`) with optional `matplotlib` support — see [`docs/python.md`](docs/python.md) |
| `dist/gpl/`, `dist/aseprite/`, `dist/godot/` | `npm run generate:game` | GIMP/Aseprite `.gpl` palettes, Godot 4.x `tol_palettes.gd` and `ColorPalette` `.tres` resources — see [`docs/game.md`](docs/game.md) |
| `dist/gallery/` | `npm run generate:gallery` | Self-contained offline HTML reference gallery (`index.html`) with copyable hex codes and WCAG contrast ratios |

## Regenerating & Testing

```bash
npm run validate   # Validate all 22 scheme JSON files against schema + invariants
npm run generate   # Regenerate all outputs in dist/
npm test           # Run full schema, CSS, JS/TS, Python, Game/Godot/GPL and Gallery test suite
```

## Attribution

Sources: [Paul Tol's Notes](https://sronpersonalpages.nl/~pault/) and `tol_colors.py` (version 2022.10, Copyright (c) 2022, Paul Tol, 3-clause BSD). See [`NOTICE`](NOTICE) for full attribution and the BSD licence notice, and [`docs/cvd-and-greyscale-scope.md`](docs/cvd-and-greyscale-scope.md) for the scope decision on colour-blindness and greyscale reference material.
