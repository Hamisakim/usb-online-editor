import { useState, useCallback, useMemo } from 'react';
import { useFileSystem } from './hooks/useFileSystem';
import { usePlaylistEditor } from './hooks/usePlaylistEditor';
import { LandingScreen } from './components/LandingScreen';
import { PlaylistSidebar } from './components/PlaylistSidebar';
import { TrackList } from './components/TrackList';
import { AudioPlayer } from './components/AudioPlayer';
import type { Track } from './types/rekordbox';

function App() {
  const {
    isSupported,
    database,
    isLoading,
    isSaving,
    error,
    selectUSBFolder,
    clearDatabase,
    loadAudioFile,
    saveDatabase,
  } = useFileSystem();

  const playlistEditor = usePlaylistEditor(database);

  const [selectedPlaylistId, setSelectedPlaylistId] = useState<number | null>(null);
  const [currentTrack, setCurrentTrack] = useState<Track | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [currentTrackIndex, setCurrentTrackIndex] = useState<number>(0);
  const [isEditMode, setIsEditMode] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(256);

  // Get the current list of tracks based on selection
  const currentTrackList = useMemo(() => {
    if (!database) return [];

    if (selectedPlaylistId === null) {
      return Array.from(database.tracks.values());
    }

    // Use the playlist editor's entries (which includes modifications)
    return playlistEditor.getPlaylistTracks(selectedPlaylistId);
  }, [database, selectedPlaylistId, playlistEditor]);

  const handlePlayTrack = useCallback(async (track: Track) => {
    // Clean up previous audio URL
    if (audioUrl) {
      URL.revokeObjectURL(audioUrl);
    }

    setCurrentTrack(track);

    // Find index in current list
    const index = currentTrackList.findIndex(t => t.id === track.id);
    setCurrentTrackIndex(index >= 0 ? index : 0);

    // Load the audio file
    if (track.filePath) {
      const url = await loadAudioFile(track.filePath);
      setAudioUrl(url);
    } else {
      setAudioUrl(null);
    }
  }, [audioUrl, loadAudioFile, currentTrackList]);

  const handleNextTrack = useCallback(async () => {
    if (currentTrackList.length === 0) return;

    const nextIndex = (currentTrackIndex + 1) % currentTrackList.length;
    const nextTrack = currentTrackList[nextIndex];
    if (nextTrack) {
      await handlePlayTrack(nextTrack);
    }
  }, [currentTrackIndex, currentTrackList, handlePlayTrack]);

  const handlePreviousTrack = useCallback(async () => {
    if (currentTrackList.length === 0) return;

    const prevIndex = (currentTrackIndex - 1 + currentTrackList.length) % currentTrackList.length;
    const prevTrack = currentTrackList[prevIndex];
    if (prevTrack) {
      await handlePlayTrack(prevTrack);
    }
  }, [currentTrackIndex, currentTrackList, handlePlayTrack]);

  const handleRemoveTrack = useCallback((trackId: number) => {
    if (selectedPlaylistId !== null) {
      playlistEditor.removeTrackFromPlaylist(selectedPlaylistId, trackId);
    }
  }, [selectedPlaylistId, playlistEditor]);

  const handleReorderTrack = useCallback((fromIndex: number, toIndex: number) => {
    if (selectedPlaylistId !== null) {
      playlistEditor.reorderPlaylistTracks(selectedPlaylistId, fromIndex, toIndex);
    }
  }, [selectedPlaylistId, playlistEditor]);

  const handleAddTrackToPlaylist = useCallback((trackId: number, playlistId: number) => {
    return playlistEditor.addTrackToPlaylist(playlistId, trackId);
  }, [playlistEditor]);

  const handleSave = useCallback(async () => {
    const success = await saveDatabase(playlistEditor.allPlaylistEntries);
    if (success) {
      playlistEditor.markAsSaved(); // Keep modifications but clear "unsaved" flag
    }
  }, [saveDatabase, playlistEditor]);

  // Show landing screen if no database loaded
  if (!database) {
    return (
      <LandingScreen
        isSupported={isSupported}
        isLoading={isLoading}
        error={error}
        onSelectFolder={selectUSBFolder}
      />
    );
  }

  return (
    <div className="h-screen flex flex-col bg-zinc-950">
      {/* Top Bar */}
      <header className="h-12 bg-zinc-900/80 backdrop-blur border-b border-zinc-800/80 flex items-center justify-between px-4">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 bg-gradient-to-br from-purple-500 to-purple-700 rounded flex items-center justify-center">
              <svg className="w-3.5 h-3.5 text-white" fill="currentColor" viewBox="0 0 20 20">
                <path d="M18 3a1 1 0 00-1.196-.98l-10 2A1 1 0 006 5v9.114A4.369 4.369 0 005 14c-1.657 0-3 .895-3 2s1.343 2 3 2 3-.895 3-2V7.82l8-1.6v5.894A4.37 4.37 0 0015 12c-1.657 0-3 .895-3 2s1.343 2 3 2 3-.895 3-2V3z" />
              </svg>
            </div>
            <h1 className="text-sm font-semibold text-white">USB Playlist Editor</h1>
          </div>
          <span className="text-zinc-600 text-xs">|</span>
          <span className="text-zinc-500 text-xs font-medium">Rekordbox</span>
          {playlistEditor.hasUnsavedChanges && (
            <span className="bg-amber-500/20 text-amber-400 text-[10px] px-2 py-0.5 rounded-full font-medium">
              Unsaved
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {playlistEditor.hasUnsavedChanges && (
            <>
              <button
                onClick={playlistEditor.discardChanges}
                disabled={isSaving}
                className="px-3 py-1.5 text-xs text-zinc-500 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors disabled:opacity-50"
              >
                Discard
              </button>
              <button
                onClick={handleSave}
                disabled={isSaving}
                className="px-3 py-1.5 text-xs bg-purple-600 text-white hover:bg-purple-500 rounded-lg transition-colors disabled:opacity-50 flex items-center gap-1.5 font-medium shadow-lg shadow-purple-900/20"
              >
                {isSaving ? (
                  <>
                    <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Saving...
                  </>
                ) : (
                  'Save to USB'
                )}
              </button>
            </>
          )}
          <div className="w-px h-5 bg-zinc-800 mx-1" />
          <button
            onClick={() => setIsEditMode(!isEditMode)}
            className={`px-3 py-1.5 text-xs rounded-lg transition-all font-medium ${
              isEditMode
                ? 'bg-purple-600 text-white shadow-lg shadow-purple-900/30'
                : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
            }`}
          >
            {isEditMode ? 'Done' : 'Edit'}
          </button>
          <button
            onClick={clearDatabase}
            className="px-3 py-1.5 text-xs text-zinc-500 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors"
          >
            Close
          </button>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        <PlaylistSidebar
          playlistTree={database.playlistTree}
          playlistEntries={playlistEditor.allPlaylistEntries}
          tracks={database.tracks}
          selectedPlaylistId={selectedPlaylistId}
          onSelectPlaylist={setSelectedPlaylistId}
          onSelectAllTracks={() => setSelectedPlaylistId(null)}
          onAddTrackToPlaylist={handleAddTrackToPlaylist}
          width={sidebarWidth}
          onWidthChange={setSidebarWidth}
        />
        <TrackList
          tracks={database.tracks}
          playlistEntries={playlistEditor.allPlaylistEntries}
          playlistTree={database.playlistTree}
          selectedPlaylistId={selectedPlaylistId}
          onPlayTrack={handlePlayTrack}
          currentTrackId={currentTrack?.id ?? null}
          isEditMode={isEditMode}
          onRemoveTrack={handleRemoveTrack}
          onReorderTrack={handleReorderTrack}
          onAddToPlaylist={handleAddTrackToPlaylist}
          availablePlaylists={Array.from(database.playlistTree.values()).filter(p => !p.isFolder)}
        />
      </div>

      {/* Audio Player */}
      <AudioPlayer
        track={currentTrack}
        audioUrl={audioUrl}
        onNext={handleNextTrack}
        onPrevious={handlePreviousTrack}
      />
    </div>
  );
}

export default App;
