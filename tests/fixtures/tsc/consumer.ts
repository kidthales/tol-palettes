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
} from '@kidthales/tol-palettes';

import schemesBundle, { type SchemesBundle } from '@kidthales/tol-palettes/schemes.json';

import sriManifest, { type SriManifest, type SriFileEntry } from '@kidthales/tol-palettes/sri';

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

// Verify schemes bundle json types (default export only, matching JSON module semantics)
const bundleComment: string = schemesBundle.$comment;
const bundleSchemes: Readonly<Record<SchemeId, Scheme>> = schemesBundle.schemes;

// Verify SRI manifest types (default export only, matching JSON module semantics)
const manifestPkg: string = sriManifest.package;
const manifestVer: string = sriManifest.version;
const cssSri: SriFileEntry = sriManifest.files['dist/css/tol.css'];

// Negative compile-time assertions: verify that named exports do NOT exist on JSON modules
// @ts-expect-error JSON module has no named export '$comment'
import { $comment } from '@kidthales/tol-palettes/schemes.json';

// @ts-expect-error JSON module has no named export 'pkg'
import { pkg } from '@kidthales/tol-palettes/sri';

// @ts-expect-error Property 'invalid_property' does not exist on SriManifest
const invalidSriProp = sriManifest.invalid_property;

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
