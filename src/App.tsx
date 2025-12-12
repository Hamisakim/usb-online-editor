import { useState } from 'react';
import { useFileSystem } from './hooks/useFileSystem';
import { LandingScreen } from './components/LandingScreen';
import { PlaylistSidebar } from './components/PlaylistSidebar';
import { TrackList } from './components/TrackList';

function App() {
  const {
    isSupported,
    database,
    isLoading,
    error,
    selectUSBFolder,
    clearDatabase,
  } = useFileSystem();

  const [selectedPlaylistId, setSelectedPlaylistId] = useState<number | null>(null);

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
        />
      </div>
    </div>
  );
}

export default App;
