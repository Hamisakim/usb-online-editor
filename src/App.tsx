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
    error,
    selectUSBFolder,
    clearDatabase,
    loadAudioFile,
  } = useFileSystem();

  const playlistEditor = usePlaylistEditor(database);

  const [selectedPlaylistId, setSelectedPlaylistId] = useState<number | null>(null);
  const [currentTrack, setCurrentTrack] = useState<Track | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [currentTrackIndex, setCurrentTrackIndex] = useState<number>(0);
  const [isEditMode, setIsEditMode] = useState(false);

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

  const handleMoveTrackUp = useCallback((trackId: number) => {
    if (selectedPlaylistId !== null) {
      playlistEditor.moveTrackUp(selectedPlaylistId, trackId);
    }
  }, [selectedPlaylistId, playlistEditor]);

  const handleMoveTrackDown = useCallback((trackId: number) => {
    if (selectedPlaylistId !== null) {
      playlistEditor.moveTrackDown(selectedPlaylistId, trackId);
    }
  }, [selectedPlaylistId, playlistEditor]);

  const handleAddTrackToPlaylist = useCallback((trackId: number, playlistId: number) => {
    return playlistEditor.addTrackToPlaylist(playlistId, trackId);
  }, [playlistEditor]);

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
      <header className="h-14 bg-zinc-900 border-b border-zinc-800 flex items-center justify-between px-4">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-semibold text-white">USB Playlist Editor</h1>
          <span className="text-zinc-500 text-sm">Rekordbox</span>
          {playlistEditor.hasUnsavedChanges && (
            <span className="bg-yellow-600 text-yellow-100 text-xs px-2 py-0.5 rounded">Unsaved changes</span>
          )}
        </div>
        <div className="flex items-center gap-3">
          {playlistEditor.hasUnsavedChanges && (
            <>
              <button
                onClick={playlistEditor.discardChanges}
                className="px-3 py-1.5 text-sm text-zinc-400 hover:text-white hover:bg-zinc-800 rounded transition-colors"
              >
                Discard Changes
              </button>
              <button
                onClick={() => alert('Save functionality coming soon!')}
                className="px-3 py-1.5 text-sm bg-purple-600 text-white hover:bg-purple-500 rounded transition-colors"
              >
                Save to USB
              </button>
            </>
          )}
          <button
            onClick={() => setIsEditMode(!isEditMode)}
            className={`px-3 py-1.5 text-sm rounded transition-colors ${
              isEditMode
                ? 'bg-purple-600 text-white'
                : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
            }`}
          >
            {isEditMode ? 'Done Editing' : 'Edit Mode'}
          </button>
          <button
            onClick={clearDatabase}
            className="px-3 py-1.5 text-sm text-zinc-400 hover:text-white hover:bg-zinc-800 rounded transition-colors"
          >
            Close USB
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
          onMoveTrackUp={handleMoveTrackUp}
          onMoveTrackDown={handleMoveTrackDown}
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
