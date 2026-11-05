// Shared path-jail and option validation utilities for build, generator, and asset packaging tools.
// Walks path segments with fs.lstatSync / fs.readlinkSync (bounded depth) and resolves existing targets
// via fs.realpathSync.native to defeat dangling-symlink escapes, junction escapes, and Windows 8.3
// short names, while using segment-aware relative path checks (rel === '..' || rel.startsWith('..' + sep))
// so dot-prefixed directory names like "..foo" inside the repository cannot bypass the jail.
//
// Security Boundary Note (TOCTOU):
//   resolveOutDir() and assertSafeWriteTarget() validate target paths prior to synchronous
//   fs.mkdirSync / fs.writeFileSync calls. An inherent time-of-check/time-of-use (TOCTOU) window exists
//   against concurrent local filesystem mutation between validation and write; this is an accepted
//   boundary for a local, single-operator build tool.

import { lstatSync, readlinkSync, realpathSync } from 'node:fs';
import { dirname, isAbsolute, join, parse, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const distDir = join(root, 'dist');
export const dataDir = join(root, 'data');
export const schemaDir = join(root, 'schema');
export const toolsDir = join(root, 'tools');
export const testsDir = join(root, 'tests');

export const MAX_SYMLINK_DEPTH = 32;
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

/**
 * Validates and confines target output directory within allowed boundary (defaulting to repository root).
 * Strictly rejects protected internal repository paths and out-of-boundary locations.
 */
export function resolveOutDir(opts = {}) {
  if (opts === null || typeof opts !== 'object') {
    throw new Error('Invalid outDir: options must be an object');
  }
  const rawOutDir = 'outDir' in opts ? opts.outDir : distDir;
  if (typeof rawOutDir !== 'string' || rawOutDir.trim() === '') {
    throw new Error('Invalid outDir: must be a non-empty string path');
  }

  const boundary = opts.allowedRoot || root;
  const resolved = resolveRealPath(rawOutDir);

  // Reject paths outside allowed jail boundary
  if (!isSameOrSubpath(resolved, boundary)) {
    throw new Error(`Invalid outDir: refusing to write outside allowed jail boundary (${resolved})`);
  }

  // When writing inside repository, only distDir (or its subdirectories) is allowed.
  // Protect repository root, source data, schema, tools, tests, docs, scripts, and CI.
  if (isSameOrSubpath(resolved, root)) {
    if (
      isSameOrSubpath(resolved, dataDir) ||
      isSameOrSubpath(resolved, schemaDir) ||
      isSameOrSubpath(resolved, toolsDir) ||
      isSameOrSubpath(resolved, testsDir) ||
      isSameOrSubpath(resolved, join(root, '.github')) ||
      isSameOrSubpath(resolved, join(root, 'docs')) ||
      isSameOrSubpath(resolved, join(root, 'scripts')) ||
      isSameOrSubpath(resolved, join(root, '.git')) ||
      isSameOrSubpath(root, resolved) // refusing root itself
    ) {
      throw new Error(`Invalid outDir: refusing to write to protected path ${resolved}`);
    }
    if (!opts.allowedRoot && !isSameOrSubpath(resolved, distDir)) {
      throw new Error(`Invalid outDir: refusing to write outside allowed jail boundary (${resolved})`);
    }
  }

  return resolved;
}

/**
 * Validates that an individual target write path does not escape the jail boundary
 * and that no segment or existing file is an escaping symbolic link.
 */
export function assertSafeWriteTarget(targetPath, jailRoot = root) {
  if (typeof targetPath !== 'string' || targetPath.trim() === '') {
    throw new Error('Invalid targetPath: must be a non-empty string path');
  }
  const resolved = resolveRealPath(targetPath);
  if (!isSameOrSubpath(resolved, jailRoot)) {
    throw new Error(`Invalid targetPath: refusing to write outside allowed jail boundary (${resolved})`);
  }
  return resolved;
}

/**
 * Parses --outDir or --outdir CLI flags fail-closed (throws if flag is present with missing or empty value).
 * Returns undefined if flag is not present.
 */
export function parseCliOutDir(argv = process.argv.slice(2)) {
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--outDir' || arg === '--outdir') {
      const val = argv[i + 1];
      if (val === undefined || val.trim() === '' || val.startsWith('-')) {
        throw new Error(`Invalid ${arg}: missing or empty directory argument`);
      }
      return val;
    }
    if (arg.startsWith('--outDir=')) {
      const val = arg.slice('--outDir='.length);
      if (val.trim() === '') {
        throw new Error('Invalid --outDir: value cannot be empty');
      }
      return val;
    }
    if (arg.startsWith('--outdir=')) {
      const val = arg.slice('--outdir='.length);
      if (val.trim() === '') {
        throw new Error('Invalid --outdir: value cannot be empty');
      }
      return val;
    }
  }
  return undefined;
}
