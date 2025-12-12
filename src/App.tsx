import { useState, useCallback, useMemo } from 'react';
import { useFileSystem } from './hooks/useFileSystem';
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

  const [selectedPlaylistId, setSelectedPlaylistId] = useState<number | null>(null);
  const [currentTrack, setCurrentTrack] = useState<Track | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [currentTrackIndex, setCurrentTrackIndex] = useState<number>(0);

  // Get the current list of tracks based on selection
  const currentTrackList = useMemo(() => {
    if (!database) return [];

    if (selectedPlaylistId === null) {
      return Array.from(database.tracks.values());
    }

    const entries = database.playlistEntries
      .filter(e => e.playlistId === selectedPlaylistId)
      .sort((a, b) => a.entryIndex - b.entryIndex);

    return entries
      .map(e => database.tracks.get(e.trackId))
      .filter((t): t is Track => t !== undefined);
  }, [database, selectedPlaylistId]);

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
        </div>
        <div className="flex items-center gap-3">
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
          playlistEntries={database.playlistEntries}
          tracks={database.tracks}
          selectedPlaylistId={selectedPlaylistId}
          onSelectPlaylist={setSelectedPlaylistId}
          onSelectAllTracks={() => setSelectedPlaylistId(null)}
        />
        <TrackList
          tracks={database.tracks}
          playlistEntries={database.playlistEntries}
          playlistTree={database.playlistTree}
          selectedPlaylistId={selectedPlaylistId}
          onPlayTrack={handlePlayTrack}
          currentTrackId={currentTrack?.id ?? null}
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
