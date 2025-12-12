import { useMemo, useState } from 'react';
import type { Track, PlaylistEntry, PlaylistTreeNode } from '../types/rekordbox';

interface TrackListProps {
  tracks: Map<number, Track>;
  playlistEntries: PlaylistEntry[];
  playlistTree: Map<number, PlaylistTreeNode>;
  selectedPlaylistId: number | null;
  onPlayTrack?: (track: Track) => void;
  currentTrackId?: number | null;
}

type SortKey = 'title' | 'artist' | 'bpm' | 'key' | 'duration' | 'genre';
type SortDir = 'asc' | 'desc';

export function TrackList({
  tracks,
  playlistEntries,
  playlistTree,
  selectedPlaylistId,
  onPlayTrack,
  currentTrackId,
}: TrackListProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('title');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  // Get playlist name
  const playlistName = useMemo(() => {
    if (selectedPlaylistId === null) return 'All Tracks';
    return playlistTree.get(selectedPlaylistId)?.name || 'Playlist';
  }, [selectedPlaylistId, playlistTree]);

  // Get tracks for current view
  const displayTracks = useMemo(() => {
    let trackList: Track[];

    if (selectedPlaylistId === null) {
      // All tracks
      trackList = Array.from(tracks.values());
    } else {
      // Playlist tracks
      const entries = playlistEntries
        .filter(e => e.playlistId === selectedPlaylistId)
        .sort((a, b) => a.entryIndex - b.entryIndex);

      trackList = entries
        .map(e => tracks.get(e.trackId))
        .filter((t): t is Track => t !== undefined);
    }

    // Filter by search
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      trackList = trackList.filter(
        t =>
          t.title.toLowerCase().includes(query) ||
          t.artist.toLowerCase().includes(query) ||
          t.album.toLowerCase().includes(query)
      );
    }

    // Sort
    trackList.sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case 'title':
          cmp = a.title.localeCompare(b.title);
          break;
        case 'artist':
          cmp = a.artist.localeCompare(b.artist);
          break;
        case 'bpm':
          cmp = (a.tempo || 0) - (b.tempo || 0);
          break;
        case 'key':
          cmp = (a.key || '').localeCompare(b.key || '');
          break;
        case 'duration':
          cmp = (a.duration || 0) - (b.duration || 0);
          break;
        case 'genre':
          cmp = (a.genre || '').localeCompare(b.genre || '');
          break;
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });

    return trackList;
  }, [tracks, playlistEntries, selectedPlaylistId, searchQuery, sortKey, sortDir]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const formatBPM = (tempo: number) => {
    return (tempo / 100).toFixed(1);
  };

  const SortHeader = ({ label, sortKeyName }: { label: string; sortKeyName: SortKey }) => (
    <button
      onClick={() => handleSort(sortKeyName)}
      className={`flex items-center gap-1 hover:text-white transition-colors ${
        sortKey === sortKeyName ? 'text-purple-400' : ''
      }`}
    >
      {label}
      {sortKey === sortKeyName && (
        <span className="text-xs">{sortDir === 'asc' ? '▲' : '▼'}</span>
      )}
    </button>
  );

  return (
    <div className="flex-1 flex flex-col h-full bg-zinc-950">
      {/* Header */}
      <div className="p-4 border-b border-zinc-800 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold text-white">{playlistName}</h2>
          <span className="text-zinc-500">{displayTracks.length} tracks</span>
        </div>

        {/* Search */}
        <div className="relative">
          <input
            type="text"
            placeholder="Search tracks..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-4 py-2 pl-10 text-white placeholder-zinc-500 focus:outline-none focus:border-purple-500 transition-colors"
          />
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
        </div>
      </div>

      {/* Table Header */}
      <div className="grid grid-cols-[1fr_1fr_80px_80px_70px_120px] gap-4 px-4 py-2 border-b border-zinc-800 text-sm text-zinc-400 font-medium">
        <SortHeader label="Title" sortKeyName="title" />
        <SortHeader label="Artist" sortKeyName="artist" />
        <SortHeader label="BPM" sortKeyName="bpm" />
        <SortHeader label="Key" sortKeyName="key" />
        <SortHeader label="Time" sortKeyName="duration" />
        <SortHeader label="Genre" sortKeyName="genre" />
      </div>

      {/* Track List */}
      <div className="flex-1 overflow-y-auto">
        {displayTracks.length === 0 ? (
          <div className="flex items-center justify-center h-64 text-zinc-500">
            {searchQuery ? 'No tracks match your search' : 'No tracks in this playlist'}
          </div>
        ) : (
          displayTracks.map((track, index) => {
            const isPlaying = currentTrackId === track.id;
            return (
              <div
                key={`${track.id}-${index}`}
                onClick={() => onPlayTrack?.(track)}
                onDoubleClick={() => onPlayTrack?.(track)}
                className={`grid grid-cols-[1fr_1fr_80px_80px_70px_120px] gap-4 px-4 py-3 border-b border-zinc-800/50 hover:bg-zinc-900/50 transition-colors text-sm cursor-pointer ${
                  isPlaying ? 'bg-purple-900/30' : ''
                }`}
              >
                <div className="truncate flex items-center gap-2">
                  {isPlaying && (
                    <span className="text-purple-400">
                      <PlayingIcon />
                    </span>
                  )}
                  <span className={isPlaying ? 'text-purple-300' : 'text-white'}>{track.title || 'Unknown'}</span>
                </div>
                <div className={`truncate ${isPlaying ? 'text-purple-300' : 'text-zinc-400'}`}>{track.artist || 'Unknown'}</div>
                <div className="text-zinc-400">{track.tempo ? formatBPM(track.tempo) : '-'}</div>
                <div className="text-zinc-400">{track.key || '-'}</div>
                <div className="text-zinc-400">{track.duration ? formatDuration(track.duration) : '-'}</div>
                <div className="truncate text-zinc-500">{track.genre || '-'}</div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

function PlayingIcon() {
  return (
    <svg className="w-4 h-4 animate-pulse" fill="currentColor" viewBox="0 0 20 20">
      <path d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" />
    </svg>
  );
}
