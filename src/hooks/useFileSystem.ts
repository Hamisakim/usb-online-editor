/**
 * File System Access API Hook
 *
 * Provides access to USB/folder selection and file read/write
 * for Rekordbox database files.
 */

import { useState, useCallback, useRef } from 'react';
import type { RekordboxDatabase, PlaylistEntry } from '../types/rekordbox';
import { parsePDBFile } from '../lib/pdb-parser';
import { applyPlaylistModifications, createBackupFilename } from '../lib/pdb-writer';

interface FileSystemState {
  isSupported: boolean;
  directoryHandle: FileSystemDirectoryHandle | null;
  pioneerHandle: FileSystemDirectoryHandle | null;
  database: RekordboxDatabase | null;
  isLoading: boolean;
  isSaving: boolean;
  error: string | null;
}

export function useFileSystem() {
  const [state, setState] = useState<FileSystemState>({
    isSupported: 'showDirectoryPicker' in window,
    directoryHandle: null,
    pioneerHandle: null,
    database: null,
    isLoading: false,
    isSaving: false,
    error: null,
  });

  // Store the original PDB buffer and entries for comparison/modification
  const originalPdbBuffer = useRef<ArrayBuffer | null>(null);
  const originalPlaylistEntries = useRef<PlaylistEntry[]>([]);
  const rekordboxHandleRef = useRef<FileSystemDirectoryHandle | null>(null);

  const selectUSBFolder = useCallback(async () => {
    if (!state.isSupported) {
      setState(prev => ({
        ...prev,
        error: 'File System Access API not supported. Please use Chrome or Edge.',
      }));
      return;
    }

    setState(prev => ({ ...prev, isLoading: true, error: null }));

    try {
      // Let user select the USB root or PIONEER folder
      const directoryHandle = await window.showDirectoryPicker({
        mode: 'readwrite',
      });

      // Try to find the PIONEER folder
      let pioneerHandle: FileSystemDirectoryHandle | null = null;

      // Check if this IS the PIONEER folder
      if (directoryHandle.name === 'PIONEER') {
        pioneerHandle = directoryHandle;
      } else {
        // Look for PIONEER folder inside
        try {
          pioneerHandle = await directoryHandle.getDirectoryHandle('PIONEER');
        } catch {
          // No PIONEER folder found
          setState(prev => ({
            ...prev,
            isLoading: false,
            error: 'No PIONEER folder found. Please select your USB drive or the PIONEER folder directly.',
          }));
          return;
        }
      }

      // Find the rekordbox folder
      let rekordboxHandle: FileSystemDirectoryHandle;
      try {
        rekordboxHandle = await pioneerHandle.getDirectoryHandle('rekordbox');
      } catch {
        setState(prev => ({
          ...prev,
          isLoading: false,
          error: 'No rekordbox folder found inside PIONEER. Is this a valid Rekordbox USB?',
        }));
        return;
      }

      // Store the rekordbox handle for later saving
      rekordboxHandleRef.current = rekordboxHandle;

      // Find and read export.pdb
      let pdbFile: File;
      try {
        const pdbHandle = await rekordboxHandle.getFileHandle('export.pdb');
        pdbFile = await pdbHandle.getFile();
      } catch {
        setState(prev => ({
          ...prev,
          isLoading: false,
          error: 'No export.pdb found. Please export your library from Rekordbox first.',
        }));
        return;
      }

      // Store the original buffer
      const buffer = await pdbFile.arrayBuffer();
      originalPdbBuffer.current = buffer.slice(0); // Make a copy

      // Parse the database
      const database = await parsePDBFile(pdbFile);

      // Store original playlist entries
      originalPlaylistEntries.current = [...database.playlistEntries];

      setState({
        isSupported: true,
        directoryHandle,
        pioneerHandle,
        database,
        isLoading: false,
        isSaving: false,
        error: null,
      });
    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        // User cancelled
        setState(prev => ({ ...prev, isLoading: false }));
        return;
      }

      setState(prev => ({
        ...prev,
        isLoading: false,
        error: `Error accessing USB: ${(err as Error).message}`,
      }));
    }
  }, [state.isSupported]);

  const clearDatabase = useCallback(() => {
    originalPdbBuffer.current = null;
    originalPlaylistEntries.current = [];
    rekordboxHandleRef.current = null;

    setState({
      isSupported: state.isSupported,
      directoryHandle: null,
      pioneerHandle: null,
      database: null,
      isLoading: false,
      isSaving: false,
      error: null,
    });
  }, [state.isSupported]);

  // Load an audio file from the USB based on path
  const loadAudioFile = useCallback(async (filePath: string): Promise<string | null> => {
    if (!state.directoryHandle) return null;

    try {
      // Rekordbox stores paths like "/Contents/Artist/Album/track.mp3"
      // We need to navigate from the USB root
      const pathParts = filePath.split('/').filter(p => p.length > 0);

      let currentHandle: FileSystemDirectoryHandle = state.directoryHandle;

      // Navigate to the file's directory
      for (let i = 0; i < pathParts.length - 1; i++) {
        currentHandle = await currentHandle.getDirectoryHandle(pathParts[i]);
      }

      // Get the file
      const fileName = pathParts[pathParts.length - 1];
      const fileHandle = await currentHandle.getFileHandle(fileName);
      const file = await fileHandle.getFile();

      // Create a blob URL for playback
      const url = URL.createObjectURL(file);
      return url;
    } catch (err) {
      console.error('Error loading audio file:', err, filePath);
      return null;
    }
  }, [state.directoryHandle]);

  // Save modified playlist entries back to the PDB file
  const saveDatabase = useCallback(async (modifiedEntries: PlaylistEntry[]): Promise<boolean> => {
    if (!rekordboxHandleRef.current || !originalPdbBuffer.current) {
      setState(prev => ({ ...prev, error: 'No database loaded' }));
      return false;
    }

    setState(prev => ({ ...prev, isSaving: true, error: null }));

    try {
      const rekordboxHandle = rekordboxHandleRef.current;

      // Create a backup of the original file
      const backupFilename = createBackupFilename();
      console.log(`[Save] Creating backup: ${backupFilename}`);

      try {
        const backupHandle = await rekordboxHandle.getFileHandle(backupFilename, { create: true });
        const backupWritable = await backupHandle.createWritable();
        await backupWritable.write(originalPdbBuffer.current);
        await backupWritable.close();
        console.log('[Save] Backup created successfully');
      } catch (backupErr) {
        console.warn('[Save] Could not create backup:', backupErr);
        // Continue anyway - user was warned
      }

      // Apply modifications to the buffer
      console.log('[Save] Applying modifications...');
      const modifiedBuffer = applyPlaylistModifications(
        originalPdbBuffer.current,
        originalPlaylistEntries.current,
        modifiedEntries
      );

      // Write the modified buffer to export.pdb
      console.log('[Save] Writing modified PDB...');
      const pdbHandle = await rekordboxHandle.getFileHandle('export.pdb', { create: false });
      const writable = await pdbHandle.createWritable();
      await writable.write(modifiedBuffer);
      await writable.close();

      // Update our stored originals to reflect the new state
      originalPdbBuffer.current = modifiedBuffer.slice(0);
      originalPlaylistEntries.current = [...modifiedEntries];

      console.log('[Save] Save completed successfully');

      setState(prev => ({ ...prev, isSaving: false }));
      return true;
    } catch (err) {
      console.error('[Save] Error saving:', err);
      setState(prev => ({
        ...prev,
        isSaving: false,
        error: `Error saving to USB: ${(err as Error).message}`,
      }));
      return false;
    }
  }, []);

  return {
    ...state,
    selectUSBFolder,
    clearDatabase,
    loadAudioFile,
    saveDatabase,
  };
}

// Type augmentation for File System Access API
declare global {
  interface Window {
    showDirectoryPicker(options?: {
      mode?: 'read' | 'readwrite';
    }): Promise<FileSystemDirectoryHandle>;
  }

  interface FileSystemFileHandle {
    createWritable(): Promise<FileSystemWritableFileStream>;
  }

  interface FileSystemWritableFileStream extends WritableStream {
    write(data: ArrayBuffer | Uint8Array | Blob | string): Promise<void>;
    close(): Promise<void>;
  }
}
