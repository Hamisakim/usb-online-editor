# USB Playlist Editor

A browser-based editor for Rekordbox USB playlists. Edit your DJ playlists directly from your USB drive without opening Rekordbox.

**[Live Demo](https://djmyusb.netlify.app)**

## Features

- **Direct USB Access** - Edit playlists directly on your USB drive using the File System Access API
- **Drag & Drop Reordering** - Intuitive drag-and-drop interface for reordering tracks
- **Audio Preview** - Play tracks directly from your USB with waveform visualization
- **Rekordbox-Style UI** - Familiar column layout with sortable fields (BPM, Key, Genre, etc.)
- **Safe Editing** - Automatic backups created before saving changes
- **Fast Performance** - Optimized binary parser for quick loading of large libraries
- **No Installation** - Runs entirely in your browser, no downloads needed

## Tech Stack

- **React 19** - UI framework
- **TypeScript** - Type safety
- **Vite** - Build tool and dev server
- **Tailwind CSS 4** - Styling
- **File System Access API** - Direct USB drive access
- **rekordbox-parser** - PDB database parsing
- **Web Audio API** - Audio playback and waveform generation

## Browser Compatibility

Requires a browser with File System Access API support:

- Chrome/Edge 86+
- Opera 72+

Note: Firefox and Safari do not currently support the File System Access API.

## Development

```bash
# Install dependencies
npm install

# Start dev server
npm run dev

# Build for production
npm run build
```

## How It Works

1. Select your USB drive or PIONEER folder
2. The app reads and parses the `export.pdb` file
3. Edit playlists using drag-and-drop or remove tracks
4. Save changes back to the USB (creates automatic backup)
5. Eject USB and use with CDJs/XDJs

## Technical Details

The app directly modifies the Rekordbox `export.pdb` file by:

- Parsing the DeviceSQL binary format using `rekordbox-parser`
- Locating playlist entry records in the binary data
- Updating `entry_index` values to reflect new track order
- Writing modified binary back to the USB drive

All modifications are done client-side in the browser - no server or data upload required.
