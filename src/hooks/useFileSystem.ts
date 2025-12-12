/**
 * File System Access API Hook
 *
 * Provides access to USB/folder selection and file read/write
 * for Rekordbox database files.
 */

import { useState, useCallback } from 'react';
import type { RekordboxDatabase } from '../types/rekordbox';
import { parsePDBFile } from '../lib/pdb-parser';

interface FileSystemState {
  isSupported: boolean;
  directoryHandle: FileSystemDirectoryHandle | null;
  pioneerHandle: FileSystemDirectoryHandle | null;
  database: RekordboxDatabase | null;
  isLoading: boolean;
  error: string | null;
}

export function useFileSystem() {
  const [state, setState] = useState<FileSystemState>({
    isSupported: 'showDirectoryPicker' in window,
    directoryHandle: null,
    pioneerHandle: null,
    database: null,
    isLoading: false,
    error: null,
  });

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

      // Parse the database
      const database = await parsePDBFile(pdbFile);

      setState({
        isSupported: true,
        directoryHandle,
        pioneerHandle,
        database,
        isLoading: false,
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
    setState({
      isSupported: state.isSupported,
      directoryHandle: null,
      pioneerHandle: null,
      database: null,
      isLoading: false,
      error: null,
    });
  }, [state.isSupported]);

  return {
    ...state,
    selectUSBFolder,
    clearDatabase,
  };
}

// Type augmentation for File System Access API
declare global {
  interface Window {
    showDirectoryPicker(options?: {
      mode?: 'read' | 'readwrite';
    }): Promise<FileSystemDirectoryHandle>;
  }
}
