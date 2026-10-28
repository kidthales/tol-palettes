import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { deflateRawSync, crc32 } from 'node:zlib';

/**
 * Builds a valid, standard ZIP archive buffer completely in-memory using Node.js standard libraries.
 * Produces deterministic archives with normalized DOS timestamps and UTF-8 path encoding.
 *
 * @param {Array<{ path: string, data: Buffer | string, isDir?: boolean }>} entries
 * @returns {Buffer}
 */
export function buildZip(entries) {
  const localHeaders = [];
  const cdHeaders = [];
  let offset = 0;

  // DOS time/date: 2026-01-01 00:00:00 -> dosTime = 0, dosDate = 23585
  const dosTime = 0;
  const dosDate = (46 << 9) | (1 << 5) | 1;

  // Sort entries for deterministic output
  const sortedEntries = [...entries].sort((a, b) => a.path.localeCompare(b.path));

  for (const entry of sortedEntries) {
    const isDir = Boolean(entry.isDir);
    const normalizedPath = entry.path.replace(/\\/g, '/');
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
    cdHeader.writeUInt16LE(20, 4); // version made by
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
    cdHeader.writeUInt32LE(isDir ? 0x10 : 0, 38); // external attributes (directory bit if isDir)
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
 * Recursively collects file entries from a directory root.
 *
 * @param {string} dir - Directory on disk to read from
 * @param {string} prefix - Archive path prefix to prepend
 * @returns {Array<{ path: string, data: Buffer }>}
 */
export function collectDirectoryEntries(dir, prefix = '') {
  const entries = [];
  const items = readdirSync(dir, { withFileTypes: true });

  for (const item of items) {
    const fullPath = join(dir, item.name);
    const archivePath = prefix ? `${prefix}/${item.name}` : item.name;

    if (item.isDirectory()) {
      entries.push(...collectDirectoryEntries(fullPath, archivePath));
    } else if (item.isFile()) {
      entries.push({
        path: archivePath,
        data: readFileSync(fullPath),
      });
    }
  }

  return entries;
}
