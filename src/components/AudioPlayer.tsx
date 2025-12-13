import { useState, useRef, useEffect, useCallback } from 'react';
import type { Track } from '../types/rekordbox';

interface AudioPlayerProps {
  track: Track | null;
  audioUrl: string | null;
  onNext?: () => void;
  onPrevious?: () => void;
}

export function AudioPlayer({ track, audioUrl, onNext, onPrevious }: AudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const animationRef = useRef<number | null>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.8);
  const [waveformData, setWaveformData] = useState<number[]>([]);

  // Initialize audio context and analyzer
  const initAudioContext = useCallback(() => {
    if (!audioRef.current || audioContextRef.current) return;

    const audioContext = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.8;

    const source = audioContext.createMediaElementSource(audioRef.current);
    source.connect(analyser);
    analyser.connect(audioContext.destination);

    audioContextRef.current = audioContext;
    analyserRef.current = analyser;
    sourceRef.current = source;
  }, []);

  // Draw waveform visualization
  const drawWaveform = useCallback(() => {
    const canvas = canvasRef.current;
    const analyser = analyserRef.current;
    if (!canvas || !analyser) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    analyser.getByteFrequencyData(dataArray);

    // Store waveform data for static display
    const normalizedData = Array.from(dataArray).map(v => v / 255);
    setWaveformData(normalizedData);

    const width = canvas.width;
    const height = canvas.height;
    const barWidth = width / bufferLength;

    ctx.fillStyle = '#18181b';
    ctx.fillRect(0, 0, width, height);

    // Draw progress background
    const progress = duration > 0 ? currentTime / duration : 0;
    const progressWidth = width * progress;

    // Draw bars
    for (let i = 0; i < bufferLength; i++) {
      const barHeight = (dataArray[i] / 255) * height * 0.9;
      const x = i * barWidth;
      const y = height - barHeight;

      // Played portion in purple
      if (x < progressWidth) {
        const gradient = ctx.createLinearGradient(0, y, 0, height);
        gradient.addColorStop(0, '#a855f7');
        gradient.addColorStop(1, '#7c3aed');
        ctx.fillStyle = gradient;
      } else {
        ctx.fillStyle = '#3f3f46';
      }

      ctx.fillRect(x, y, barWidth - 1, barHeight);
    }

    // Draw playhead line
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(progressWidth - 1, 0, 2, height);

    if (isPlaying) {
      animationRef.current = requestAnimationFrame(drawWaveform);
    }
  }, [currentTime, duration, isPlaying]);

  // Start/stop animation based on playing state
  useEffect(() => {
    if (isPlaying && analyserRef.current) {
      drawWaveform();
    } else if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
    }

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [isPlaying, drawWaveform]);

  // Draw static waveform when paused
  useEffect(() => {
    if (!isPlaying && canvasRef.current) {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const width = canvas.width;
      const height = canvas.height;
      const progress = duration > 0 ? currentTime / duration : 0;
      const progressWidth = width * progress;

      ctx.fillStyle = '#18181b';
      ctx.fillRect(0, 0, width, height);

      // Draw static bars from stored data
      if (waveformData.length > 0) {
        const barWidth = width / waveformData.length;
        for (let i = 0; i < waveformData.length; i++) {
          const barHeight = waveformData[i] * height * 0.9;
          const x = i * barWidth;
          const y = height - barHeight;

          if (x < progressWidth) {
            const gradient = ctx.createLinearGradient(0, y, 0, height);
            gradient.addColorStop(0, '#a855f7');
            gradient.addColorStop(1, '#7c3aed');
            ctx.fillStyle = gradient;
          } else {
            ctx.fillStyle = '#3f3f46';
          }

          ctx.fillRect(x, y, barWidth - 1, barHeight);
        }
      } else {
        // Draw placeholder bars
        const barCount = 64;
        const barWidth = width / barCount;
        for (let i = 0; i < barCount; i++) {
          const barHeight = (Math.sin(i * 0.3) * 0.3 + 0.4) * height;
          const x = i * barWidth;
          const y = height - barHeight;

          if (x < progressWidth) {
            ctx.fillStyle = '#a855f7';
          } else {
            ctx.fillStyle = '#3f3f46';
          }
          ctx.fillRect(x, y, barWidth - 1, barHeight);
        }
      }

      // Draw playhead
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(progressWidth - 1, 0, 2, height);
    }
  }, [isPlaying, currentTime, duration, waveformData]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = volume;
    }
  }, [volume]);

  useEffect(() => {
    // When audio URL changes, reset and play
    if (audioUrl && audioRef.current) {
      // Initialize audio context on first interaction
      if (!audioContextRef.current) {
        initAudioContext();
      }

      if (audioContextRef.current?.state === 'suspended') {
        audioContextRef.current.resume();
      }

      audioRef.current.load();
      audioRef.current.play().then(() => {
        setIsPlaying(true);
      }).catch(console.error);
    }
  }, [audioUrl, initAudioContext]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
    };
  }, []);

  const togglePlay = () => {
    if (!audioRef.current || !audioUrl) return;

    // Initialize audio context if not done
    if (!audioContextRef.current) {
      initAudioContext();
    }

    if (audioContextRef.current?.state === 'suspended') {
      audioContextRef.current.resume();
    }

    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.play().then(() => {
        setIsPlaying(true);
      }).catch(console.error);
    }
  };

  const handleTimeUpdate = () => {
    if (audioRef.current) {
      setCurrentTime(audioRef.current.currentTime);
    }
  };

  const handleLoadedMetadata = () => {
    if (audioRef.current) {
      setDuration(audioRef.current.duration);
      // Reset waveform data for new track
      setWaveformData([]);
    }
  };

  const handleSeek = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas || !audioRef.current || !duration) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const progress = x / rect.width;
    const time = progress * duration;

    audioRef.current.currentTime = time;
    setCurrentTime(time);
  };

  const handleEnded = () => {
    setIsPlaying(false);
    if (onNext) onNext();
  };

  const formatTime = (seconds: number) => {
    if (isNaN(seconds)) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const volumePercent = Math.round(volume * 100);

  if (!track) {
    return (
      <div className="h-24 bg-zinc-900 border-t border-zinc-800 flex items-center justify-center text-zinc-500">
        Select a track to play
      </div>
    );
  }

  return (
    <div className="h-24 bg-zinc-900 border-t border-zinc-800 flex flex-col">
      {/* Waveform */}
      <div className="h-10 px-4 pt-2">
        <div className="relative h-full bg-zinc-950 rounded overflow-hidden">
          <canvas
            ref={canvasRef}
            width={800}
            height={40}
            className="w-full h-full cursor-pointer"
            onClick={handleSeek}
          />
          {/* Time markers */}
          <div className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-white font-mono bg-zinc-950/80 px-1 rounded">
            {formatTime(currentTime)}
          </div>
          <div className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-zinc-400 font-mono bg-zinc-950/80 px-1 rounded">
            {formatTime(duration)}
          </div>
        </div>
      </div>

      {/* Controls */}
      <div className="flex-1 flex items-center px-4 gap-4">
        {/* Hidden audio element */}
        <audio
          ref={audioRef}
          src={audioUrl || undefined}
          onTimeUpdate={handleTimeUpdate}
          onLoadedMetadata={handleLoadedMetadata}
          onEnded={handleEnded}
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
          crossOrigin="anonymous"
        />

        {/* Track Info */}
        <div className="w-48 min-w-0">
          <div className="truncate text-white text-sm font-medium">{track.title || 'Unknown'}</div>
          <div className="truncate text-zinc-400 text-xs">{track.artist || 'Unknown Artist'}</div>
        </div>

        {/* Playback Controls */}
        <div className="flex items-center gap-2">
          <button
            onClick={onPrevious}
            className="p-2 text-zinc-400 hover:text-white transition-colors"
            disabled={!onPrevious}
          >
            <PreviousIcon />
          </button>

          <button
            onClick={togglePlay}
            className="p-3 bg-white rounded-full text-black hover:scale-105 transition-transform disabled:opacity-50"
            disabled={!audioUrl}
          >
            {isPlaying ? <PauseIcon /> : <PlayIcon />}
          </button>

          <button
            onClick={onNext}
            className="p-2 text-zinc-400 hover:text-white transition-colors"
            disabled={!onNext}
          >
            <NextIcon />
          </button>
        </div>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Volume with indicator */}
        <div className="flex items-center gap-2 w-36">
          <VolumeIcon muted={volume === 0} />
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={volume}
            onChange={(e) => setVolume(parseFloat(e.target.value))}
            className="flex-1 h-1 bg-zinc-700 rounded-lg appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-2 [&::-webkit-slider-thumb]:h-2 [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:rounded-full"
          />
          <span className="text-xs text-zinc-400 w-8 text-right">{volumePercent}%</span>
        </div>

        {/* BPM/Key Info */}
        <div className="flex items-center gap-2 text-xs text-zinc-400">
          {track.tempo > 0 && (
            <span className="bg-zinc-800 px-2 py-1 rounded">{(track.tempo / 100).toFixed(1)} BPM</span>
          )}
          {track.key && (
            <span className="bg-zinc-800 px-2 py-1 rounded">{track.key}</span>
          )}
        </div>
      </div>
    </div>
  );
}

function PlayIcon() {
  return (
    <svg className="w-5 h-5 ml-0.5" fill="currentColor" viewBox="0 0 20 20">
      <path d="M6.3 2.841A1.5 1.5 0 004 4.11V15.89a1.5 1.5 0 002.3 1.269l9.344-5.89a1.5 1.5 0 000-2.538L6.3 2.84z" />
    </svg>
  );
}

function PauseIcon() {
  return (
    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
      <path d="M5.75 3a.75.75 0 00-.75.75v12.5c0 .414.336.75.75.75h1.5a.75.75 0 00.75-.75V3.75A.75.75 0 007.25 3h-1.5zM12.75 3a.75.75 0 00-.75.75v12.5c0 .414.336.75.75.75h1.5a.75.75 0 00.75-.75V3.75a.75.75 0 00-.75-.75h-1.5z" />
    </svg>
  );
}

function PreviousIcon() {
  return (
    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
      <path d="M4.75 3a.75.75 0 00-.75.75v12.5c0 .414.336.75.75.75h.5a.75.75 0 00.75-.75V3.75A.75.75 0 005.25 3h-.5zM13.7 2.841a1.5 1.5 0 012.3 1.269v11.78a1.5 1.5 0 01-2.3 1.269L4.356 11.27a1.5 1.5 0 010-2.538L13.7 2.84z" />
    </svg>
  );
}

function NextIcon() {
  return (
    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
      <path d="M15.25 3a.75.75 0 01.75.75v12.5a.75.75 0 01-.75.75h-.5a.75.75 0 01-.75-.75V3.75a.75.75 0 01.75-.75h.5zM6.3 2.841a1.5 1.5 0 00-2.3 1.269v11.78a1.5 1.5 0 002.3 1.269l9.344-5.89a1.5 1.5 0 000-2.538L6.3 2.84z" />
    </svg>
  );
}

function VolumeIcon({ muted }: { muted?: boolean }) {
  if (muted) {
    return (
      <svg className="w-4 h-4 text-zinc-400" fill="currentColor" viewBox="0 0 20 20">
        <path d="M9.547 3.062A.75.75 0 0110 3.75v12.5a.75.75 0 01-1.264.546L4.703 13H3.167a.75.75 0 01-.7-.48A6.985 6.985 0 012 10c0-.887.165-1.737.468-2.52a.75.75 0 01.7-.48h1.535l4.033-3.796a.75.75 0 01.811-.142zM13.28 6.22a.75.75 0 111.06 1.06L12.81 8.81l1.53 1.53a.75.75 0 01-1.06 1.06l-1.53-1.53-1.53 1.53a.75.75 0 11-1.06-1.06l1.53-1.53-1.53-1.53a.75.75 0 011.06-1.06l1.53 1.53 1.53-1.53z" />
      </svg>
    );
  }
  return (
    <svg className="w-4 h-4 text-zinc-400" fill="currentColor" viewBox="0 0 20 20">
      <path d="M10 3.75a.75.75 0 00-1.264-.546L4.703 7H3.167a.75.75 0 00-.7.48A6.985 6.985 0 002 10c0 .887.165 1.737.468 2.52.111.29.39.48.7.48h1.535l4.033 3.796A.75.75 0 0010 16.25V3.75zM15.95 5.05a.75.75 0 00-1.06 1.061 5.5 5.5 0 010 7.778.75.75 0 001.06 1.06 7 7 0 000-9.899z" />
      <path d="M13.829 7.172a.75.75 0 00-1.061 1.06 2.5 2.5 0 010 3.536.75.75 0 001.06 1.06 4 4 0 000-5.656z" />
    </svg>
  );
}
