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
 */
function findPlaylistEntriesByPattern(
  buffer: ArrayBuffer,
  originalEntries: PlaylistEntry[]
): Map<string, number> {
  const locations = new Map<string, number>();
  const view = new DataView(buffer);

  // For each original entry, scan the buffer to find where it's stored
  for (const entry of originalEntries) {
    // Search for the pattern: entry_index, track_id, playlist_id
    // We know the track_id and playlist_id, so search for those
    for (let offset = 0; offset < buffer.byteLength - 12; offset += 2) {
      try {
        const trackId = view.getUint32(offset + 4, true);
        const playlistId = view.getUint32(offset + 8, true);

        if (trackId === entry.trackId && playlistId === entry.playlistId) {
          const entryIndex = view.getUint32(offset, true);
          if (entryIndex === entry.entryIndex) {
            // Found it!
            const key = `${playlistId}-${trackId}`;
            locations.set(key, offset);
            break; // Found this entry, move to next
          }
        }
      } catch {
        // Skip invalid reads
      }
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

  // Find locations of all playlist entries
  console.log('[PDB Writer] Finding playlist entry locations...');
  const locations = findPlaylistEntriesByPattern(buffer, originalEntries);
  console.log(`[PDB Writer] Found ${locations.size} entry locations`);

  // Apply modifications
  let modCount = 0;

  for (const entry of modifiedEntries) {
    const key = `${entry.playlistId}-${entry.trackId}`;
    const offset = locations.get(key);

    if (offset !== undefined) {
      // Update the entry_index at this location
      const currentIndex = view.getUint32(offset, true);
      if (currentIndex !== entry.entryIndex) {
        view.setUint32(offset, entry.entryIndex, true);
        modCount++;
      }
    }
  }

  console.log(`[PDB Writer] Modified ${modCount} entries`);

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
