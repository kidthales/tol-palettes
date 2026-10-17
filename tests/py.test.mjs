import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadSchemes } from '../tools/validate.mjs';
import { generatePyModule } from '../tools/generate-py.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pyPath = join(root, 'dist', 'py', 'tol_palettes.py');

// Pinned official values from tol_colors.py 2022.10 (test fixture only)
const OFFICIAL_CSETS = {
  bright: {
    fields: ['blue', 'red', 'green', 'yellow', 'cyan', 'purple', 'grey', 'black'],
    hex: ['#4477AA', '#EE6677', '#228833', '#CCBB44', '#66CCEE', '#AA3377', '#BBBBBB', '#000000'],
  },
  'high-contrast': {
    fields: ['blue', 'yellow', 'red', 'black'],
    hex: ['#004488', '#DDAA33', '#BB5566', '#000000'],
  },
  vibrant: {
    fields: ['orange', 'blue', 'cyan', 'magenta', 'red', 'teal', 'grey', 'black'],
    hex: ['#EE7733', '#0077BB', '#33BBEE', '#EE3377', '#CC3311', '#009988', '#BBBBBB', '#000000'],
  },
  muted: {
    fields: ['rose', 'indigo', 'sand', 'green', 'cyan', 'wine', 'teal', 'olive', 'purple', 'pale_grey', 'black'],
    hex: ['#CC6677', '#332288', '#DDCC77', '#117733', '#88CCEE', '#882255', '#44AA99', '#999933', '#AA4499', '#DDDDDD', '#000000'],
  },
  'medium-contrast': {
    fields: ['light_blue', 'dark_blue', 'light_yellow', 'dark_red', 'dark_yellow', 'light_red', 'black'],
    hex: ['#6699CC', '#004488', '#EECC66', '#994455', '#997700', '#EE99AA', '#000000'],
  },
  light: {
    fields: ['light_blue', 'orange', 'light_yellow', 'pink', 'light_cyan', 'mint', 'pear', 'olive', 'pale_grey', 'black'],
    hex: ['#77AADD', '#EE8866', '#EEDD88', '#FFAABB', '#99DDFF', '#44BB99', '#BBCC33', '#AAAA00', '#DDDDDD', '#000000'],
  },
};

const OFFICIAL_CMAPS = {
  sunset: {
    colors: ['#364B9A', '#4A7BB7', '#6EA6CD', '#98CAE1', '#C2E4EF', '#EAECCC', '#FEDA8B', '#FDB366', '#F67E4B', '#DD3D2D', '#A50026'],
    bad: '#FFFFFF',
    mode: 'linear',
  },
  sunset_discrete: {
    colors: ['#364B9A', '#4A7BB7', '#6EA6CD', '#98CAE1', '#C2E4EF', '#EAECCC', '#FEDA8B', '#FDB366', '#F67E4B', '#DD3D2D', '#A50026'],
    bad: '#FFFFFF',
    mode: 'discrete',
  },
  nightfall: {
    colors: ['#125A56', '#00767B', '#238F9D', '#42A7C6', '#60BCE9', '#9DCCEF', '#C6DBED', '#DEE6E7', '#ECEADA', '#F0E6B2', '#F9D576', '#FFB954', '#FD9A44', '#F57634', '#E94C1F', '#D11807', '#A01813'],
    bad: '#FFFFFF',
    mode: 'linear',
  },
  nightfall_discrete: {
    colors: ['#125A56', '#238F9D', '#60BCE9', '#C6DBED', '#ECEADA', '#F9D576', '#FD9A44', '#E94C1F', '#A01813'],
    bad: '#FFFFFF',
    mode: 'discrete',
  },
  BuRd: {
    colors: ['#2166AC', '#4393C3', '#92C5DE', '#D1E5F0', '#F7F7F7', '#FDDBC7', '#F4A582', '#D6604D', '#B2182B'],
    bad: '#FFEE99',
    mode: 'linear',
  },
  BuRd_discrete: {
    colors: ['#2166AC', '#4393C3', '#92C5DE', '#D1E5F0', '#F7F7F7', '#FDDBC7', '#F4A582', '#D6604D', '#B2182B'],
    bad: '#FFEE99',
    mode: 'discrete',
  },
  PRGn: {
    colors: ['#762A83', '#9970AB', '#C2A5CF', '#E7D4E8', '#F7F7F7', '#D9F0D3', '#ACD39E', '#5AAE61', '#1B7837'],
    bad: '#FFEE99',
    mode: 'linear',
  },
  PRGn_discrete: {
    colors: ['#762A83', '#9970AB', '#C2A5CF', '#E7D4E8', '#F7F7F7', '#D9F0D3', '#ACD39E', '#5AAE61', '#1B7837'],
    bad: '#FFEE99',
    mode: 'discrete',
  },
  YlOrBr: {
    colors: ['#FFFFE5', '#FFF7BC', '#FEE391', '#FEC44F', '#FB9A29', '#EC7014', '#CC4C02', '#993404', '#662506'],
    bad: '#888888',
    mode: 'linear',
  },
  YlOrBr_discrete: {
    colors: ['#FFFFE5', '#FFF7BC', '#FEE391', '#FEC44F', '#FB9A29', '#EC7014', '#CC4C02', '#993404', '#662506'],
    bad: '#888888',
    mode: 'discrete',
  },
  WhOrBr: {
    colors: ['#FFFFFF', '#FFF7BC', '#FEE391', '#FEC44F', '#FB9A29', '#EC7014', '#CC4C02', '#993404', '#662506'],
    bad: '#888888',
    mode: 'linear',
  },
  iridescent: {
    colors: ['#FEFBE9', '#FCF7D5', '#F5F3C1', '#EAF0B5', '#DDECBF', '#D0E7CA', '#C2E3D2', '#B5DDD8', '#A8D8DC', '#9BD2E1', '#8DCBE4', '#81C4E7', '#7BBCE7', '#7EB2E4', '#88A5DD', '#9398D2', '#9B8AC4', '#9D7DB2', '#9A709E', '#906388', '#805770', '#684957', '#46353A'],
    bad: '#999999',
    mode: 'linear',
  },
  rainbow_PuRd: {
    colors: ['#6F4C9B', '#6059A9', '#5568B8', '#4E79C5', '#4D8AC6', '#4E96BC', '#549EB3', '#59A5A9', '#60AB9E', '#69B190', '#77B77D', '#8CBC68', '#A6BE54', '#BEBC48', '#D1B541', '#DDAA3C', '#E49C39', '#E78C35', '#E67932', '#E4632D', '#DF4828', '#DA2222'],
    bad: '#FFFFFF',
    mode: 'linear',
  },
  rainbow_PuBr: {
    colors: ['#6F4C9B', '#6059A9', '#5568B8', '#4E79C5', '#4D8AC6', '#4E96BC', '#549EB3', '#59A5A9', '#60AB9E', '#69B190', '#77B77D', '#8CBC68', '#A6BE54', '#BEBC48', '#D1B541', '#DDAA3C', '#E49C39', '#E78C35', '#E67932', '#E4632D', '#DF4828', '#DA2222', '#B8221E', '#95211B', '#721E17', '#521A13'],
    bad: '#FFFFFF',
    mode: 'linear',
  },
  rainbow_WhRd: {
    colors: ['#E8ECFB', '#DDD8EF', '#D1C1E1', '#C3A8D1', '#B58FC2', '#A778B4', '#9B62A7', '#8C4E99', '#6F4C9B', '#6059A9', '#5568B8', '#4E79C5', '#4D8AC6', '#4E96BC', '#549EB3', '#59A5A9', '#60AB9E', '#69B190', '#77B77D', '#8CBC68', '#A6BE54', '#BEBC48', '#D1B541', '#DDAA3C', '#E49C39', '#E78C35', '#E67932', '#E4632D', '#DF4828', '#DA2222'],
    bad: '#666666',
    mode: 'linear',
  },
  rainbow_WhBr: {
    colors: ['#E8ECFB', '#DDD8EF', '#D1C1E1', '#C3A8D1', '#B58FC2', '#A778B4', '#9B62A7', '#8C4E99', '#6F4C9B', '#6059A9', '#5568B8', '#4E79C5', '#4D8AC6', '#4E96BC', '#549EB3', '#59A5A9', '#60AB9E', '#69B190', '#77B77D', '#8CBC68', '#A6BE54', '#BEBC48', '#D1B541', '#DDAA3C', '#E49C39', '#E78C35', '#E67932', '#E4632D', '#DF4828', '#DA2222', '#B8221E', '#95211B', '#721E17', '#521A13'],
    bad: '#666666',
    mode: 'linear',
  },
};

test('dist/py/tol_palettes.py is deterministic and carries the BSD notice and attribution header', () => {
  const text = readFileSync(pyPath, 'utf8');
  assert.equal(text, generatePyModule());
  assert.match(text, /Copyright \(c\) 2022, Paul Tol/);
  assert.match(text, /3-Clause BSD Notice/);
  assert.match(text, /not affiliated with or endorsed by Paul Tol/);
});

test('dist/py/tol_palettes.py executes in Python and matches official tol_colors.py values + site-only schemes', () => {
  const pyCheck = `
import json, sys
sys.path.insert(0, ${JSON.stringify(join(root, 'dist', 'py'))})
import tol_palettes as tp

out = {
  "official_cset_names": list(tp.tol_cset()),
  "csets": {},
  "unnamed_csets": {},
  "official_cmap_names": list(tp.tol_cmap()),
  "cmaps": {},
  "rainbow_discrete": {},
  "rainbow_discrete_default": list(tp.tol_cmap_colors("rainbow_discrete")[0]),
  "schemes_count": len(tp.SCHEMES),
}

for name in tp.OFFICIAL_CSET_NAMES:
  cset = tp.tol_cset(name)
  out["csets"][name] = {"fields": list(cset._fields), "hex": list(cset)}

for name in ("dark", "pale", "groundcover"):
  out["unnamed_csets"][name] = list(tp.tol_cset(name))

for name in tp.CMAP_NAMES:
  if name == "rainbow_discrete":
    continue
  clrs, bad, mode = tp.tol_cmap_colors(name)
  out["cmaps"][name] = {"colors": list(clrs), "bad": bad, "mode": mode}

for lut in range(1, 24):
  clrs, bad, mode = tp.tol_cmap_colors("rainbow_discrete", lut=lut)
  out["rainbow_discrete"][str(lut)] = {"colors": list(clrs), "bad": bad, "mode": mode}

print(json.dumps(out))
`;

  let stdout;
  try {
    stdout = execFileSync('python3', ['-c', pyCheck], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  } catch {
    stdout = execFileSync('python', ['-c', pyCheck], { encoding: 'utf8' });
  }
  const result = JSON.parse(stdout);

  assert.equal(result.schemes_count, 22);
  assert.deepEqual(result.official_cset_names, Object.keys(OFFICIAL_CSETS));

  for (const [name, expected] of Object.entries(OFFICIAL_CSETS)) {
    assert.deepEqual(result.csets[name], expected, `cset mismatch for ${name}`);
  }

  for (const [name, expected] of Object.entries(OFFICIAL_CMAPS)) {
    assert.deepEqual(result.cmaps[name], expected, `cmap mismatch for ${name}`);
  }

  // Verify rainbow_discrete across all 23 lengths and default (22)
  const rdScheme = loadSchemes().find((s) => s.data.id === 'rainbow-discrete').data;
  for (let n = 1; n <= 23; n++) {
    const expectedColors = rdScheme.lut[n - 1].map((i) => rdScheme.colors[i].hex);
    const expectedBad = n === 23 ? '#777777' : '#FFFFFF';
    assert.deepEqual(result.rainbow_discrete[String(n)], {
      colors: expectedColors,
      bad: expectedBad,
      mode: 'discrete',
    });
  }
  assert.equal(result.rainbow_discrete_default.length, 22);

  // Verify site-only schemes are present and unnamed
  assert.equal(result.unnamed_csets.dark.length, 11);
  assert.equal(result.unnamed_csets.pale.length, 7);
  assert.equal(result.unnamed_csets.groundcover.length, 14);
  assert.equal(result.cmaps.incandescent.colors.length, 11);
  assert.equal(result.cmaps.banded_12.colors.length, 12);
  assert.equal(result.cmaps.banded_16.colors.length, 16);
  assert.equal(result.cmaps.banded_20.colors.length, 20);
});
