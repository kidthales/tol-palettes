// Generates dist/py/tol_palettes.py from data/schemes/*.json.
// Provides pure-Python access to all 22 schemes plus matplotlib-compatible
// tol_cset() and tol_cmap() functions (matplotlib imported lazily on demand).
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadSchemes } from './validate.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

export const PY_HEADER = `"""
Paul Tol colour schemes — generated from data/schemes/*.json by tools/generate-py.mjs.
Do not edit by hand.

Sources:
- Paul Tol's Notes: https://sronpersonalpages.nl/~pault/
- Official Python module tol_colors.py (version 2022.10):
  https://sronpersonalpages.nl/~pault/data/tol_colors.py

Independent project: not affiliated with or endorsed by Paul Tol.
Policy: colour values only; colour names are present only where tol_colors.py provides them.

3-Clause BSD Notice for values and colormap structure derived from tol_colors.py:
Copyright (c) 2022, Paul Tol. All rights reserved.

Redistribution and use in source and binary forms, with or without modification,
are permitted provided that the following conditions are met:
1. Redistributions of source code must retain the above copyright notice, this
   list of conditions and the following disclaimer.
2. Redistributions in binary form must reproduce the above copyright notice,
   this list of conditions and the following disclaimer in the documentation
   and/or other materials provided with the distribution.
3. Neither the name of the copyright holder nor the names of its contributors
   may be used to endorse or promote products derived from this software without
   specific prior written permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND
ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE FOR
ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
(INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES;
LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON
ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
(INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS
SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
"""
`;

function pyRepr(val, indent = 0) {
  const pad = ' '.repeat(indent);
  const innerPad = ' '.repeat(indent + 4);
  if (val === null || val === undefined) return 'None';
  if (typeof val === 'boolean') return val ? 'True' : 'False';
  if (typeof val === 'number') return String(val);
  if (typeof val === 'string') return `'${val.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
  if (Array.isArray(val)) {
    if (val.length === 0) return '()';
    const allPrimitive = val.every((x) => typeof x !== 'object' || x === null);
    if (allPrimitive && val.length <= 12) {
      return `(${val.map((x) => pyRepr(x, 0)).join(', ')}${val.length === 1 ? ',' : ''})`;
    }
    const items = val.map((x) => `${innerPad}${pyRepr(x, indent + 4)},`);
    return `(\n${items.join('\n')}\n${pad})`;
  }
  if (typeof val === 'object') {
    const keys = Object.keys(val);
    if (keys.length === 0) return '{}';
    const entries = keys.map((k) => `${innerPad}${pyRepr(k, 0)}: ${pyRepr(val[k], indent + 4)},`);
    return `{\n${entries.join('\n')}\n${pad}}`;
  }
  return String(val);
}

export function generatePyModule(schemes = loadSchemes().map((x) => x.data)) {
  const sorted = [...schemes].sort((a, b) => a.id.localeCompare(b.id));
  const byId = Object.fromEntries(sorted.map((s) => [s.id, s]));

  // Official qualitative sets with named fields (colors + extras, matching tol_colors.py 2022.10)
  const officialCsetIds = ['bright', 'high-contrast', 'vibrant', 'muted', 'medium-contrast', 'light'];
  const namedCsets = {};
  for (const id of officialCsetIds) {
    const s = byId[id];
    const all = [...s.colors, ...(s.extras ?? [])];
    namedCsets[id] = {
      fields: all.map((c) => c.name),
      hex: all.map((c) => c.hex),
    };
  }

  // Site-only discrete sets (values only, no invented names)
  const unnamedCsetIds = ['dark', 'pale', 'groundcover'];
  const unnamedCsets = {};
  for (const id of unnamedCsetIds) {
    const s = byId[id];
    unnamedCsets[id] = s.colors.map((c) => c.hex);
  }

  // Colormaps dictionary (official 17 names + site-only ordered schemes)
  const cmaps = {};
  const addCmap = (name, colors, bad, mode) => {
    cmaps[name] = { colors, bad: bad ?? '#FFFFFF', mode };
  };

  for (const [id, modName] of [
    ['sunset', 'sunset'],
    ['nightfall', 'nightfall'],
    ['burd', 'BuRd'],
    ['prgn', 'PRGn'],
    ['ylorbr', 'YlOrBr'],
  ]) {
    const s = byId[id];
    const fullHex = s.colors.map((c) => c.hex);
    const discHex = s.discreteIndexes ? s.discreteIndexes.map((i) => s.colors[i].hex) : fullHex;
    addCmap(`${modName}_discrete`, discHex, s.bad, 'discrete');
    addCmap(modName, fullHex, s.bad, 'linear');
  }

  addCmap('WhOrBr', byId['whorbr'].colors.map((c) => c.hex), byId['whorbr'].bad, 'linear');
  addCmap('iridescent', byId['iridescent'].colors.map((c) => c.hex), byId['iridescent'].bad, 'linear');

  const rs = byId['rainbow-smooth'];
  for (const sub of rs.subranges ?? []) {
    const slice = rs.colors.slice(sub.from, sub.to + 1).map((c) => c.hex);
    addCmap(sub.id, slice, sub.bad ?? rs.bad, 'linear');
  }

  // Site-only sequential schemes
  const inc = byId['incandescent'];
  addCmap('incandescent', inc.colors.map((c) => c.hex), inc.bad, 'linear');
  addCmap('incandescent_discrete', inc.colors.map((c) => c.hex), inc.bad, 'discrete');

  for (const bId of ['banded-12', 'banded-16', 'banded-20']) {
    const bs = byId[bId];
    addCmap(bId.replace('-', '_'), bs.colors.map((c) => c.hex), bs.bad, 'discrete');
  }

  const rd = byId['rainbow-discrete'];
  const rdColors = rd.colors.map((c) => c.hex);
  const rdLut = rd.lut;
  const rdLutBad = rd.lutBad ?? {};
  const rdDefaultBad = rd.bad ?? '#FFFFFF';

  const schemesDict = Object.fromEntries(
    sorted.map((s) => [
      s.id,
      {
        id: s.id,
        kind: s.kind,
        colors: s.colors.map((c) => c.hex),
        ...(s.extras ? { extras: s.extras.map((c) => c.hex) } : {}),
        ...(s.bad ? { bad: s.bad } : {}),
        interpolation: s.interpolation,
      },
    ]),
  );

  return `${PY_HEADER}
from collections import namedtuple

__all__ = [
    'SCHEMES',
    'OFFICIAL_CSET_NAMES',
    'CSET_NAMES',
    'OFFICIAL_CMAP_NAMES',
    'CMAP_NAMES',
    'tol_cset',
    'tol_cmap_colors',
    'tol_cmap',
    'discretemap',
]

SCHEMES = ${pyRepr(schemesDict, 0)}

OFFICIAL_CSET_NAMES = ${pyRepr(officialCsetIds, 0)}

CSET_NAMES = ${pyRepr([...officialCsetIds, ...unnamedCsetIds], 0)}

_NAMED_CSETS = ${pyRepr(namedCsets, 0)}

_UNNAMED_CSETS = ${pyRepr(unnamedCsets, 0)}

OFFICIAL_CMAP_NAMES = (
    'sunset_discrete', 'sunset', 'nightfall_discrete', 'nightfall',
    'BuRd_discrete', 'BuRd', 'PRGn_discrete', 'PRGn',
    'YlOrBr_discrete', 'YlOrBr', 'WhOrBr', 'iridescent',
    'rainbow_PuRd', 'rainbow_PuBr', 'rainbow_WhRd', 'rainbow_WhBr',
    'rainbow_discrete',
)

_CMAPS = ${pyRepr(cmaps, 0)}

_RAINBOW_DISCRETE_COLORS = ${pyRepr(rdColors, 0)}

_RAINBOW_DISCRETE_LUT = ${pyRepr(rdLut, 0)}

_RAINBOW_DISCRETE_BAD = ${pyRepr(rdLutBad, 0)}

_RAINBOW_DISCRETE_DEFAULT_BAD = ${pyRepr(rdDefaultBad, 0)}

CMAP_NAMES = OFFICIAL_CMAP_NAMES + (
    'incandescent', 'incandescent_discrete',
    'banded_12', 'banded_16', 'banded_20',
)


def tol_cset(colorset=None):
    """
    Discrete colour sets for qualitative and categorical data.

    - When 'colorset' is None, returns 'OFFICIAL_CSET_NAMES'.
    - For schemes from tol_colors.py ('bright', 'high-contrast', 'vibrant',
      'muted', 'medium-contrast', 'light'), returns a namedtuple with the
      official colour names and hex values.
    - For site-only schemes ('dark', 'pale', 'groundcover'), returns a tuple
      of #RRGGBB hex strings (no colour names are invented).
    """
    if colorset is None:
        return OFFICIAL_CSET_NAMES
    if colorset in _NAMED_CSETS:
        entry = _NAMED_CSETS[colorset]
        cls_name = colorset.replace('-', '_').title().replace('_', '') + 'Cset'
        tuple_cls = namedtuple(cls_name, entry['fields'])
        return tuple_cls(*entry['hex'])
    if colorset in _UNNAMED_CSETS:
        return _UNNAMED_CSETS[colorset]
    raise ValueError(f"Unknown colorset {colorset!r}. Known sets: {CSET_NAMES}")


def tol_cmap_colors(colormap='rainbow_PuRd', lut=None):
    """
    Return (colors, bad_hex, mode) for an ordered colormap without requiring matplotlib.

    'mode' is either 'linear' or 'discrete'.
    For 'rainbow_discrete', 'lut' selects the number of discrete stops (1..23, default 22).
    """
    if colormap is None:
        return OFFICIAL_CMAP_NAMES
    if colormap == 'rainbow_discrete' or colormap == 'rainbow-discrete':
        if lut is None or not isinstance(lut, int) or lut < 1 or lut > len(_RAINBOW_DISCRETE_LUT):
            lut = 22
        idxs = _RAINBOW_DISCRETE_LUT[lut - 1]
        clrs = tuple(_RAINBOW_DISCRETE_COLORS[i] for i in idxs)
        bad = _RAINBOW_DISCRETE_BAD.get(str(lut), _RAINBOW_DISCRETE_DEFAULT_BAD)
        return clrs, bad, 'discrete'
    normalized = colormap.replace('-', '_') if colormap not in _CMAPS else colormap
    if normalized in _CMAPS:
        entry = _CMAPS[normalized]
        return entry['colors'], entry['bad'], entry['mode']
    raise ValueError(f"Unknown colormap {colormap!r}. Known colormaps: {CMAP_NAMES}")


def discretemap(colormap, hexclrs):
    """
    Produce a matplotlib colormap from a list of discrete colours without interpolation.
    Requires matplotlib and numpy.
    """
    import numpy as np
    from matplotlib.colors import LinearSegmentedColormap, to_rgba_array

    clrs = to_rgba_array(list(hexclrs))
    clrs = np.vstack([clrs[0], clrs, clrs[-1]])
    cdict = {}
    for ki, key in enumerate(('red', 'green', 'blue')):
        cdict[key] = [
            (i / (len(clrs) - 2.0), float(clrs[i, ki]), float(clrs[i + 1, ki]))
            for i in range(len(clrs) - 1)
        ]
    return LinearSegmentedColormap(colormap, cdict)


def tol_cmap(colormap=None, lut=None):
    """
    Return a matplotlib colormap for ordered data (continuous or discrete).
    When 'colormap' is None, returns 'OFFICIAL_CMAP_NAMES'.
    Requires matplotlib (imported lazily).
    """
    if colormap is None:
        return OFFICIAL_CMAP_NAMES
    from matplotlib.colors import LinearSegmentedColormap

    clrs, bad, mode = tol_cmap_colors(colormap, lut=lut)
    if mode == 'discrete':
        cmap = discretemap(colormap, clrs)
    else:
        cmap = LinearSegmentedColormap.from_list(colormap, list(clrs))
    cmap.set_bad(bad)
    return cmap
`;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const schemes = loadSchemes().map((x) => x.data);
  const pyDir = join(root, 'dist', 'py');
  rmSync(pyDir, { recursive: true, force: true });
  mkdirSync(pyDir, { recursive: true });
  writeFileSync(join(pyDir, 'tol_palettes.py'), generatePyModule(schemes));
  console.log('Wrote dist/py/tol_palettes.py.');
}
