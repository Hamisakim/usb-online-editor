interface LandingScreenProps {
  isSupported: boolean;
  isLoading: boolean;
  error: string | null;
  onSelectFolder: () => void;
}

export function LandingScreen({
  isSupported,
  isLoading,
  error,
  onSelectFolder,
}: LandingScreenProps) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-gradient-to-br from-zinc-950 via-zinc-900 to-zinc-950">
      <div className="max-w-md w-full text-center space-y-8">
        {/* Logo / Title */}
        <div className="space-y-2">
          <h1 className="text-4xl font-bold text-white tracking-tight">
            USB Playlist Editor
          </h1>
          <p className="text-zinc-400 text-lg">
            Edit your Rekordbox USB playlists directly in the browser
          </p>
        </div>

        {/* Main Action */}
        <div className="space-y-4">
          {!isSupported ? (
            <div className="bg-red-950/50 border border-red-900 rounded-lg p-4">
              <p className="text-red-400">
                Your browser doesn't support the File System Access API.
                Please use <strong>Chrome</strong> or <strong>Edge</strong>.
              </p>
            </div>
          ) : (
            <>
              <button
                onClick={onSelectFolder}
                disabled={isLoading}
                className="w-full bg-purple-600 hover:bg-purple-500 disabled:bg-purple-800 disabled:cursor-not-allowed text-white font-semibold py-4 px-6 rounded-xl transition-colors flex items-center justify-center gap-3"
              >
                {isLoading ? (
                  <>
                    <LoadingSpinner />
                    <span>Loading...</span>
                  </>
                ) : (
                  <>
                    <USBIcon />
                    <span>Select USB Drive</span>
                  </>
                )}
              </button>

              <p className="text-zinc-500 text-sm">
                Select your USB drive root folder or the PIONEER folder
              </p>
            </>
          )}

          {error && (
            <div className="bg-red-950/50 border border-red-900 rounded-lg p-4">
              <p className="text-red-400 text-sm">{error}</p>
            </div>
          )}
        </div>

        {/* Features */}
        <div className="grid grid-cols-3 gap-4 pt-8 border-t border-zinc-800">
          <div className="text-center">
            <div className="text-2xl mb-2">📂</div>
            <p className="text-zinc-400 text-sm">View Playlists</p>
          </div>
          <div className="text-center">
            <div className="text-2xl mb-2">✏️</div>
            <p className="text-zinc-400 text-sm">Edit Tracks</p>
          </div>
          <div className="text-center">
            <div className="text-2xl mb-2">💾</div>
            <p className="text-zinc-400 text-sm">Save to USB</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function LoadingSpinner() {
  return (
    <svg
      className="animate-spin h-5 w-5"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  );
}

function USBIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      className="h-6 w-6"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 18v-6m0 0V6m0 6h6m-6 0H6"
      />
      <rect x="4" y="4" width="16" height="16" rx="2" />
    </svg>
  );
}
