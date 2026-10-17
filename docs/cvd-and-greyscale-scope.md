# Scope Decision: Colour-Blindness Simulation, Greyscale Conversion and Map Reference Data (#11)

**Status**: Decided (2026-10-16)  
**Decision**: **Exclude** from `tol-palettes` scheme data; rely on primary mathematical standards if CVD simulation is needed in future tooling.

## Context
Paul Tol's notes page (`https://sronpersonalpages.nl/~pault/`) includes sections beyond the colour scheme definitions:
- `sec:colour_blindness` and `tab:blindvision`: colour-vision-deficiency (CVD) simulation notes and parameters.
- `sec:greyscale_conversion`: notes on how schemes behave when converted to greyscale by viewers or printers.
- `sec:world_maps` and `sec:map_making`: cartographic projection notes and example maps.

Our repository policy (`NOTICE`, #3) restricts `tol-palettes` to **colour values and structural lookup rules only**, with full attribution and the 3-clause BSD notice for data in `tol_colors.py`. Website prose, figures, PDF text, and templates carry no explicit open-source licence and are excluded.

## Evaluation & Rationale
1. **Colour-Vision-Deficiency (CVD) Simulation (`sec:colour_blindness`, `tab:blindvision`)**:
   - Physiological CVD simulation matrices originate in the published scientific literature — specifically **Machado, Oliveira, and Fernandes (2009)** (*"A Physiologically-based Model for Simulation of Color Vision Deficiency"*, IEEE TVCG 15(6):1291–1298) and **Viénot, Brettel, and Mollon (1999)**.
   - Extracting or paraphrasing `tab:blindvision` from Paul Tol's notes page is unnecessary and blurs the boundary with website prose/tables. If automated CVD contrast verification is added in the future, it should be implemented directly from the primary Machado et al. (2009) reference tables with direct academic citation.
2. **Greyscale Conversion (`sec:greyscale_conversion`)**:
   - Standard sRGB / ITU-R BT.709 relative luminance ($Y = 0.2126 R + 0.7152 G + 0.0722 B$) and WCAG 2.x contrast ratios are public international standards and are already computed directly in `tools/generate-gallery.mjs`.
   - Qualitative commentary on monochrome print suitability is prose and is intentionally excluded from `data/schemes/*.json`.
3. **World Maps & Projections (`sec:world_maps`, `sec:map_making`)**:
   - Cartographic commentary and figures are outside the scope of a colour-palette generator.

## Outcome
- No schema extensions to `schema/scheme.schema.json` are required.
- `tol-palettes` remains strictly focused on verified scheme colour values and multi-environment generators (`css`, `js`, `json`, `py`, `gpl`, `aseprite`, `godot`, `gallery`).
