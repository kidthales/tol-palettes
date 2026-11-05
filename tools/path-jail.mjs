// Shared path-jail and option validation utilities for build, generator, and asset packaging tools.
// Walks path segments with fs.lstatSync / fs.readlinkSync (bounded depth) and resolves existing targets
// via fs.realpathSync.native to defeat dangling-symlink escapes, junction escapes, and Windows 8.3
// short names, while using segment-aware relative path checks (rel === '..' || rel.startsWith('..' + sep))
// so dot-prefixed directory names like "..foo" inside the repository cannot bypass the jail.
//
// Security Boundary Note (TOCTOU):
//   resolveOutDir() validates target paths prior to synchronous fs.mkdirSync / fs.writeFileSync calls.
//   An inherent time-of-check/time-of-use (TOCTOU) window exists against concurrent local filesystem
//   mutation between validation and write; this is an accepted boundary for a local, single-operator build tool.

import { lstatSync, readlinkSync, realpathSync } from 'node:fs';
import { dirname, isAbsolute, join, parse, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const distDir = join(root, 'dist');
export const dataDir = join(root, 'data');
export const schemaDir = join(root, 'schema');
export const toolsDir = join(root, 'tools');
export const testsDir = join(root, 'tests');

const MAX_SYMLINK_DEPTH = 32;
const nativeRealpath = (p) => (typeof realpathSync.native === 'function' ? realpathSync.native(p) : realpathSync(p));
const normCase = (p) => (process.platform === 'win32' ? p.toLowerCase() : p);
const normalizePlatformPath = (p) => (process.platform === 'win32' ? stripWin32DeviceNamespacePrefix(p) : p);

export function stripWin32DeviceNamespacePrefix(p) {
  if (typeof p !== 'string') return p;
  if (/^(?:[\\/]{2}[?.][\\/]|[\\/]\?\?[\\/])/.test(p)) {
    const rest = p.slice(4);
    const uncMatch = rest.match(/^UNC[\\/]+([^\\/]+[\\/].*)$/i);
    if (uncMatch) {
      return '\\\\' + uncMatch[1];
    }
    if (/^[A-Za-z]:[\\/]/.test(rest)) {
      return rest;
    }
    throw new Error(`Invalid path: unsupported Windows device-namespace or volume path "${p}"`);
  }
  return p;
}

export function resolveRealPath(targetPath, symlinkDepth = 0) {
  if (symlinkDepth > MAX_SYMLINK_DEPTH) {
    throw new Error(`Too many levels of symbolic links while resolving ${targetPath}`);
  }
  const abs = resolve(normalizePlatformPath(targetPath));
  const parsed = parse(abs);
  const segments = abs.slice(parsed.root.length).split(sep).filter(Boolean);

  let current = parsed.root;
  try {
    current = normalizePlatformPath(nativeRealpath(current));
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }

  for (let i = 0; i < segments.length; i++) {
    const candidate = join(current, segments[i]);
    let st;
    try {
      st = lstatSync(candidate);
    } catch (err) {
      if (err.code === 'ENOENT') return join(current, ...segments.slice(i));
      throw err;
    }

    if (st.isSymbolicLink()) {
      const rawLinkTarget = normalizePlatformPath(readlinkSync(candidate));
      const resolvedLinkTarget = resolve(dirname(candidate), rawLinkTarget);
      const remaining = segments.slice(i + 1);
      const nextTarget = remaining.length > 0 ? join(resolvedLinkTarget, ...remaining) : resolvedLinkTarget;
      return resolveRealPath(nextTarget, symlinkDepth + 1);
    }

    current = normalizePlatformPath(nativeRealpath(candidate));
  }

  return current;
}

export function isSameOrSubpath(targetPath, basePath) {
  const rel = relative(normCase(resolveRealPath(basePath)), normCase(resolveRealPath(targetPath)));
  return rel === '' || (rel !== '..' && !rel.startsWith('..' + sep) && !isAbsolute(rel));
}

export function assertValidMtimeOption(opts) {
  if (opts === null || typeof opts !== 'object') {
    throw new Error('Invalid options: must be an object');
  }
  if ('mtime' in opts) {
    if (!(opts.mtime instanceof Date) || Number.isNaN(opts.mtime.getTime())) {
      throw new Error('Invalid mtime: must be a valid Date instance');
    }
    return opts.mtime;
  }
  return undefined;
}

export function resolveOutDir(opts = {}) {
  if (opts === null || typeof opts !== 'object') {
    throw new Error('Invalid outDir: options must be an object');
  }
  const rawOutDir = 'outDir' in opts ? opts.outDir : distDir;
  if (typeof rawOutDir !== 'string' || rawOutDir.trim() === '') {
    throw new Error('Invalid outDir: must be a non-empty string path');
  }
  const resolved = resolveRealPath(rawOutDir);
  if (
    isSameOrSubpath(resolved, dataDir) ||
    isSameOrSubpath(resolved, schemaDir) ||
    isSameOrSubpath(resolved, toolsDir) ||
    isSameOrSubpath(resolved, testsDir) ||
    isSameOrSubpath(resolved, join(root, '.github')) ||
    isSameOrSubpath(resolved, join(root, 'docs')) ||
    isSameOrSubpath(resolved, join(root, 'scripts')) ||
    isSameOrSubpath(root, resolved) ||
    (isSameOrSubpath(resolved, root) && !isSameOrSubpath(resolved, distDir))
  ) {
    throw new Error(`Invalid outDir: refusing to write to protected path ${resolved}`);
  }
  return resolved;
}

export function assertSafeCustomSyncTarget(targetPath, label = 'targetPath') {
  if (typeof targetPath !== 'string' || targetPath.trim() === '') {
    throw new Error(`Invalid ${label}: must be a non-empty string path`);
  }
  const resolvedPath = resolveRealPath(targetPath);
  if (
    isSameOrSubpath(resolvedPath, dataDir) ||
    isSameOrSubpath(resolvedPath, schemaDir) ||
    isSameOrSubpath(resolvedPath, toolsDir) ||
    isSameOrSubpath(resolvedPath, testsDir) ||
    isSameOrSubpath(root, resolvedPath) ||
    isSameOrSubpath(resolvedPath, root)
  ) {
    throw new Error(`Invalid ${label}: refusing to write custom sync target inside repository at ${resolvedPath}`);
  }
  return resolvedPath;
}
