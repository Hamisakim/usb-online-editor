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
  onReorderTrack?: (fromIndex: number, toIndex: number) => void;
  onAddToPlaylist?: (trackId: number, playlistId: number) => boolean;
  availablePlaylists?: PlaylistTreeNode[];
}

type SortKey = 'order' | 'title' | 'artist' | 'album' | 'genre' | 'bpm' | 'key' | 'duration' | 'rating' | 'bitrate' | 'year' | 'dateAdded' | 'comment' | 'trackNumber' | 'fileSize' | 'fileName' | 'sampleRate';
type SortDir = 'asc' | 'desc';

interface ColumnConfig {
  id: string;
  label: string;
  width: number;
  minWidth: number;
  sortKey?: SortKey;
  getValue: (track: Track) => string | number;
  format?: (value: string | number, track: Track) => string;
  align?: 'left' | 'right' | 'center';
}

const ALL_COLUMNS: ColumnConfig[] = [
  { id: 'order', label: '#', width: 50, minWidth: 40, sortKey: 'order', getValue: () => 0, align: 'center' },
  { id: 'title', label: 'Title', width: 250, minWidth: 100, sortKey: 'title', getValue: t => t.title || 'Unknown' },
  { id: 'artist', label: 'Artist', width: 180, minWidth: 80, sortKey: 'artist', getValue: t => t.artist || 'Unknown' },
  { id: 'album', label: 'Album', width: 180, minWidth: 80, sortKey: 'album', getValue: t => t.album || '' },
  { id: 'genre', label: 'Genre', width: 120, minWidth: 60, sortKey: 'genre', getValue: t => t.genre || '' },
  { id: 'bpm', label: 'BPM', width: 70, minWidth: 50, sortKey: 'bpm', getValue: t => t.tempo || 0, format: v => v ? (Number(v) / 100).toFixed(1) : '-', align: 'right' },
  { id: 'key', label: 'Key', width: 70, minWidth: 50, sortKey: 'key', getValue: t => t.key || '', align: 'center' },
  { id: 'duration', label: 'Time', width: 70, minWidth: 50, sortKey: 'duration', getValue: t => t.duration || 0, format: v => { const s = Number(v); return s ? `${Math.floor(s/60)}:${(s%60).toString().padStart(2,'0')}` : '-'; }, align: 'right' },
  { id: 'rating', label: 'Rating', width: 80, minWidth: 60, sortKey: 'rating', getValue: t => t.rating || 0, format: v => v ? '★'.repeat(Number(v)) : '-', align: 'center' },
  { id: 'bitrate', label: 'Bitrate', width: 80, minWidth: 60, sortKey: 'bitrate', getValue: t => t.bitrate || 0, format: v => v ? `${v}` : '-', align: 'right' },
  { id: 'year', label: 'Year', width: 60, minWidth: 50, sortKey: 'year', getValue: t => t.year || 0, format: v => v && v !== 0 ? String(v) : '-', align: 'center' },
  { id: 'comment', label: 'Comment', width: 150, minWidth: 80, sortKey: 'comment', getValue: t => t.comment || '' },
  { id: 'trackNumber', label: 'Track #', width: 70, minWidth: 50, sortKey: 'trackNumber', getValue: t => t.trackNumber || 0, format: v => v && v !== 0 ? String(v) : '-', align: 'center' },
  { id: 'dateAdded', label: 'Date Added', width: 100, minWidth: 80, sortKey: 'dateAdded', getValue: t => t.dateAdded || '' },
  { id: 'sampleRate', label: 'Sample Rate', width: 100, minWidth: 70, sortKey: 'sampleRate', getValue: t => t.sampleRate || 0, format: v => v ? `${(Number(v)/1000).toFixed(1)} kHz` : '-', align: 'right' },
  { id: 'fileSize', label: 'Size', width: 80, minWidth: 60, sortKey: 'fileSize', getValue: t => t.fileSize || 0, format: v => { const mb = Number(v) / (1024*1024); return mb > 0 ? `${mb.toFixed(1)} MB` : '-'; }, align: 'right' },
  { id: 'fileName', label: 'File Name', width: 200, minWidth: 100, sortKey: 'fileName', getValue: t => t.fileName || '' },
];

const DEFAULT_VISIBLE_COLUMNS = ['order', 'title', 'artist', 'bpm', 'key', 'duration', 'genre'];

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
  const [sortKey, setSortKey] = useState<SortKey>('order');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [addToPlaylistTrackId, setAddToPlaylistTrackId] = useState<number | null>(null);
  const [visibleColumns, setVisibleColumns] = useState<string[]>(DEFAULT_VISIBLE_COLUMNS);
  const [showColumnMenu, setShowColumnMenu] = useState(false);
  const columnMenuRef = useRef<HTMLDivElement>(null);

  // Drag and drop state
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  // Column resize state
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>(() => {
    const widths: Record<string, number> = {};
    ALL_COLUMNS.forEach(c => { widths[c.id] = c.width; });
    widths['actions'] = 80;
    return widths;
  });
  const [resizingColumn, setResizingColumn] = useState<string | null>(null);
  const resizeStartX = useRef<number>(0);
  const resizeStartWidth = useRef<number>(0);

  // Close column menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (columnMenuRef.current && !columnMenuRef.current.contains(e.target as Node)) {
        setShowColumnMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const isPlaylistView = selectedPlaylistId !== null;

  // Filter columns based on visibility and context
  const displayColumns = useMemo(() => {
    return ALL_COLUMNS.filter(col => {
      if (col.id === 'order' && !isPlaylistView) return false;
      return visibleColumns.includes(col.id);
    });
  }, [visibleColumns, isPlaylistView]);

  // Get playlist name
  const playlistName = useMemo(() => {
    if (selectedPlaylistId === null) return 'All Tracks';
    return playlistTree.get(selectedPlaylistId)?.name || 'Playlist';
  }, [selectedPlaylistId, playlistTree]);

  // Get tracks for current view
  const displayTracks = useMemo(() => {
    let trackList: Track[];

    if (selectedPlaylistId === null) {
      trackList = Array.from(tracks.values());
    } else {
      const entries = playlistEntries
        .filter(e => e.playlistId === selectedPlaylistId)
        .sort((a, b) => a.entryIndex - b.entryIndex);
      trackList = entries
        .map(e => tracks.get(e.trackId))
        .filter((t): t is Track => t !== undefined);
    }

    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      trackList = trackList.filter(t =>
        t.title.toLowerCase().includes(query) ||
        t.artist.toLowerCase().includes(query) ||
        t.album.toLowerCase().includes(query) ||
        t.comment?.toLowerCase().includes(query)
      );
    }

    const shouldPreserveOrder = (sortKey === 'order' && isPlaylistView) || isEditMode;

    if (!shouldPreserveOrder) {
      trackList.sort((a, b) => {
        let cmp = 0;
        const col = ALL_COLUMNS.find(c => c.sortKey === sortKey);
        if (col) {
          const aVal = col.getValue(a);
          const bVal = col.getValue(b);
          if (typeof aVal === 'number' && typeof bVal === 'number') {
            cmp = aVal - bVal;
          } else {
            cmp = String(aVal).localeCompare(String(bVal));
          }
        }
        return sortDir === 'asc' ? cmp : -cmp;
      });
    } else if (sortDir === 'desc' && isPlaylistView) {
      trackList.reverse();
    }

    return trackList;
  }, [tracks, playlistEntries, selectedPlaylistId, searchQuery, sortKey, sortDir, isEditMode, isPlaylistView]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  const toggleColumn = (columnId: string) => {
    setVisibleColumns(prev => {
      if (prev.includes(columnId)) {
        return prev.filter(id => id !== columnId);
      } else {
        // Insert in the same order as ALL_COLUMNS
        const allIds = ALL_COLUMNS.map(c => c.id);
        const newVisible = [...prev, columnId];
        return newVisible.sort((a, b) => allIds.indexOf(a) - allIds.indexOf(b));
      }
    });
  };

  // Drag and drop handlers
  const handleDragStart = useCallback((e: React.DragEvent, index: number, trackId: number) => {
    e.dataTransfer.setData('application/x-track-id', trackId.toString());
    e.dataTransfer.effectAllowed = 'copyMove';
    if (isEditMode && selectedPlaylistId !== null) {
      setDraggedIndex(index);
      e.dataTransfer.setData('text/plain', index.toString());
    }
  }, [isEditMode, selectedPlaylistId]);

  const handleDragOver = useCallback((e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === index) return;
    setDragOverIndex(index);
  }, [draggedIndex]);

  const handleDragLeave = useCallback(() => { setDragOverIndex(null); }, []);

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
  const handleResizeStart = useCallback((e: React.MouseEvent, columnId: string) => {
    e.preventDefault();
    e.stopPropagation();
    setResizingColumn(columnId);
    resizeStartX.current = e.clientX;
    resizeStartWidth.current = columnWidths[columnId] || 100;
  }, [columnWidths]);

  useEffect(() => {
    if (!resizingColumn) return;
    const col = ALL_COLUMNS.find(c => c.id === resizingColumn);
    const minWidth = col?.minWidth || 50;

    const handleMouseMove = (e: MouseEvent) => {
      const delta = e.clientX - resizeStartX.current;
      const newWidth = Math.max(minWidth, resizeStartWidth.current + delta);
      setColumnWidths(prev => ({ ...prev, [resizingColumn]: newWidth }));
    };

    const handleMouseUp = () => setResizingColumn(null);

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [resizingColumn]);

  const gridTemplateColumns = useMemo(() => {
    const cols = displayColumns.map(col => `${columnWidths[col.id] || col.width}px`);
    if (isEditMode) cols.push(`${columnWidths['actions'] || 80}px`);
    return cols.join(' ');
  }, [displayColumns, columnWidths, isEditMode]);

  const canReorder = isEditMode && isPlaylistView && !searchQuery;

  return (
    <div className="flex-1 flex flex-col h-full bg-zinc-950 min-w-0">
      {/* Header */}
      <div className="p-4 border-b border-zinc-800 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold text-white">{playlistName}</h2>
          <div className="flex items-center gap-2">
            <span className="text-zinc-500">{displayTracks.length} tracks</span>
            <div className="relative" ref={columnMenuRef}>
              <button
                onClick={() => setShowColumnMenu(!showColumnMenu)}
                className="p-1.5 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded transition-colors"
                title="Configure columns"
              >
                <ColumnsIcon />
              </button>
              {showColumnMenu && (
                <div className="absolute right-0 top-full mt-1 z-50 bg-zinc-800 border border-zinc-700 rounded-lg shadow-xl py-2 min-w-[180px] max-h-[400px] overflow-y-auto">
                  <div className="px-3 py-1 text-xs text-zinc-500 font-medium">Show Columns</div>
                  {ALL_COLUMNS.filter(c => c.id !== 'order').map(col => (
                    <label
                      key={col.id}
                      className="flex items-center gap-2 px-3 py-1.5 hover:bg-zinc-700 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={visibleColumns.includes(col.id)}
                        onChange={() => toggleColumn(col.id)}
                        className="rounded border-zinc-600 bg-zinc-900 text-purple-500 focus:ring-purple-500"
                      />
                      <span className="text-sm text-zinc-300">{col.label}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="relative">
          <input
            type="text"
            placeholder="Search tracks..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-4 py-2 pl-10 text-white placeholder-zinc-500 focus:outline-none focus:border-purple-500 transition-colors"
          />
          <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
        </div>

        {isEditMode && isPlaylistView && (
          <div className="text-xs text-zinc-500">Drag tracks to reorder them in the playlist</div>
        )}
      </div>

      {/* Table Header */}
      <div
        className="grid gap-2 px-4 py-2 border-b border-zinc-800 text-sm text-zinc-400 font-medium select-none"
        style={{ gridTemplateColumns }}
      >
        {displayColumns.map(col => (
          <div key={col.id} className="relative group flex items-center">
            <button
              onClick={() => col.sortKey && handleSort(col.sortKey)}
              className={`flex items-center gap-1 hover:text-white transition-colors truncate ${
                sortKey === col.sortKey ? 'text-purple-400' : ''
              }`}
            >
              {col.label}
              {sortKey === col.sortKey && (
                <span className="text-xs">{sortDir === 'asc' ? '▲' : '▼'}</span>
              )}
            </button>
            <div
              className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-purple-500 group-hover:bg-zinc-600"
              onMouseDown={e => handleResizeStart(e, col.id)}
            />
          </div>
        ))}
        {isEditMode && (
          <div className="relative group flex items-center">
            <span>Actions</span>
            <div
              className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-purple-500 group-hover:bg-zinc-600"
              onMouseDown={e => handleResizeStart(e, 'actions')}
            />
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
                draggable={true}
                onDragStart={e => handleDragStart(e, index, track.id)}
                onDragOver={canReorder ? (e => handleDragOver(e, index)) : undefined}
                onDragLeave={canReorder ? handleDragLeave : undefined}
                onDrop={canReorder ? (e => handleDrop(e, index)) : undefined}
                onDragEnd={handleDragEnd}
                onClick={() => onPlayTrack?.(track)}
                className={`grid gap-2 px-4 py-2.5 border-b border-zinc-800/50 hover:bg-zinc-900/50 transition-colors text-sm cursor-pointer ${
                  isPlaying ? 'bg-purple-900/30' : ''
                } ${isDragging ? 'opacity-50 bg-zinc-800' : ''} ${
                  isDragOver ? 'border-t-2 border-t-purple-500' : ''
                } ${canReorder ? 'cursor-grab active:cursor-grabbing' : ''}`}
                style={{ gridTemplateColumns }}
              >
                {displayColumns.map(col => {
                  if (col.id === 'order') {
                    return (
                      <div key={col.id} className="text-zinc-500 flex items-center gap-1 justify-center">
                        {canReorder && <GripIcon />}
                        <span>{index + 1}</span>
                      </div>
                    );
                  }
                  if (col.id === 'title') {
                    return (
                      <div key={col.id} className="truncate flex items-center gap-2 min-w-0">
                        {isPlaying && <PlayingIcon />}
                        <span className={isPlaying ? 'text-purple-300' : 'text-white'}>{track.title || 'Unknown'}</span>
                      </div>
                    );
                  }
                  const value = col.getValue(track);
                  const formatted = col.format ? col.format(value, track) : (value || '-');
                  return (
                    <div
                      key={col.id}
                      className={`truncate ${col.id === 'artist' && isPlaying ? 'text-purple-300' : 'text-zinc-400'} ${
                        col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : ''
                      }`}
                    >
                      {formatted}
                    </div>
                  );
                })}

                {isEditMode && (
                  <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                    {isPlaylistView ? (
                      <button
                        onClick={() => onRemoveTrack?.(track.id)}
                        className="p-1 text-red-400 hover:text-red-300 hover:bg-red-900/30 rounded"
                        title="Remove from playlist"
                      >
                        <TrashIcon />
                      </button>
                    ) : (
                      <div className="relative">
                        <button
                          onClick={() => setAddToPlaylistTrackId(showAddDropdown ? null : track.id)}
                          className="p-1 text-zinc-400 hover:text-purple-400 hover:bg-purple-900/30 rounded"
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
    <svg className="w-4 h-4 text-purple-400 animate-pulse flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
      <path d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" />
    </svg>
  );
}

function GripIcon() {
  return (
    <svg className="w-3 h-3 text-zinc-600 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24">
      <circle cx="9" cy="6" r="1.5" /><circle cx="15" cy="6" r="1.5" />
      <circle cx="9" cy="12" r="1.5" /><circle cx="15" cy="12" r="1.5" />
      <circle cx="9" cy="18" r="1.5" /><circle cx="15" cy="18" r="1.5" />
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

function ColumnsIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" />
    </svg>
  );
}

function SearchIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
    </svg>
  );
}
