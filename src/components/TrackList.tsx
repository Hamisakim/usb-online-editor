import { useMemo, useState, useCallback, useRef, useEffect } from 'react';
import type { Track, PlaylistEntry, PlaylistTreeNode } from '../types/rekordbox';

interface TrackListProps {
  tracks: Map<number, Track>;
  playlistEntries: PlaylistEntry[];
  playlistTree: Map<number, PlaylistTreeNode>;
  selectedPlaylistId: number | null;
  onPlayTrack?: (track: Track) => void;
  currentTrackId?: number | null;
  isEditMode?: boolean;
  onRemoveTrack?: (trackId: number) => void;
  onMoveTrackUp?: (trackId: number) => void;
  onMoveTrackDown?: (trackId: number) => void;
  onReorderTrack?: (fromIndex: number, toIndex: number) => void;
  onAddToPlaylist?: (trackId: number, playlistId: number) => boolean;
  availablePlaylists?: PlaylistTreeNode[];
}

type SortKey = 'title' | 'artist' | 'bpm' | 'key' | 'duration' | 'genre';
type SortDir = 'asc' | 'desc';

interface ColumnWidths {
  title: number;
  artist: number;
  bpm: number;
  key: number;
  duration: number;
  genre: number;
  actions: number;
}

const DEFAULT_COLUMN_WIDTHS: ColumnWidths = {
  title: 250,
  artist: 200,
  bpm: 70,
  key: 70,
  duration: 70,
  genre: 120,
  actions: 100,
};

const MIN_COLUMN_WIDTH = 50;

export function TrackList({
  tracks,
  playlistEntries,
  playlistTree,
  selectedPlaylistId,
  onPlayTrack,
  currentTrackId,
  isEditMode = false,
  onRemoveTrack,
  onReorderTrack,
  onAddToPlaylist,
  availablePlaylists = [],
}: TrackListProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('title');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [addToPlaylistTrackId, setAddToPlaylistTrackId] = useState<number | null>(null);

  // Drag and drop state
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  // Column resize state
  const [columnWidths, setColumnWidths] = useState<ColumnWidths>(DEFAULT_COLUMN_WIDTHS);
  const [resizingColumn, setResizingColumn] = useState<keyof ColumnWidths | null>(null);
  const resizeStartX = useRef<number>(0);
  const resizeStartWidth = useRef<number>(0);

  // Get playlist name
  const playlistName = useMemo(() => {
    if (selectedPlaylistId === null) return 'All Tracks';
    return playlistTree.get(selectedPlaylistId)?.name || 'Playlist';
  }, [selectedPlaylistId, playlistTree]);

  // Get tracks for current view - don't sort when in playlist edit mode
  const displayTracks = useMemo(() => {
    let trackList: Track[];

    if (selectedPlaylistId === null) {
      // All tracks
      trackList = Array.from(tracks.values());
    } else {
      // Playlist tracks - maintain order from entries
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

    // Only sort when not in edit mode for playlists (preserve playlist order when editing)
    if (selectedPlaylistId === null || !isEditMode) {
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
    }

    return trackList;
  }, [tracks, playlistEntries, selectedPlaylistId, searchQuery, sortKey, sortDir, isEditMode]);

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

  // Drag and drop handlers
  const handleDragStart = useCallback((e: React.DragEvent, index: number) => {
    if (!isEditMode || selectedPlaylistId === null) return;
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', index.toString());
  }, [isEditMode, selectedPlaylistId]);

  const handleDragOver = useCallback((e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === index) return;
    setDragOverIndex(index);
  }, [draggedIndex]);

  const handleDragLeave = useCallback(() => {
    setDragOverIndex(null);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent, toIndex: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === toIndex) {
      setDraggedIndex(null);
      setDragOverIndex(null);
      return;
    }

    onReorderTrack?.(draggedIndex, toIndex);
    setDraggedIndex(null);
    setDragOverIndex(null);
  }, [draggedIndex, onReorderTrack]);

  const handleDragEnd = useCallback(() => {
    setDraggedIndex(null);
    setDragOverIndex(null);
  }, []);

  // Column resize handlers
  const handleResizeStart = useCallback((e: React.MouseEvent, column: keyof ColumnWidths) => {
    e.preventDefault();
    e.stopPropagation();
    setResizingColumn(column);
    resizeStartX.current = e.clientX;
    resizeStartWidth.current = columnWidths[column];
  }, [columnWidths]);

  useEffect(() => {
    if (!resizingColumn) return;

    const handleMouseMove = (e: MouseEvent) => {
      const delta = e.clientX - resizeStartX.current;
      const newWidth = Math.max(MIN_COLUMN_WIDTH, resizeStartWidth.current + delta);
      setColumnWidths(prev => ({ ...prev, [resizingColumn]: newWidth }));
    };

    const handleMouseUp = () => {
      setResizingColumn(null);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [resizingColumn]);

  const gridTemplateColumns = useMemo(() => {
    const cols = [
      `${columnWidths.title}px`,
      `${columnWidths.artist}px`,
      `${columnWidths.bpm}px`,
      `${columnWidths.key}px`,
      `${columnWidths.duration}px`,
      `${columnWidths.genre}px`,
    ];
    if (isEditMode) {
      cols.push(`${columnWidths.actions}px`);
    }
    return cols.join(' ');
  }, [columnWidths, isEditMode]);

  const canDrag = isEditMode && selectedPlaylistId !== null && !searchQuery;

  const ResizeHandle = ({ column }: { column: keyof ColumnWidths }) => (
    <div
      className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-purple-500 group-hover:bg-zinc-600"
      onMouseDown={e => handleResizeStart(e, column)}
    />
  );

  const SortHeader = ({ label, sortKeyName, column }: { label: string; sortKeyName: SortKey; column: keyof ColumnWidths }) => (
    <div className="relative group flex items-center">
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
      <ResizeHandle column={column} />
    </div>
  );

  return (
    <div className="flex-1 flex flex-col h-full bg-zinc-950 min-w-0">
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

        {/* Edit mode hint */}
        {isEditMode && selectedPlaylistId !== null && (
          <div className="text-xs text-zinc-500">
            Drag tracks to reorder them in the playlist
          </div>
        )}
      </div>

      {/* Table Header */}
      <div
        className="grid gap-4 px-4 py-2 border-b border-zinc-800 text-sm text-zinc-400 font-medium select-none"
        style={{ gridTemplateColumns }}
      >
        <SortHeader label="Title" sortKeyName="title" column="title" />
        <SortHeader label="Artist" sortKeyName="artist" column="artist" />
        <SortHeader label="BPM" sortKeyName="bpm" column="bpm" />
        <SortHeader label="Key" sortKeyName="key" column="key" />
        <SortHeader label="Time" sortKeyName="duration" column="duration" />
        <SortHeader label="Genre" sortKeyName="genre" column="genre" />
        {isEditMode && (
          <div className="relative group flex items-center">
            <span>Actions</span>
            <ResizeHandle column="actions" />
          </div>
        )}
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
            const isDragging = draggedIndex === index;
            const isDragOver = dragOverIndex === index;
            const showAddDropdown = addToPlaylistTrackId === track.id;

            return (
              <div
                key={`${track.id}-${index}`}
                draggable={canDrag}
                onDragStart={e => handleDragStart(e, index)}
                onDragOver={e => handleDragOver(e, index)}
                onDragLeave={handleDragLeave}
                onDrop={e => handleDrop(e, index)}
                onDragEnd={handleDragEnd}
                onClick={() => onPlayTrack?.(track)}
                onDoubleClick={() => onPlayTrack?.(track)}
                className={`grid gap-4 px-4 py-3 border-b border-zinc-800/50 hover:bg-zinc-900/50 transition-colors text-sm cursor-pointer ${
                  isPlaying ? 'bg-purple-900/30' : ''
                } ${isDragging ? 'opacity-50 bg-zinc-800' : ''} ${
                  isDragOver ? 'border-t-2 border-t-purple-500' : ''
                } ${canDrag ? 'cursor-grab active:cursor-grabbing' : ''}`}
                style={{ gridTemplateColumns }}
              >
                <div className="truncate flex items-center gap-2 min-w-0">
                  {canDrag && (
                    <span className="text-zinc-600 flex-shrink-0">
                      <GripIcon />
                    </span>
                  )}
                  {isPlaying && (
                    <span className="text-purple-400 flex-shrink-0">
                      <PlayingIcon />
                    </span>
                  )}
                  <span className={`truncate ${isPlaying ? 'text-purple-300' : 'text-white'}`}>{track.title || 'Unknown'}</span>
                </div>
                <div className={`truncate ${isPlaying ? 'text-purple-300' : 'text-zinc-400'}`}>{track.artist || 'Unknown'}</div>
                <div className="text-zinc-400">{track.tempo ? formatBPM(track.tempo) : '-'}</div>
                <div className="text-zinc-400">{track.key || '-'}</div>
                <div className="text-zinc-400">{track.duration ? formatDuration(track.duration) : '-'}</div>
                <div className="truncate text-zinc-500">{track.genre || '-'}</div>

                {/* Edit Controls */}
                {isEditMode && (
                  <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                    {selectedPlaylistId !== null ? (
                      // Playlist view: remove button
                      <button
                        onClick={() => onRemoveTrack?.(track.id)}
                        className="p-1 text-red-400 hover:text-red-300 hover:bg-red-900/30 rounded"
                        title="Remove from playlist"
                      >
                        <TrashIcon />
                      </button>
                    ) : (
                      // All tracks view: add to playlist
                      <div className="relative">
                        <button
                          onClick={() => setAddToPlaylistTrackId(showAddDropdown ? null : track.id)}
                          className="p-1 text-zinc-400 hover:text-purple-400 hover:bg-purple-900/30 rounded flex items-center gap-1"
                          title="Add to playlist"
                        >
                          <PlusIcon />
                        </button>
                        {showAddDropdown && (
                          <div className="absolute right-0 top-full mt-1 z-50 bg-zinc-800 border border-zinc-700 rounded-lg shadow-xl py-1 min-w-[160px]">
                            {availablePlaylists.length === 0 ? (
                              <div className="px-3 py-2 text-zinc-500 text-xs">No playlists</div>
                            ) : (
                              availablePlaylists.map(playlist => (
                                <button
                                  key={playlist.id}
                                  onClick={() => {
                                    onAddToPlaylist?.(track.id, playlist.id);
                                    setAddToPlaylistTrackId(null);
                                  }}
                                  className="w-full px-3 py-2 text-left text-sm text-zinc-300 hover:bg-zinc-700 hover:text-white"
                                >
                                  {playlist.name}
                                </button>
                              ))
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
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

function GripIcon() {
  return (
    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
      <circle cx="9" cy="6" r="1.5" />
      <circle cx="15" cy="6" r="1.5" />
      <circle cx="9" cy="12" r="1.5" />
      <circle cx="15" cy="12" r="1.5" />
      <circle cx="9" cy="18" r="1.5" />
      <circle cx="15" cy="18" r="1.5" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
    </svg>
  );
}
