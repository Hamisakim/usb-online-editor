/**
 * Rekordbox PDB Parser
 *
 * Parses the DeviceSQL format used by Pioneer's rekordbox software
 * for USB/SD exports. Based on reverse-engineering work by:
 * - Deep Symmetry (James Elliott)
 * - Henry Betts
 * - Fabian Lesniak
 *
 * Reference: https://djl-analysis.deepsymmetry.org/rekordbox-export-analysis/exports.html
 */

import type {
  RekordboxDatabase,
  Track,
  Artist,
  Album,
  Genre,
  Key,
  Color,
  Artwork,
  PlaylistTreeNode,
  PlaylistEntry,
} from '../types/rekordbox';
import { PageType } from '../types/rekordbox';

// Constants
const PAGE_SIZE = 4096;

interface TablePointer {
  type: PageType;
  firstPage: number;
  lastPage: number;
}

interface PageHeader {
  pageIndex: number;
  type: PageType;
  nextPage: number;
  numRowsSmall: number;
  numRowsLarge: number;
  freeSize: number;
  usedSize: number;
  firstRowIndex: number;
  firstRowOffset: number;
  heapOffset: number;
}

class BinaryReader {
  private view: DataView;
  private offset: number = 0;
  public readonly length: number;

  constructor(buffer: ArrayBuffer) {
    this.view = new DataView(buffer);
    this.length = buffer.byteLength;
  }

  seek(offset: number) {
    this.offset = offset;
  }

  get position() {
    return this.offset;
  }

  canRead(bytes: number): boolean {
    return this.offset + bytes <= this.length;
  }

  readU8(): number {
    if (!this.canRead(1)) return 0;
    const value = this.view.getUint8(this.offset);
    this.offset += 1;
    return value;
  }

  readU16(): number {
    if (!this.canRead(2)) return 0;
    const value = this.view.getUint16(this.offset, true); // little-endian
    this.offset += 2;
    return value;
  }

  readU32(): number {
    if (!this.canRead(4)) return 0;
    const value = this.view.getUint32(this.offset, true); // little-endian
    this.offset += 4;
    return value;
  }

  readBytes(length: number): Uint8Array {
    if (!this.canRead(length)) {
      return new Uint8Array(0);
    }
    const bytes = new Uint8Array(this.view.buffer, this.offset, length);
    this.offset += length;
    return bytes;
  }

  // Read a DeviceSQL string
  readDeviceSqlString(baseOffset: number, stringOffset: number): string {
    if (stringOffset === 0) return '';

    const stringPos = baseOffset + stringOffset;
    if (stringPos >= this.length || stringPos < 0) return '';

    this.seek(stringPos);
    const lengthByte = this.readU8();

    try {
      // Check string type
      if (lengthByte === 0x40) {
        // Long ASCII string
        const length = this.readU8();
        if (length === 0 || !this.canRead(length)) return '';
        const bytes = this.readBytes(length);
        return new TextDecoder('ascii').decode(bytes);
      } else if (lengthByte === 0x90) {
        // Long UTF-16LE string
        const length = this.readU16();
        if (length === 0 || !this.canRead(length)) return '';
        const bytes = this.readBytes(length);
        return new TextDecoder('utf-16le').decode(bytes);
      } else if ((lengthByte & 0x3f) === lengthByte) {
        // Short ASCII string - length is in the byte itself
        const length = Math.floor(lengthByte / 2);
        if (length === 0 || !this.canRead(length)) return '';
        const bytes = this.readBytes(length);
        return new TextDecoder('ascii').decode(bytes).replace(/\0+$/, '');
      } else {
        // Likely short string encoded differently
        const length = (lengthByte - 1) / 2 - 1;
        if (length <= 0 || length > 127 || !this.canRead(Math.floor(length))) return '';
        const bytes = this.readBytes(Math.floor(length));
        return new TextDecoder('ascii').decode(bytes).replace(/\0+$/, '');
      }
    } catch {
      return '';
    }
  }
}

export class PDBParser {
  private reader: BinaryReader;
  private tables: Map<PageType, TablePointer> = new Map();
  private pageSize: number = PAGE_SIZE;

  constructor(buffer: ArrayBuffer) {
    this.reader = new BinaryReader(buffer);
    this.parseHeader();
  }

  private parseHeader() {
    this.reader.seek(0);

    // Skip to page size (offset 4)
    this.reader.seek(4);
    this.pageSize = this.reader.readU32();

    // Number of tables (offset 8)
    this.reader.seek(8);
    const numTables = this.reader.readU32();

    // Skip next_unused and unknown
    this.reader.seek(16);
    this.reader.readU32(); // sequence - unused

    // Table pointers start at offset 28
    this.reader.seek(28);

    for (let i = 0; i < numTables; i++) {
      const type = this.reader.readU32() as PageType;
      this.reader.readU32(); // emptyCandidate - unused
      const firstPage = this.reader.readU32();
      const lastPage = this.reader.readU32();

      if (firstPage !== 0 || lastPage !== 0) {
        this.tables.set(type, { type, firstPage, lastPage });
      }
    }
  }

  private parsePageHeader(pageIndex: number): PageHeader | null {
    const pageOffset = pageIndex * this.pageSize;

    // Bounds check
    if (pageOffset < 0 || pageOffset + 40 > this.reader.length) {
      return null;
    }

    this.reader.seek(pageOffset);

    // Skip gap (4 bytes)
    this.reader.readU32();

    this.reader.readU32(); // storedPageIndex - unused
    const type = this.reader.readU32() as PageType;
    const nextPage = this.reader.readU32();

    // Read unknown field
    this.reader.readU32();

    // Read counters at offset 20
    this.reader.seek(pageOffset + 20);
    const numRowsSmall = this.reader.readU8();
    this.reader.readU8(); // unknown2
    this.reader.readU8(); // unknown3
    this.reader.readU8(); // pageFlags

    // Offset 24
    const freeSize = this.reader.readU16();
    const usedSize = this.reader.readU16();

    // Offset 28
    this.reader.readU16(); // unknown4
    const numRowsLarge = this.reader.readU16();

    // Offset 32
    this.reader.readU16(); // unknown5
    this.reader.readU16(); // unknown6

    // First row offset is at offset 36
    const firstRowOffset = this.reader.readU16();

    return {
      pageIndex,
      type,
      nextPage,
      numRowsSmall,
      numRowsLarge,
      freeSize,
      usedSize,
      firstRowIndex: 0,
      firstRowOffset,
      heapOffset: pageOffset + 40, // Data starts after 40-byte header
    };
  }

  private *iterateTableRows(tableType: PageType): Generator<{ offset: number; pageOffset: number }> {
    const table = this.tables.get(tableType);
    if (!table) return;

    let currentPage = table.firstPage;
    const maxPages = 100000; // Safety limit
    let pageCount = 0;

    while (currentPage !== 0 && pageCount < maxPages) {
      pageCount++;

      const header = this.parsePageHeader(currentPage);
      if (!header) break;

      const pageOffset = currentPage * this.pageSize;
      const numRows = header.numRowsLarge > 0 ? header.numRowsLarge : header.numRowsSmall;

      // Safety check for reasonable row count
      if (numRows > 10000 || numRows < 0) {
        currentPage = header.nextPage;
        continue;
      }

      // Row presence bitmap starts at offset 40
      const bitmapOffset = pageOffset + 40;

      // Read row offsets - they're stored as u16 array after the bitmap
      // Bitmap takes up ceil(numRows / 8) bytes, then 0-padded to even
      const bitmapSize = Math.ceil(numRows / 8);
      const paddedBitmapSize = bitmapSize + (bitmapSize % 2);

      // Row offsets start after the bitmap
      const rowOffsetsStart = bitmapOffset + paddedBitmapSize;

      for (let rowIndex = 0; rowIndex < numRows; rowIndex++) {
        // Check if row is present in bitmap
        const byteIndex = Math.floor(rowIndex / 8);
        const bitIndex = rowIndex % 8;

        // Bounds check for bitmap read
        if (bitmapOffset + byteIndex >= this.reader.length) break;

        this.reader.seek(bitmapOffset + byteIndex);
        const bitmapByte = this.reader.readU8();
        const isPresent = (bitmapByte & (1 << bitIndex)) !== 0;

        if (isPresent) {
          // Bounds check for row offset read
          if (rowOffsetsStart + rowIndex * 2 + 2 > this.reader.length) break;

          // Read row offset
          this.reader.seek(rowOffsetsStart + rowIndex * 2);
          const rowOffset = this.reader.readU16();

          const absoluteOffset = pageOffset + rowOffset;

          // Validate offset is within bounds
          if (absoluteOffset > 0 && absoluteOffset < this.reader.length) {
            yield { offset: absoluteOffset, pageOffset };
          }
        }
      }

      currentPage = header.nextPage;
    }
  }

  private parseTrack(offset: number, _pageOffset: number): Partial<Track> | null {
    this.reader.seek(offset);

    const subtype = this.reader.readU16();
    this.reader.readU16(); // indexShift
    this.reader.readU32(); // bitmask
    const sampleRate = this.reader.readU32();
    this.reader.readU32(); // composerId
    const fileSize = this.reader.readU32();

    this.reader.seek(offset + 20);
    const artworkId = this.reader.readU32();
    const keyId = this.reader.readU32();
    this.reader.readU32(); // originalArtistId
    this.reader.readU32(); // labelId
    this.reader.readU32(); // remixerId
    const bitrate = this.reader.readU32();
    const trackNumber = this.reader.readU32();
    const tempo = this.reader.readU32();
    const genreId = this.reader.readU32();
    const albumId = this.reader.readU32();
    const artistId = this.reader.readU32();
    const id = this.reader.readU32();

    this.reader.seek(offset + 68);
    const discNumber = this.reader.readU16();
    this.reader.readU16(); // playCount
    const year = this.reader.readU16();
    this.reader.readU16(); // sampleDepth
    const duration = this.reader.readU16();

    this.reader.seek(offset + 78);
    this.reader.readU16(); // unknown
    const colorId = this.reader.readU8();
    const rating = this.reader.readU8();

    // String offsets start at offset 82
    // The subtype determines if offsets are 8-bit (short) or 16-bit (long)
    const useLongOffsets = (subtype & 0x04) !== 0;

    this.reader.seek(offset + 82);
    const stringOffsets: number[] = [];
    const numStrings = 21;

    if (useLongOffsets) {
      for (let i = 0; i < numStrings; i++) {
        stringOffsets.push(this.reader.readU16());
      }
    } else {
      // Skip the near offset byte
      this.reader.readU8();
      for (let i = 0; i < numStrings; i++) {
        stringOffsets.push(this.reader.readU16());
      }
    }

    // String order based on Kaitai schema:
    // 0: isrc, 1: texter, 2: unknown, 3: unknown, 4: message,
    // 5: kuvo_public, 6: autoload_hot_cues, 7: unknown, 8: unknown,
    // 9: date_added, 10: release_date, 11: mix_name, 12: unknown,
    // 13: analyze_path, 14: analyze_date, 15: comment, 16: title,
    // 17: unknown, 18: filename, 19: file_path

    const title = this.reader.readDeviceSqlString(offset, stringOffsets[16] || 0);
    const fileName = this.reader.readDeviceSqlString(offset, stringOffsets[18] || 0);
    const filePath = this.reader.readDeviceSqlString(offset, stringOffsets[19] || 0);
    const comment = this.reader.readDeviceSqlString(offset, stringOffsets[15] || 0);
    const dateAdded = this.reader.readDeviceSqlString(offset, stringOffsets[9] || 0);

    return {
      id,
      title,
      artistId,
      albumId,
      genreId,
      keyId,
      duration,
      tempo,
      rating,
      colorId,
      bitrate,
      sampleRate,
      fileSize,
      filePath,
      fileName,
      trackNumber,
      discNumber,
      year,
      comment,
      dateAdded,
      artworkId,
    };
  }

  private parseArtist(offset: number): Partial<Artist> | null {
    this.reader.seek(offset);

    this.reader.readU16(); // subtype
    this.reader.readU16(); // indexShift
    const id = this.reader.readU32();

    // Name offset
    const ofsNameNear = this.reader.readU8();
    const name = this.reader.readDeviceSqlString(offset, ofsNameNear || 9);

    return { id, name };
  }

  private parseAlbum(offset: number): Partial<Album> | null {
    this.reader.seek(offset);

    this.reader.readU16(); // subtype
    this.reader.readU16(); // indexShift
    const artistId = this.reader.readU32();
    const id = this.reader.readU32();

    const ofsNameNear = this.reader.readU8();
    const name = this.reader.readDeviceSqlString(offset, ofsNameNear || 13);

    return { id, name, artistId };
  }

  private parseGenre(offset: number): Partial<Genre> | null {
    this.reader.seek(offset);

    const id = this.reader.readU32();
    const name = this.reader.readDeviceSqlString(offset, 5);

    return { id, name };
  }

  private parseKey(offset: number): Partial<Key> | null {
    this.reader.seek(offset);

    const id = this.reader.readU32();
    this.reader.readU32(); // id2
    const name = this.reader.readDeviceSqlString(offset, 9);

    return { id, name };
  }

  private parseColor(offset: number): Partial<Color> | null {
    this.reader.seek(offset);

    // Color rows are smaller
    this.reader.readU32(); // unknown
    const id = this.reader.readU8();
    this.reader.readU8(); // unknown
    const name = this.reader.readDeviceSqlString(offset, 6);

    return { id, name };
  }

  private parseArtwork(offset: number): Partial<Artwork> | null {
    this.reader.seek(offset);

    const id = this.reader.readU32();
    const path = this.reader.readDeviceSqlString(offset, 5);

    return { id, path };
  }

  private parsePlaylistTreeNode(offset: number): Partial<PlaylistTreeNode> | null {
    this.reader.seek(offset);

    const parentId = this.reader.readU32();
    const sortOrder = this.reader.readU32();
    const id = this.reader.readU32();
    const rawIsFolder = this.reader.readU32();
    const name = this.reader.readDeviceSqlString(offset, 17);

    return {
      id,
      parentId,
      name,
      isFolder: rawIsFolder !== 0,
      sortOrder,
    };
  }

  private parsePlaylistEntry(offset: number): Partial<PlaylistEntry> | null {
    this.reader.seek(offset);

    const entryIndex = this.reader.readU32();
    const trackId = this.reader.readU32();
    const playlistId = this.reader.readU32();

    return { entryIndex, trackId, playlistId };
  }

  parse(): RekordboxDatabase {
    const db: RekordboxDatabase = {
      tracks: new Map(),
      artists: new Map(),
      albums: new Map(),
      genres: new Map(),
      keys: new Map(),
      colors: new Map(),
      artworks: new Map(),
      playlistTree: new Map(),
      playlistEntries: [],
    };

    // Parse artists first (tracks reference them)
    try {
      for (const { offset } of this.iterateTableRows(PageType.Artists)) {
        try {
          const artist = this.parseArtist(offset);
          if (artist?.id !== undefined) {
            db.artists.set(artist.id, artist as Artist);
          }
        } catch { /* skip bad row */ }
      }
    } catch (e) {
      console.warn('[PDB Parser] Error parsing artists:', e);
    }

    // Parse albums
    try {
      for (const { offset } of this.iterateTableRows(PageType.Albums)) {
        try {
          const album = this.parseAlbum(offset);
          if (album?.id !== undefined) {
            db.albums.set(album.id, album as Album);
          }
        } catch { /* skip bad row */ }
      }
    } catch (e) {
      console.warn('[PDB Parser] Error parsing albums:', e);
    }

    // Parse genres
    try {
      for (const { offset } of this.iterateTableRows(PageType.Genres)) {
        try {
          const genre = this.parseGenre(offset);
          if (genre?.id !== undefined) {
            db.genres.set(genre.id, genre as Genre);
          }
        } catch { /* skip bad row */ }
      }
    } catch (e) {
      console.warn('[PDB Parser] Error parsing genres:', e);
    }

    // Parse keys
    try {
      for (const { offset } of this.iterateTableRows(PageType.Keys)) {
        try {
          const key = this.parseKey(offset);
          if (key?.id !== undefined) {
            db.keys.set(key.id, key as Key);
          }
        } catch { /* skip bad row */ }
      }
    } catch (e) {
      console.warn('[PDB Parser] Error parsing keys:', e);
    }

    // Parse colors
    try {
      for (const { offset } of this.iterateTableRows(PageType.Colors)) {
        try {
          const color = this.parseColor(offset);
          if (color?.id !== undefined) {
            db.colors.set(color.id, color as Color);
          }
        } catch { /* skip bad row */ }
      }
    } catch (e) {
      console.warn('[PDB Parser] Error parsing colors:', e);
    }

    // Parse artwork
    try {
      for (const { offset } of this.iterateTableRows(PageType.Artwork)) {
        try {
          const artwork = this.parseArtwork(offset);
          if (artwork?.id !== undefined) {
            db.artworks.set(artwork.id, artwork as Artwork);
          }
        } catch { /* skip bad row */ }
      }
    } catch (e) {
      console.warn('[PDB Parser] Error parsing artwork:', e);
    }

    // Parse tracks
    try {
      for (const { offset, pageOffset } of this.iterateTableRows(PageType.Tracks)) {
        try {
          const track = this.parseTrack(offset, pageOffset);
          if (track?.id !== undefined) {
            // Resolve references
            const fullTrack: Track = {
              ...track as Track,
              artist: db.artists.get(track.artistId || 0)?.name || '',
              album: db.albums.get(track.albumId || 0)?.name || '',
              genre: db.genres.get(track.genreId || 0)?.name || '',
              key: db.keys.get(track.keyId || 0)?.name || '',
            };
            db.tracks.set(track.id, fullTrack);
          }
        } catch { /* skip bad row */ }
      }
    } catch (e) {
      console.warn('[PDB Parser] Error parsing tracks:', e);
    }

    // Parse playlist tree
    try {
      for (const { offset } of this.iterateTableRows(PageType.PlaylistTree)) {
        try {
          const node = this.parsePlaylistTreeNode(offset);
          if (node?.id !== undefined) {
            db.playlistTree.set(node.id, node as PlaylistTreeNode);
          }
        } catch { /* skip bad row */ }
      }
    } catch (e) {
      console.warn('[PDB Parser] Error parsing playlist tree:', e);
    }

    // Parse playlist entries
    try {
      for (const { offset } of this.iterateTableRows(PageType.PlaylistEntries)) {
        try {
          const entry = this.parsePlaylistEntry(offset);
          if (entry?.trackId !== undefined && entry?.playlistId !== undefined) {
            db.playlistEntries.push(entry as PlaylistEntry);
          }
        } catch { /* skip bad row */ }
      }
    } catch (e) {
      console.warn('[PDB Parser] Error parsing playlist entries:', e);
    }

    return db;
  }
}

export async function parsePDBFile(file: File): Promise<RekordboxDatabase> {
  const buffer = await file.arrayBuffer();

  console.log(`[PDB Parser] File size: ${buffer.byteLength} bytes`);

  const parser = new PDBParser(buffer);
  const db = parser.parse();

  console.log(`[PDB Parser] Parsed: ${db.tracks.size} tracks, ${db.artists.size} artists, ${db.playlistTree.size} playlists`);

  return db;
}
