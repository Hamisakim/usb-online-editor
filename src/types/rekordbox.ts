// Rekordbox PDB Database Types
// Based on reverse-engineered format from Deep Symmetry's crate-digger

export interface Track {
  id: number;
  title: string;
  artist: string;
  artistId: number;
  album: string;
  albumId: number;
  genre: string;
  genreId: number;
  duration: number; // seconds
  tempo: number; // BPM (stored as BPM * 100)
  key: string;
  keyId: number;
  rating: number; // 0-5
  colorId: number;
  bitrate: number;
  sampleRate: number;
  fileSize: number;
  filePath: string;
  fileName: string;
  trackNumber: number;
  discNumber: number;
  year: number;
  comment: string;
  dateAdded: string;
  artworkId: number;
}

export interface Artist {
  id: number;
  name: string;
}

export interface Album {
  id: number;
  name: string;
  artistId: number;
}

export interface Genre {
  id: number;
  name: string;
}

export interface Key {
  id: number;
  name: string;
}

export interface Color {
  id: number;
  name: string;
}

export interface Artwork {
  id: number;
  path: string;
}

export interface PlaylistFolder {
  id: number;
  parentId: number;
  name: string;
  isFolder: true;
  sortOrder: number;
  children: (PlaylistFolder | Playlist)[];
}

export interface Playlist {
  id: number;
  parentId: number;
  name: string;
  isFolder: false;
  sortOrder: number;
  entries: PlaylistEntry[];
}

export interface PlaylistEntry {
  playlistId: number;
  trackId: number;
  entryIndex: number;
}

export interface PlaylistTreeNode {
  id: number;
  parentId: number;
  name: string;
  isFolder: boolean;
  sortOrder: number;
}

export interface RekordboxDatabase {
  tracks: Map<number, Track>;
  artists: Map<number, Artist>;
  albums: Map<number, Album>;
  genres: Map<number, Genre>;
  keys: Map<number, Key>;
  colors: Map<number, Color>;
  artworks: Map<number, Artwork>;
  playlistTree: Map<number, PlaylistTreeNode>;
  playlistEntries: PlaylistEntry[];
}

// Page types in PDB file
export const PageType = {
  Tracks: 0,
  Genres: 1,
  Artists: 2,
  Albums: 3,
  Labels: 4,
  Keys: 5,
  Colors: 6,
  PlaylistTree: 7,
  PlaylistEntries: 8,
  HistoryPlaylists: 11,
  HistoryEntries: 12,
  Artwork: 13,
} as const;

export type PageType = (typeof PageType)[keyof typeof PageType];
