import { useState, useCallback, useMemo } from 'react';
import type { PlaylistEntry, Track, RekordboxDatabase } from '../types/rekordbox';

interface PlaylistEditorState {
  // Modified playlist entries - keyed by playlist ID
  modifiedPlaylists: Map<number, PlaylistEntry[]>;
  hasUnsavedChanges: boolean;
}

export function usePlaylistEditor(database: RekordboxDatabase | null) {
  const [state, setState] = useState<PlaylistEditorState>({
    modifiedPlaylists: new Map(),
    hasUnsavedChanges: false,
  });

  // Get entries for a playlist (modified if available, otherwise original)
  const getPlaylistEntries = useCallback((playlistId: number): PlaylistEntry[] => {
    if (!database) return [];

    // Check for modified version first
    if (state.modifiedPlaylists.has(playlistId)) {
      return state.modifiedPlaylists.get(playlistId)!;
    }

    // Return original entries
    return database.playlistEntries
      .filter(e => e.playlistId === playlistId)
      .sort((a, b) => a.entryIndex - b.entryIndex);
  }, [database, state.modifiedPlaylists]);

  // Get all playlist entries (with modifications applied)
  const allPlaylistEntries = useMemo((): PlaylistEntry[] => {
    if (!database) return [];

    // Start with all original entries
    const entriesByPlaylist = new Map<number, PlaylistEntry[]>();

    for (const entry of database.playlistEntries) {
      if (!entriesByPlaylist.has(entry.playlistId)) {
        entriesByPlaylist.set(entry.playlistId, []);
      }
      entriesByPlaylist.get(entry.playlistId)!.push(entry);
    }

    // Override with modified playlists
    for (const [playlistId, entries] of state.modifiedPlaylists) {
      entriesByPlaylist.set(playlistId, entries);
    }

    // Flatten and return
    return Array.from(entriesByPlaylist.values()).flat();
  }, [database, state.modifiedPlaylists]);

  // Remove a track from a playlist
  const removeTrackFromPlaylist = useCallback((playlistId: number, trackId: number) => {
    const currentEntries = getPlaylistEntries(playlistId);
    const newEntries = currentEntries
      .filter(e => e.trackId !== trackId)
      .map((e, index) => ({ ...e, entryIndex: index }));

    setState(prev => ({
      modifiedPlaylists: new Map(prev.modifiedPlaylists).set(playlistId, newEntries),
      hasUnsavedChanges: true,
    }));
  }, [getPlaylistEntries]);

  // Reorder tracks in a playlist
  const reorderPlaylistTracks = useCallback((playlistId: number, fromIndex: number, toIndex: number) => {
    const currentEntries = [...getPlaylistEntries(playlistId)];

    if (fromIndex < 0 || fromIndex >= currentEntries.length) return;
    if (toIndex < 0 || toIndex >= currentEntries.length) return;

    // Remove from old position and insert at new position
    const [removed] = currentEntries.splice(fromIndex, 1);
    currentEntries.splice(toIndex, 0, removed);

    // Update entry indices
    const newEntries = currentEntries.map((e, index) => ({ ...e, entryIndex: index }));

    setState(prev => ({
      modifiedPlaylists: new Map(prev.modifiedPlaylists).set(playlistId, newEntries),
      hasUnsavedChanges: true,
    }));
  }, [getPlaylistEntries]);

  // Add a track to a playlist
  const addTrackToPlaylist = useCallback((playlistId: number, trackId: number) => {
    const currentEntries = getPlaylistEntries(playlistId);

    // Check if track already exists in playlist
    if (currentEntries.some(e => e.trackId === trackId)) {
      return false;
    }

    const newEntry: PlaylistEntry = {
      playlistId,
      trackId,
      entryIndex: currentEntries.length,
    };

    const newEntries = [...currentEntries, newEntry];

    setState(prev => ({
      modifiedPlaylists: new Map(prev.modifiedPlaylists).set(playlistId, newEntries),
      hasUnsavedChanges: true,
    }));

    return true;
  }, [getPlaylistEntries]);

  // Move track up in playlist
  const moveTrackUp = useCallback((playlistId: number, trackId: number) => {
    const currentEntries = getPlaylistEntries(playlistId);
    const index = currentEntries.findIndex(e => e.trackId === trackId);

    if (index > 0) {
      reorderPlaylistTracks(playlistId, index, index - 1);
    }
  }, [getPlaylistEntries, reorderPlaylistTracks]);

  // Move track down in playlist
  const moveTrackDown = useCallback((playlistId: number, trackId: number) => {
    const currentEntries = getPlaylistEntries(playlistId);
    const index = currentEntries.findIndex(e => e.trackId === trackId);

    if (index >= 0 && index < currentEntries.length - 1) {
      reorderPlaylistTracks(playlistId, index, index + 1);
    }
  }, [getPlaylistEntries, reorderPlaylistTracks]);

  // Discard all changes
  const discardChanges = useCallback(() => {
    setState({
      modifiedPlaylists: new Map(),
      hasUnsavedChanges: false,
    });
  }, []);

  // Mark changes as saved (keeps modifications but clears unsaved flag)
  const markAsSaved = useCallback(() => {
    setState(prev => ({
      ...prev,
      hasUnsavedChanges: false,
    }));
  }, []);

  // Get tracks for a specific playlist view (resolved to Track objects)
  const getPlaylistTracks = useCallback((playlistId: number): Track[] => {
    if (!database) return [];

    const entries = getPlaylistEntries(playlistId);
    return entries
      .map(e => database.tracks.get(e.trackId))
      .filter((t): t is Track => t !== undefined);
  }, [database, getPlaylistEntries]);

  return {
    hasUnsavedChanges: state.hasUnsavedChanges,
    allPlaylistEntries,
    getPlaylistEntries,
    getPlaylistTracks,
    removeTrackFromPlaylist,
    reorderPlaylistTracks,
    addTrackToPlaylist,
    moveTrackUp,
    moveTrackDown,
    discardChanges,
    markAsSaved,
  };
}
