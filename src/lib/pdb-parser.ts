/**
 * Rekordbox PDB Parser
 *
 * Uses the rekordbox-parser library which is based on Kaitai Struct
 * definitions from the crate-digger project.
 *
 * Reference: https://github.com/evanpurkhiser/rekordbox-parser
 */

import { parsePdb, tableRows, RekordboxPdb } from 'rekordbox-parser';
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

const { PageType } = RekordboxPdb;

// Helper to safely extract string from DeviceSQL string structure
function extractString(field: unknown): string {
  if (!field) return '';

  // The rekordbox-parser returns strings in a nested structure
  // Try different access patterns
  if (typeof field === 'string') return field;

  const f = field as Record<string, unknown>;

  // Pattern: { body: { text: "string" } }
  if (f.body && typeof f.body === 'object') {
    const body = f.body as Record<string, unknown>;
    if (typeof body.text === 'string') return body.text;
  }

  // Pattern: { text: "string" }
  if (typeof f.text === 'string') return f.text;

  // Pattern: { value: "string" }
  if (typeof f.value === 'string') return f.value;

  return '';
}

export async function parsePDBFile(file: File): Promise<RekordboxDatabase> {
  const buffer = await file.arrayBuffer();

  console.log(`[PDB Parser] File size: ${buffer.byteLength} bytes`);

  // Parse using rekordbox-parser
  // The library expects a Buffer-like object, Uint8Array works in browser
  const db = parsePdb(buffer as unknown as Buffer);

  console.log(`[PDB Parser] Found ${db.tables.length} tables`);

  const result: RekordboxDatabase = {
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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  type Table = (typeof db.tables)[number];

  // Find each table by type
  const artistsTable = db.tables.find((t: Table) => t.type === PageType.ARTISTS);
  const albumsTable = db.tables.find((t: Table) => t.type === PageType.ALBUMS);
  const genresTable = db.tables.find((t: Table) => t.type === PageType.GENRES);
  const keysTable = db.tables.find((t: Table) => t.type === PageType.KEYS);
  const colorsTable = db.tables.find((t: Table) => t.type === PageType.COLORS);
  const artworkTable = db.tables.find((t: Table) => t.type === PageType.ARTWORK);
  const tracksTable = db.tables.find((t: Table) => t.type === PageType.TRACKS);
  const playlistTreeTable = db.tables.find((t: Table) => t.type === PageType.PLAYLIST_TREE);
  const playlistEntriesTable = db.tables.find((t: Table) => t.type === PageType.PLAYLIST_ENTRIES);

  // Parse artists
  if (artistsTable) {
    try {
      for (const row of tableRows(artistsTable)) {
        const r = row as Record<string, unknown>;
        const artist: Artist = {
          id: r.id as number,
          name: extractString(r.name),
        };
        if (artist.id !== undefined) {
          result.artists.set(artist.id, artist);
        }
      }
      console.log(`[PDB Parser] Parsed ${result.artists.size} artists`);
    } catch (e) {
      console.warn('[PDB Parser] Error parsing artists:', e);
    }
  }

  // Parse albums
  if (albumsTable) {
    try {
      for (const row of tableRows(albumsTable)) {
        const r = row as Record<string, unknown>;
        const album: Album = {
          id: r.id as number,
          name: extractString(r.name),
          artistId: r.artistId as number || 0,
        };
        if (album.id !== undefined) {
          result.albums.set(album.id, album);
        }
      }
      console.log(`[PDB Parser] Parsed ${result.albums.size} albums`);
    } catch (e) {
      console.warn('[PDB Parser] Error parsing albums:', e);
    }
  }

  // Parse genres
  if (genresTable) {
    try {
      for (const row of tableRows(genresTable)) {
        const r = row as Record<string, unknown>;
        const genre: Genre = {
          id: r.id as number,
          name: extractString(r.name),
        };
        if (genre.id !== undefined) {
          result.genres.set(genre.id, genre);
        }
      }
      console.log(`[PDB Parser] Parsed ${result.genres.size} genres`);
    } catch (e) {
      console.warn('[PDB Parser] Error parsing genres:', e);
    }
  }

  // Parse keys
  if (keysTable) {
    try {
      for (const row of tableRows(keysTable)) {
        const r = row as Record<string, unknown>;
        const key: Key = {
          id: r.id as number,
          name: extractString(r.name),
        };
        if (key.id !== undefined) {
          result.keys.set(key.id, key);
        }
      }
      console.log(`[PDB Parser] Parsed ${result.keys.size} keys`);
    } catch (e) {
      console.warn('[PDB Parser] Error parsing keys:', e);
    }
  }

  // Parse colors
  if (colorsTable) {
    try {
      for (const row of tableRows(colorsTable)) {
        const r = row as Record<string, unknown>;
        const color: Color = {
          id: r.id as number,
          name: extractString(r.name),
        };
        if (color.id !== undefined) {
          result.colors.set(color.id, color);
        }
      }
      console.log(`[PDB Parser] Parsed ${result.colors.size} colors`);
    } catch (e) {
      console.warn('[PDB Parser] Error parsing colors:', e);
    }
  }

  // Parse artwork
  if (artworkTable) {
    try {
      for (const row of tableRows(artworkTable)) {
        const r = row as Record<string, unknown>;
        const artwork: Artwork = {
          id: r.id as number,
          path: extractString(r.path),
        };
        if (artwork.id !== undefined) {
          result.artworks.set(artwork.id, artwork);
        }
      }
      console.log(`[PDB Parser] Parsed ${result.artworks.size} artworks`);
    } catch (e) {
      console.warn('[PDB Parser] Error parsing artwork:', e);
    }
  }

  // Parse tracks
  if (tracksTable) {
    try {
      for (const row of tableRows(tracksTable)) {
        const r = row as Record<string, unknown>;

        const artistId = r.artistId as number || 0;
        const albumId = r.albumId as number || 0;
        const genreId = r.genreId as number || 0;
        const keyId = r.keyId as number || 0;

        const track: Track = {
          id: r.id as number,
          title: extractString(r.title),
          artist: result.artists.get(artistId)?.name || '',
          artistId,
          album: result.albums.get(albumId)?.name || '',
          albumId,
          genre: result.genres.get(genreId)?.name || '',
          genreId,
          key: result.keys.get(keyId)?.name || '',
          keyId,
          duration: r.duration as number || 0,
          tempo: r.tempo as number || 0,
          rating: r.rating as number || 0,
          colorId: r.colorId as number || 0,
          bitrate: r.bitrate as number || 0,
          sampleRate: r.sampleRate as number || 0,
          fileSize: r.fileSize as number || 0,
          filePath: extractString(r.filePath),
          fileName: extractString(r.filename),
          trackNumber: r.trackNumber as number || 0,
          discNumber: r.discNumber as number || 0,
          year: r.year as number || 0,
          comment: extractString(r.comment),
          dateAdded: extractString(r.dateAdded),
          artworkId: r.artworkId as number || 0,
        };

        if (track.id !== undefined) {
          result.tracks.set(track.id, track);
        }
      }
      console.log(`[PDB Parser] Parsed ${result.tracks.size} tracks`);
    } catch (e) {
      console.warn('[PDB Parser] Error parsing tracks:', e);
    }
  }

  // Parse playlist tree
  if (playlistTreeTable) {
    try {
      for (const row of tableRows(playlistTreeTable)) {
        const r = row as Record<string, unknown>;
        const node: PlaylistTreeNode = {
          id: r.id as number,
          parentId: r.parentId as number || 0,
          name: extractString(r.name),
          isFolder: r.isFolder as boolean || r.rawIsFolder !== 0,
          sortOrder: r.sortOrder as number || 0,
        };
        if (node.id !== undefined) {
          result.playlistTree.set(node.id, node);
        }
      }
      console.log(`[PDB Parser] Parsed ${result.playlistTree.size} playlist nodes`);
    } catch (e) {
      console.warn('[PDB Parser] Error parsing playlist tree:', e);
    }
  }

  // Parse playlist entries
  if (playlistEntriesTable) {
    try {
      for (const row of tableRows(playlistEntriesTable)) {
        const r = row as Record<string, unknown>;
        const entry: PlaylistEntry = {
          playlistId: r.playlistId as number,
          trackId: r.trackId as number,
          entryIndex: r.entryIndex as number || 0,
        };
        if (entry.playlistId !== undefined && entry.trackId !== undefined) {
          result.playlistEntries.push(entry);
        }
      }
      console.log(`[PDB Parser] Parsed ${result.playlistEntries.length} playlist entries`);
    } catch (e) {
      console.warn('[PDB Parser] Error parsing playlist entries:', e);
    }
  }

  console.log(`[PDB Parser] Complete: ${result.tracks.size} tracks, ${result.artists.size} artists, ${result.playlistTree.size} playlists`);

  return result;
}
