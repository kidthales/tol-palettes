import {
  schemes,
  schemeList,
  get,
  getScheme,
  hexToRgb,
  rgbToHex,
  interpolate,
  sample,
  discreteRainbow,
  discreteRainbowBad,
  discreteColors,
  type Scheme,
  type SchemeId,
  type HexColor,
  type SchemeColor,
  type SchemeKind,
} from '../../../dist/js/index.js';

import schemesBundle, {
  $comment,
  schemes as schemesMap,
  type SchemesBundle,
} from '../../../dist/json/schemes.js';

import sriManifest, {
  pkg,
  version,
  files as sriFiles,
  type SriManifest,
  type SriFileEntry,
} from '../../../dist/sri.js';

// Verify schemes map and types
const brightScheme: Scheme = schemes.bright;
const firstColor: HexColor = brightScheme.colors[0].hex;
const brightById: Scheme = get('bright');
const schemeByName: Scheme = getScheme('bright');
const interpolated: HexColor = interpolate('sunset', 0.5);
const sampled: HexColor[] = sample('bright', 5);
const rainbowStops: HexColor[] = discreteRainbow(10);
const rainbowBadColor: HexColor = discreteRainbowBad(10);
const discreteStops: HexColor[] = discreteColors('muted');

// Verify schemes bundle json types
const bundleComment: string = schemesBundle.$comment;
const bundleSchemes: Readonly<Record<SchemeId, Scheme>> = schemesBundle.schemes;

// Verify SRI manifest types
const manifestPkg: string = sriManifest.package;
const manifestVer: string = sriManifest.version;
const cssSri: SriFileEntry = sriManifest.files['dist/css/tol.css'];

export {
  firstColor,
  brightById,
  schemeByName,
  interpolated,
  sampled,
  rainbowStops,
  rainbowBadColor,
  discreteStops,
  bundleComment,
  bundleSchemes,
  manifestPkg,
  manifestVer,
  cssSri,
};
