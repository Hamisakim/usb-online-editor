/**
 * Rekordbox PDB Writer
 *
 * Modifies playlist entries in the PDB binary format.
 * This is a simplified writer that works by:
 * 1. Finding playlist entry rows in the binary by pattern matching
 * 2. Updating entry_index values in place
 *
 * Based on DeviceSQL format analysis from crate-digger project.
 */

import type { PlaylistEntry } from '../types/rekordbox';

/**
 * Scan for playlist entries by searching for patterns in the binary
 * OPTIMIZED: Single-pass through the buffer instead of one pass per entry
 */
function findPlaylistEntriesByPattern(
  buffer: ArrayBuffer,
  originalEntries: PlaylistEntry[]
): Map<string, number> {
  const locations = new Map<string, number>();
  const view = new DataView(buffer);

  // Create a lookup set for faster matching (tracks which entries we still need to find)
  const entriesToFind = new Set<string>();
  for (const entry of originalEntries) {
    const key = `${entry.playlistId}-${entry.trackId}-${entry.entryIndex}`;
    entriesToFind.add(key);
  }

  // Single pass through the buffer
  for (let offset = 0; offset < buffer.byteLength - 12; offset += 2) {
    try {
      const entryIndex = view.getUint32(offset, true);
      const trackId = view.getUint32(offset + 4, true);
      const playlistId = view.getUint32(offset + 8, true);

      // Check if this matches any of our entries
      const lookupKey = `${playlistId}-${trackId}-${entryIndex}`;
      if (entriesToFind.has(lookupKey)) {
        // Store with the full key including entryIndex to handle duplicate tracks
        locations.set(lookupKey, offset);
        entriesToFind.delete(lookupKey);

        // Early exit if we found all entries
        if (entriesToFind.size === 0) {
          break;
        }
      }
    } catch {
      // Skip invalid reads
    }
  }

  return locations;
}

/**
 * Apply playlist entry modifications to the buffer
 */
export function applyPlaylistModifications(
  originalBuffer: ArrayBuffer,
  originalEntries: PlaylistEntry[],
  modifiedEntries: PlaylistEntry[]
): ArrayBuffer {
  // Create a copy of the buffer to modify
  const buffer = originalBuffer.slice(0);
  const view = new DataView(buffer);

  // Find locations of all playlist entries in the buffer
  console.log('[PDB Writer] Finding playlist entry locations...');
  console.log(`[PDB Writer] Original entries: ${originalEntries.length}, Modified entries: ${modifiedEntries.length}`);
  const locations = findPlaylistEntriesByPattern(buffer, originalEntries);
  console.log(`[PDB Writer] Found ${locations.size} entry locations`);

  // Group modified entries by playlist and track for lookup
  const modifiedByPlaylist = new Map<number, PlaylistEntry[]>();
  for (const entry of modifiedEntries) {
    if (!modifiedByPlaylist.has(entry.playlistId)) {
      modifiedByPlaylist.set(entry.playlistId, []);
    }
    modifiedByPlaylist.get(entry.playlistId)!.push(entry);
  }

  // Sort modified entries within each playlist by their new entryIndex
  for (const entries of modifiedByPlaylist.values()) {
    entries.sort((a, b) => a.entryIndex - b.entryIndex);
  }

  // Apply modifications
  let modCount = 0;
  let notFoundCount = 0;

  // For each original entry, find the corresponding modified entry and update
  for (const originalEntry of originalEntries) {
    const locationKey = `${originalEntry.playlistId}-${originalEntry.trackId}-${originalEntry.entryIndex}`;
    const offset = locations.get(locationKey);

    if (offset === undefined) {
      notFoundCount++;
      console.warn(`[PDB Writer] Location not found for entry: ${locationKey}`);
      continue;
    }

    // Find the corresponding modified entry
    // For playlists with the same track multiple times, we need to match by position
    const playlistModified = modifiedByPlaylist.get(originalEntry.playlistId);
    if (!playlistModified) {
      // Playlist was removed - skip this entry
      continue;
    }

    // Get all original entries for this playlist+track combination (in original order)
    const originalSameTrack = originalEntries.filter(e =>
      e.playlistId === originalEntry.playlistId && e.trackId === originalEntry.trackId
    ).sort((a, b) => a.entryIndex - b.entryIndex);

    // Get all modified entries for this playlist+track combination
    const modifiedSameTrack = playlistModified.filter(e => e.trackId === originalEntry.trackId);

    if (modifiedSameTrack.length === 0) {
      // Track was removed from this playlist - skip
      continue;
    }

    // Find which instance this is (0, 1, 2, etc.) of this track in this playlist
    const instanceIndex = originalSameTrack.findIndex(e => e.entryIndex === originalEntry.entryIndex);

    // Get the corresponding modified entry by instance
    const modifiedEntry = modifiedSameTrack[instanceIndex];

    if (!modifiedEntry) {
      // This instance was removed
      continue;
    }

    // Update the entry_index at this location with the new value
    const currentIndex = view.getUint32(offset, true);
    if (currentIndex !== modifiedEntry.entryIndex) {
      view.setUint32(offset, modifiedEntry.entryIndex, true);
      modCount++;
    }
  }

  console.log(`[PDB Writer] Modified ${modCount} entries, ${notFoundCount} not found`);

  return buffer;
}

/**
 * Create a backup filename
 */
export function createBackupFilename(): string {
  const now = new Date();
  const timestamp = now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
  return `export.pdb.backup-${timestamp}`;
}
