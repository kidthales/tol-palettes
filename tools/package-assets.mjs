// Packages downloadable asset zip bundles for Godot, Aseprite, and GIMP/Inkscape/Krita
// Outputs:
//   dist/assets/tol-palettes-godot.zip    (containing addons/tol_palettes/...)
//   dist/assets/tol-palettes-aseprite.zip (containing *.gpl with Aseprite headers)
//   dist/assets/tol-palettes-gpl.zip      (containing standard *.gpl palettes)

import { mkdirSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildZip, collectDirectoryEntries } from './zip-util.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const assetsDir = join(root, 'dist', 'assets');
const godotAddonDir = join(root, 'dist', 'godot', 'addons', 'tol_palettes');
const asepriteDir = join(root, 'dist', 'aseprite');
const gplDir = join(root, 'dist', 'gpl');

export function packageAllAssets() {
  if (!existsSync(godotAddonDir) || !existsSync(asepriteDir) || !existsSync(gplDir)) {
    throw new Error('Required distribution directories not found. Run npm run generate:game first.');
  }

  // 1. Godot addon zip (interior root: addons/tol_palettes/...)
  const godotEntries = collectDirectoryEntries(godotAddonDir, 'addons/tol_palettes');
  const godotZip = buildZip(godotEntries);

  // 2. Aseprite zip (interior files: <id>.gpl)
  const asepriteEntries = collectDirectoryEntries(asepriteDir);
  const asepriteZip = buildZip(asepriteEntries);

  // 3. GPL zip (interior files: <id>.gpl)
  const gplEntries = collectDirectoryEntries(gplDir);
  const gplZip = buildZip(gplEntries);

  return {
    'tol-palettes-godot.zip': godotZip,
    'tol-palettes-aseprite.zip': asepriteZip,
    'tol-palettes-gpl.zip': gplZip,
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  rmSync(assetsDir, { recursive: true, force: true });
  mkdirSync(assetsDir, { recursive: true });

  const bundles = packageAllAssets();
  for (const [name, buf] of Object.entries(bundles)) {
    writeFileSync(join(assetsDir, name), buf);
    console.log(`Wrote dist/assets/${name} (${(buf.length / 1024).toFixed(1)} KB)`);
  }
}
