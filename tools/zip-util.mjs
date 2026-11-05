import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateRawSync, inflateRawSync, crc32 } from 'node:zlib';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export const DEFAULT_ZIP_MTIME = new Date('2026-01-01T00:00:00Z');
export const MAX_ZIP_ENTRIES = 128;
export const MAX_ZIP_ENTRY_UNCOMPRESSED_BYTES = 10 * 1024 * 1024;
export const MAX_ZIP_TOTAL_UNCOMPRESSED_BYTES = 25 * 1024 * 1024;

export function resolveLastCommitDate(cwd = root) {
  try {
    const raw = execFileSync('git', ['log', '-1', '--pretty=%ct'], {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    if (raw !== '') {
      const seconds = Number(raw);
      if (Number.isInteger(seconds) && seconds >= 0) {
        return new Date(seconds * 1000);
      }
    }
  } catch {
    // git unavailable, not a repository, or invalid directory
  }
  return null;
}

export function resolveDefaultZipMtime(opts = {}) {
  const rawEpoch = process.env.SOURCE_DATE_EPOCH;
  if (rawEpoch !== undefined && rawEpoch.trim() !== '') {
    const seconds = Number(rawEpoch);
    if (!Number.isInteger(seconds) || seconds < 0) {
      throw new Error(`Invalid SOURCE_DATE_EPOCH: "${rawEpoch}" must be a non-negative integer`);
    }
    return new Date(seconds * 1000);
  }
  if (
    (opts && (opts.fallbackToGit || opts.fallbackToLastCommit)) ||
    process.env.SOURCE_DATE_EPOCH_FALLBACK_GIT === '1' ||
    process.env.SOURCE_DATE_EPOCH_FALLBACK_GIT === 'true'
  ) {
    const gitDate = resolveLastCommitDate(opts?.cwd);
    if (gitDate !== null) {
      return gitDate;
    }
  }
  return DEFAULT_ZIP_MTIME;
}

export function toDosDateTime(date, opts = {}) {
  const d = date === undefined ? resolveDefaultZipMtime(opts) : date;
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) {
    throw new Error('Invalid mtime: must be a valid Date instance');
  }
  const year = d.getUTCFullYear();
  if (year < 1980 || year > 2107) {
    throw new Error(`Invalid mtime year ${year}: MS-DOS timestamps only support UTC years 1980–2107`);
  }
  const dosDate =
    (((year - 1980) & 0x7f) << 9) | (((d.getUTCMonth() + 1) & 0xf) << 5) | (d.getUTCDate() & 0x1f);
  const dosTime =
    ((d.getUTCHours() & 0x1f) << 11) |
    ((d.getUTCMinutes() & 0x3f) << 5) |
    (Math.floor(d.getUTCSeconds() / 2) & 0x1f);
  return { dosDate: dosDate >>> 0, dosTime: dosTime >>> 0 };
}

/**
 * Builds a valid, standard ZIP archive buffer completely in-memory using Node.js standard libraries.
 * Produces deterministic archives with normalized DOS timestamps and UTF-8 path encoding.
 *
 * @param {Array<{ path?: string, name?: string, data: Buffer | string, isDir?: boolean, mtime?: Date }>} entries
 * @param {object} [opts={}]
 * @returns {Buffer}
 */
export function buildZip(entries, opts = {}) {
  const localHeaders = [];
  const cdHeaders = [];
  let offset = 0;

  const defaultMtime = opts?.mtime !== undefined ? opts.mtime : resolveDefaultZipMtime(opts);

  // Sort entries for deterministic output
  const sortedEntries = [...entries].sort((a, b) => {
    const pathA = a.path ?? a.name ?? '';
    const pathB = b.path ?? b.name ?? '';
    return pathA.localeCompare(pathB);
  });

  for (const entry of sortedEntries) {
    const entryPath = entry.path ?? entry.name;
    if (typeof entryPath !== 'string' || entryPath.trim() === '') {
      throw new Error('Invalid zip entry: path or name must be a non-empty string');
    }
    const isDir = Boolean(entry.isDir);
    const normalizedPath = entryPath.replace(/\\/g, '/');
    const pathBuf = Buffer.from(normalizedPath, 'utf8');
    const dataBuf = isDir
      ? Buffer.alloc(0)
      : Buffer.isBuffer(entry.data)
        ? entry.data
        : Buffer.from(entry.data, 'utf8');

    const uncompressedSize = dataBuf.length;
    const crc = isDir ? 0 : crc32(dataBuf);
    const compressed = isDir ? dataBuf : deflateRawSync(dataBuf);
    const compressedSize = compressed.length;

    const entryMtime = entry.mtime instanceof Date ? entry.mtime : defaultMtime;
    const { dosDate, dosTime } = toDosDateTime(entryMtime);

    // Local file header (30 bytes + path length)
    const localHeader = Buffer.alloc(30 + pathBuf.length);
    localHeader.writeUInt32LE(0x04034b50, 0); // signature
    localHeader.writeUInt16LE(20, 4); // version needed (2.0)
    localHeader.writeUInt16LE(0x0800, 6); // general purpose bit flag (bit 11 = UTF-8)
    localHeader.writeUInt16LE(isDir ? 0 : 8, 8); // compression method (0 = store, 8 = deflate)
    localHeader.writeUInt16LE(dosTime, 10);
    localHeader.writeUInt16LE(dosDate, 12);
    localHeader.writeUInt32LE(crc, 14);
    localHeader.writeUInt32LE(compressedSize, 18);
    localHeader.writeUInt32LE(uncompressedSize, 22);
    localHeader.writeUInt16LE(pathBuf.length, 26);
    localHeader.writeUInt16LE(0, 28); // extra field length
    pathBuf.copy(localHeader, 30);

    localHeaders.push(localHeader, compressed);

    // Central directory header (46 bytes + path length)
    const cdHeader = Buffer.alloc(46 + pathBuf.length);
    cdHeader.writeUInt32LE(0x02014b50, 0); // signature
    cdHeader.writeUInt16LE(0x0314, 4); // version made by (UNIX 2.0)
    cdHeader.writeUInt16LE(20, 6); // version needed
    cdHeader.writeUInt16LE(0x0800, 8); // general purpose bit flag
    cdHeader.writeUInt16LE(isDir ? 0 : 8, 10); // compression method
    cdHeader.writeUInt16LE(dosTime, 12);
    cdHeader.writeUInt16LE(dosDate, 14);
    cdHeader.writeUInt32LE(crc, 16);
    cdHeader.writeUInt32LE(compressedSize, 20);
    cdHeader.writeUInt32LE(uncompressedSize, 24);
    cdHeader.writeUInt16LE(pathBuf.length, 28);
    cdHeader.writeUInt16LE(0, 30); // extra field len
    cdHeader.writeUInt16LE(0, 32); // comment len
    cdHeader.writeUInt16LE(0, 34); // disk start
    cdHeader.writeUInt16LE(0, 36); // internal file attributes
    cdHeader.writeUInt32LE(isDir ? 0x10 : ((0o100644 << 16) >>> 0), 38); // external attributes
    cdHeader.writeUInt32LE(offset, 42); // relative offset of local header
    pathBuf.copy(cdHeader, 46);

    cdHeaders.push(cdHeader);
    offset += localHeader.length + compressed.length;
  }

  const cdOffset = offset;
  let cdSize = 0;
  for (const h of cdHeaders) cdSize += h.length;

  // End of central directory record (22 bytes)
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4); // disk number
  eocd.writeUInt16LE(0, 6); // start disk
  eocd.writeUInt16LE(sortedEntries.length, 8); // records on this disk
  eocd.writeUInt16LE(sortedEntries.length, 10); // total records
  eocd.writeUInt32LE(cdSize, 12);
  eocd.writeUInt32LE(cdOffset, 16);
  eocd.writeUInt16LE(0, 20); // comment length

  return Buffer.concat([...localHeaders, ...cdHeaders, eocd]);
}

/**
 * Parses a PKZip buffer and validates bounds, signatures, CRC-32, and entry hash integrity.
 *
 * @param {Buffer} zipBuf
 * @returns {Array<{ name: string, path: string, crc: number, dosDate: number, dosTime: number, compressedSize: number, uncompressedSize: number, sha256: string, data: Buffer }>}
 */
export function parsePkZipEntries(zipBuf) {
  if (!Buffer.isBuffer(zipBuf) || zipBuf.length < 22) {
    throw new Error('Invalid PKZip buffer: must be a Buffer of at least 22 bytes');
  }
  let eocdOffset = -1;
  for (let i = zipBuf.length - 22; i >= Math.max(0, zipBuf.length - 65557); i--) {
    if (zipBuf.readUInt32LE(i) === 0x06054b50) {
      eocdOffset = i;
      break;
    }
  }
  if (eocdOffset === -1) {
    throw new Error('Valid PKZip End of Central Directory signature (0x06054b50) not found');
  }

  const totalEntries = zipBuf.readUInt16LE(eocdOffset + 10);
  const cdSize = zipBuf.readUInt32LE(eocdOffset + 12);
  const cdOffset = zipBuf.readUInt32LE(eocdOffset + 16);
  if (totalEntries === 0xffff || cdSize === 0xffffffff || cdOffset === 0xffffffff) {
    throw new Error('ZIP64 archives are not supported');
  }
  if (totalEntries > MAX_ZIP_ENTRIES) {
    throw new Error(`Archive entry count ${totalEntries} exceeds max allowed ${MAX_ZIP_ENTRIES} entries`);
  }
  if (cdOffset + cdSize > eocdOffset) {
    throw new Error('Central Directory bounds exceed End of Central Directory offset');
  }

  const entries = [];
  let pos = cdOffset;
  let totalUncompressedBytes = 0;

  for (let i = 0; i < totalEntries; i++) {
    if (pos + 46 > eocdOffset) {
      throw new Error(`Central Directory header at offset ${pos} exceeds EOCD bounds`);
    }
    if (zipBuf.readUInt32LE(pos) !== 0x02014b50) {
      throw new Error(`Invalid Central Directory signature at offset ${pos}`);
    }
    const cdMethod = zipBuf.readUInt16LE(pos + 10);
    if (cdMethod !== 8 && cdMethod !== 0) {
      throw new Error(`Unsupported compression method ${cdMethod} in Central Directory (expected 8 / deflate or 0 / store)`);
    }
    const dosTime = zipBuf.readUInt16LE(pos + 12);
    const dosDate = zipBuf.readUInt16LE(pos + 14);
    const crc = zipBuf.readUInt32LE(pos + 16);
    const compressedSize = zipBuf.readUInt32LE(pos + 20);
    const uncompressedSize = zipBuf.readUInt32LE(pos + 24);
    const nameLen = zipBuf.readUInt16LE(pos + 28);
    const extraLen = zipBuf.readUInt16LE(pos + 30);
    const commentLen = zipBuf.readUInt16LE(pos + 32);
    const lfhOffset = zipBuf.readUInt32LE(pos + 42);
    if (compressedSize === 0xffffffff || uncompressedSize === 0xffffffff || lfhOffset === 0xffffffff) {
      throw new Error('ZIP64 entry fields are not supported');
    }
    if (pos + 46 + nameLen + extraLen + commentLen > eocdOffset) {
      throw new Error(`Central Directory variable fields at offset ${pos} exceed EOCD bounds`);
    }
    const name = zipBuf.toString('utf8', pos + 46, pos + 46 + nameLen);
    if (uncompressedSize > MAX_ZIP_ENTRY_UNCOMPRESSED_BYTES) {
      throw new Error(
        `Entry ${name} uncompressed size ${uncompressedSize} exceeds max allowed ${MAX_ZIP_ENTRY_UNCOMPRESSED_BYTES} bytes`,
      );
    }
    if (totalUncompressedBytes + uncompressedSize > MAX_ZIP_TOTAL_UNCOMPRESSED_BYTES) {
      throw new Error(
        `Aggregate uncompressed size ${totalUncompressedBytes + uncompressedSize} exceeds max allowed ${MAX_ZIP_TOTAL_UNCOMPRESSED_BYTES} bytes`,
      );
    }

    if (lfhOffset + 30 > cdOffset) {
      throw new Error(`Local File Header offset ${lfhOffset} for ${name} exceeds Central Directory start`);
    }
    if (zipBuf.readUInt32LE(lfhOffset) !== 0x04034b50) {
      throw new Error(`Invalid Local File Header signature at offset ${lfhOffset} for ${name}`);
    }
    const lfhMethod = zipBuf.readUInt16LE(lfhOffset + 8);
    if (lfhMethod !== cdMethod) {
      throw new Error(`Compression method mismatch between Local File Header (${lfhMethod}) and Central Directory (${cdMethod}) for ${name}`);
    }
    const lfhDosTime = zipBuf.readUInt16LE(lfhOffset + 10);
    const lfhDosDate = zipBuf.readUInt16LE(lfhOffset + 12);
    if (lfhDosTime !== dosTime || lfhDosDate !== dosDate) {
      throw new Error(`MS-DOS timestamp mismatch between Local File Header and Central Directory for ${name}`);
    }
    const lfhNameLen = zipBuf.readUInt16LE(lfhOffset + 26);
    const lfhExtraLen = zipBuf.readUInt16LE(lfhOffset + 28);
    const dataStart = lfhOffset + 30 + lfhNameLen + lfhExtraLen;
    if (dataStart + compressedSize > cdOffset) {
      throw new Error(`Compressed data slice for ${name} exceeds Central Directory start`);
    }
    const compressedSlice = zipBuf.subarray(dataStart, dataStart + compressedSize);
    const remainingBudget = MAX_ZIP_TOTAL_UNCOMPRESSED_BYTES - totalUncompressedBytes;

    let decompressed;
    if (cdMethod === 0) {
      decompressed = compressedSlice;
    } else {
      decompressed = inflateRawSync(compressedSlice, {
        maxOutputLength: Math.min(
          MAX_ZIP_ENTRY_UNCOMPRESSED_BYTES,
          remainingBudget,
          Math.max(1, uncompressedSize),
        ),
      });
    }

    if (decompressed.length !== uncompressedSize) {
      throw new Error(`Uncompressed size mismatch for ${name}: expected ${uncompressedSize}, got ${decompressed.length}`);
    }
    if ((crc32(decompressed) >>> 0) !== (crc >>> 0)) {
      throw new Error(`CRC-32 mismatch for ${name}`);
    }
    totalUncompressedBytes += decompressed.length;

    const sha256 = createHash('sha256').update(decompressed).digest('hex');
    entries.push({
      name,
      path: name,
      crc,
      dosDate,
      dosTime,
      compressedSize,
      uncompressedSize,
      sha256,
      data: decompressed,
    });

    pos += 46 + nameLen + extraLen + commentLen;
  }

  return entries;
}

/**
 * Recursively collects file entries from a directory root.
 *
 * @param {string} dir - Directory on disk to read from
 * @param {string} prefix - Archive path prefix to prepend
 * @param {object} [opts={}]
 * @returns {Array<{ path: string, data: Buffer, mtime?: Date }>}
 */
export function collectDirectoryEntries(dir, prefix = '', opts = {}) {
  const entries = [];
  const items = readdirSync(dir, { withFileTypes: true });

  for (const item of items) {
    const fullPath = join(dir, item.name);
    const archivePath = prefix ? `${prefix}/${item.name}` : item.name;

    if (item.isDirectory()) {
      entries.push(...collectDirectoryEntries(fullPath, archivePath, opts));
    } else if (item.isFile()) {
      entries.push({
        path: archivePath,
        data: readFileSync(fullPath),
        ...(opts.mtime instanceof Date ? { mtime: opts.mtime } : {}),
      });
    }
  }

  return entries;
}
