import { useState, useRef, useEffect, useCallback } from 'react';
import type { Track } from '../types/rekordbox';

interface AudioPlayerProps {
  track: Track | null;
  audioUrl: string | null;
  onNext?: () => void;
  onPrevious?: () => void;
}

type WaveformMode = 'waveform' | 'spectrum';

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
  const [waveformMode, setWaveformMode] = useState<WaveformMode>('waveform');
  const [fullWaveform, setFullWaveform] = useState<number[]>([]);
  const [isLoadingWaveform, setIsLoadingWaveform] = useState(false);
  const [spectrumData, setSpectrumData] = useState<number[]>([]);

  // Generate full waveform from audio file
  const generateFullWaveform = useCallback(async (url: string) => {
    setIsLoadingWaveform(true);
    try {
      const response = await fetch(url);
      const arrayBuffer = await response.arrayBuffer();

      const offlineContext = new (window.OfflineAudioContext || (window as unknown as { webkitOfflineAudioContext: typeof OfflineAudioContext }).webkitOfflineAudioContext)(1, 2, 44100);
      const audioBuffer = await offlineContext.decodeAudioData(arrayBuffer);

      const rawData = audioBuffer.getChannelData(0);
      const samples = 200;
      const blockSize = Math.floor(rawData.length / samples);
      const waveformData: number[] = [];

      for (let i = 0; i < samples; i++) {
        const start = blockSize * i;
        let sum = 0;
        for (let j = 0; j < blockSize; j++) {
          sum += Math.abs(rawData[start + j] || 0);
        }
        const avg = sum / blockSize;
        const normalized = Math.pow(avg, 0.7);
        waveformData.push(normalized);
      }

      const max = Math.max(...waveformData, 0.01);
      const normalized = waveformData.map(v => v / max);

      setFullWaveform(normalized);
    } catch (err) {
      console.error('Failed to generate waveform:', err);
      setFullWaveform([]);
    } finally {
      setIsLoadingWaveform(false);
    }
  }, []);

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

  // Draw full waveform
  const drawFullWaveform = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    const progress = duration > 0 ? currentTime / duration : 0;
    const progressWidth = width * progress;

    ctx.fillStyle = '#09090b';
    ctx.fillRect(0, 0, width, height);

    if (fullWaveform.length === 0) {
      if (isLoadingWaveform) {
        ctx.fillStyle = '#52525b';
        ctx.font = '11px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('Loading waveform...', width / 2, height / 2 + 4);
      } else {
        const barCount = 120;
        const barWidth = width / barCount;
        for (let i = 0; i < barCount; i++) {
          const barHeight = (Math.sin(i * 0.2) * 0.2 + 0.3) * height;
          const x = i * barWidth;
          const y = (height - barHeight) / 2;

          ctx.fillStyle = x < progressWidth ? '#a855f7' : '#27272a';
          ctx.fillRect(x, y, barWidth - 1, barHeight);
        }
      }
    } else {
      const barWidth = width / fullWaveform.length;
      for (let i = 0; i < fullWaveform.length; i++) {
        const barHeight = fullWaveform[i] * height * 0.9;
        const x = i * barWidth;
        const y = (height - barHeight) / 2;

        if (x < progressWidth) {
          const gradient = ctx.createLinearGradient(0, y, 0, y + barHeight);
          gradient.addColorStop(0, '#c084fc');
          gradient.addColorStop(0.5, '#a855f7');
          gradient.addColorStop(1, '#c084fc');
          ctx.fillStyle = gradient;
        } else {
          ctx.fillStyle = '#3f3f46';
        }
        ctx.fillRect(x, y, Math.max(barWidth - 1, 1), barHeight);
      }
    }

    if (duration > 0) {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(progressWidth - 1, 0, 2, height);
    }
  }, [fullWaveform, currentTime, duration, isLoadingWaveform]);

  // Draw spectrum visualization
  const drawSpectrum = useCallback(() => {
    const canvas = canvasRef.current;
    const analyser = analyserRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    const progress = duration > 0 ? currentTime / duration : 0;
    const progressWidth = width * progress;

    ctx.fillStyle = '#09090b';
    ctx.fillRect(0, 0, width, height);

    if (analyser && isPlaying) {
      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);
      analyser.getByteFrequencyData(dataArray);

      setSpectrumData(Array.from(dataArray).map(v => v / 255));

      const barWidth = width / bufferLength;

      for (let i = 0; i < bufferLength; i++) {
        const barHeight = (dataArray[i] / 255) * height * 0.9;
        const x = i * barWidth;
        const y = height - barHeight;

        if (x < progressWidth) {
          const gradient = ctx.createLinearGradient(0, y, 0, height);
          gradient.addColorStop(0, '#a855f7');
          gradient.addColorStop(1, '#7c3aed');
          ctx.fillStyle = gradient;
        } else {
          ctx.fillStyle = '#27272a';
        }

        ctx.fillRect(x, y, barWidth - 1, barHeight);
      }

      animationRef.current = requestAnimationFrame(drawSpectrum);
    } else if (spectrumData.length > 0) {
      const barWidth = width / spectrumData.length;
      for (let i = 0; i < spectrumData.length; i++) {
        const barHeight = spectrumData[i] * height * 0.9;
        const x = i * barWidth;
        const y = height - barHeight;

        ctx.fillStyle = x < progressWidth ? '#a855f7' : '#27272a';
        ctx.fillRect(x, y, barWidth - 1, barHeight);
      }
    }

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(progressWidth - 1, 0, 2, height);
  }, [currentTime, duration, isPlaying, spectrumData]);

  useEffect(() => {
    if (waveformMode === 'spectrum' && isPlaying && analyserRef.current) {
      drawSpectrum();
    } else if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
    }

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [waveformMode, isPlaying, drawSpectrum]);

  useEffect(() => {
    if (waveformMode === 'waveform') {
      drawFullWaveform();
    } else if (!isPlaying) {
      drawSpectrum();
    }
  }, [waveformMode, currentTime, duration, drawFullWaveform, drawSpectrum, isPlaying]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = volume;
    }
  }, [volume]);

  useEffect(() => {
    if (audioUrl && audioRef.current) {
      generateFullWaveform(audioUrl);
      setSpectrumData([]);

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
  }, [audioUrl, initAudioContext, generateFullWaveform]);

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
      <div className="h-28 bg-zinc-900/80 backdrop-blur border-t border-zinc-800 flex items-center justify-center text-zinc-600">
        <div className="flex flex-col items-center gap-1">
          <MusicIcon />
          <span className="text-sm">Select a track to play</span>
        </div>
      </div>
    );
  }

  return (
    <div className="h-28 bg-zinc-900/95 backdrop-blur border-t border-zinc-800 flex flex-col">
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

      {/* Waveform Section */}
      <div className="px-4 pt-3 pb-2">
        <div className="relative h-12 bg-zinc-950 rounded-lg overflow-hidden shadow-inner">
          <canvas
            ref={canvasRef}
            width={1200}
            height={48}
            className="w-full h-full cursor-pointer"
            onClick={handleSeek}
          />
          {/* Time overlay */}
          <div className="absolute inset-x-0 bottom-0 flex justify-between px-3 pb-1 pointer-events-none">
            <span className="text-[11px] font-medium text-white/90 tabular-nums drop-shadow">
              {formatTime(currentTime)}
            </span>
            <span className="text-[11px] font-medium text-zinc-400 tabular-nums drop-shadow">
              -{formatTime(Math.max(0, duration - currentTime))}
            </span>
          </div>
        </div>
      </div>

      {/* Controls Section */}
      <div className="flex-1 flex items-center px-4 gap-6">
        {/* Track Info */}
        <div className="w-52 min-w-0 flex items-center gap-3">
          <div className="w-10 h-10 bg-zinc-800 rounded flex items-center justify-center flex-shrink-0">
            <MusicIcon className="w-5 h-5 text-zinc-500" />
          </div>
          <div className="min-w-0">
            <div className="truncate text-white text-sm font-medium leading-tight">
              {track.title || 'Unknown'}
            </div>
            <div className="truncate text-zinc-500 text-xs leading-tight mt-0.5">
              {track.artist || 'Unknown Artist'}
            </div>
          </div>
        </div>

        {/* Playback Controls */}
        <div className="flex items-center gap-1">
          <button
            onClick={onPrevious}
            className="p-2 text-zinc-400 hover:text-white transition-colors rounded-full hover:bg-zinc-800"
            disabled={!onPrevious}
          >
            <PreviousIcon />
          </button>

          <button
            onClick={togglePlay}
            className="p-3 bg-white rounded-full text-black hover:scale-105 hover:bg-zinc-100 transition-all disabled:opacity-50 shadow-lg"
            disabled={!audioUrl}
          >
            {isPlaying ? <PauseIcon /> : <PlayIcon />}
          </button>

          <button
            onClick={onNext}
            className="p-2 text-zinc-400 hover:text-white transition-colors rounded-full hover:bg-zinc-800"
            disabled={!onNext}
          >
            <NextIcon />
          </button>
        </div>

        {/* Waveform mode toggle */}
        <div className="flex items-center bg-zinc-800/50 rounded-lg p-1 gap-0.5">
          <button
            onClick={() => setWaveformMode('waveform')}
            className={`p-1.5 rounded transition-all ${
              waveformMode === 'waveform'
                ? 'bg-purple-600 text-white shadow'
                : 'text-zinc-500 hover:text-zinc-300'
            }`}
            title="Full track waveform"
          >
            <WaveformIcon />
          </button>
          <button
            onClick={() => setWaveformMode('spectrum')}
            className={`p-1.5 rounded transition-all ${
              waveformMode === 'spectrum'
                ? 'bg-purple-600 text-white shadow'
                : 'text-zinc-500 hover:text-zinc-300'
            }`}
            title="Real-time spectrum"
          >
            <SpectrumIcon />
          </button>
        </div>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Volume Control */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setVolume(v => v > 0 ? 0 : 0.8)}
            className="p-1 text-zinc-400 hover:text-white transition-colors"
          >
            <VolumeIcon muted={volume === 0} />
          </button>
          <div className="w-24 flex items-center gap-2">
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={volume}
              onChange={(e) => setVolume(parseFloat(e.target.value))}
              className="flex-1 h-1 bg-zinc-700 rounded-full appearance-none cursor-pointer accent-purple-500 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:shadow [&::-webkit-slider-thumb]:hover:scale-110 [&::-webkit-slider-thumb]:transition-transform"
            />
            <span className="text-xs text-zinc-500 w-7 text-right tabular-nums">{volumePercent}%</span>
          </div>
        </div>

        {/* Track Info Tags */}
        <div className="flex items-center gap-2">
          {track.tempo > 0 && (
            <span className="bg-zinc-800/80 text-zinc-300 text-xs px-2.5 py-1 rounded-full font-medium">
              {(track.tempo / 100).toFixed(1)} BPM
            </span>
          )}
          {track.key && (
            <span className="bg-purple-900/50 text-purple-300 text-xs px-2.5 py-1 rounded-full font-medium">
              {track.key}
            </span>
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
      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
        <path d="M9.547 3.062A.75.75 0 0110 3.75v12.5a.75.75 0 01-1.264.546L4.703 13H3.167a.75.75 0 01-.7-.48A6.985 6.985 0 012 10c0-.887.165-1.737.468-2.52a.75.75 0 01.7-.48h1.535l4.033-3.796a.75.75 0 01.811-.142zM13.28 6.22a.75.75 0 111.06 1.06L12.81 8.81l1.53 1.53a.75.75 0 01-1.06 1.06l-1.53-1.53-1.53 1.53a.75.75 0 11-1.06-1.06l1.53-1.53-1.53-1.53a.75.75 0 011.06-1.06l1.53 1.53 1.53-1.53z" />
      </svg>
    );
  }
  return (
    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
      <path d="M10 3.75a.75.75 0 00-1.264-.546L4.703 7H3.167a.75.75 0 00-.7.48A6.985 6.985 0 002 10c0 .887.165 1.737.468 2.52.111.29.39.48.7.48h1.535l4.033 3.796A.75.75 0 0010 16.25V3.75zM15.95 5.05a.75.75 0 00-1.06 1.061 5.5 5.5 0 010 7.778.75.75 0 001.06 1.06 7 7 0 000-9.899z" />
      <path d="M13.829 7.172a.75.75 0 00-1.061 1.06 2.5 2.5 0 010 3.536.75.75 0 001.06 1.06 4 4 0 000-5.656z" />
    </svg>
  );
}

function WaveformIcon() {
  return (
    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
      <path d="M3 12h2v4H3v-4zm4-6h2v16H7V6zm4-2h2v20h-2V4zm4 4h2v12h-2V8zm4 2h2v8h-2v-8z" />
    </svg>
  );
}

function SpectrumIcon() {
  return (
    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
      <path d="M3 17h2v4H3v-4zm4-5h2v9H7v-9zm4-4h2v13h-2V8zm4 2h2v11h-2V10zm4-6h2v17h-2V4z" />
    </svg>
  );
}

function MusicIcon({ className = "w-6 h-6" }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 9l10.5-3m0 6.553v3.75a2.25 2.25 0 01-1.632 2.163l-1.32.377a1.803 1.803 0 11-.99-3.467l2.31-.66a2.25 2.25 0 001.632-2.163zm0 0V4.5l-10.5 3v9.75m0 0a2.25 2.25 0 01-1.632 2.163l-1.32.377a1.803 1.803 0 11-.99-3.467l2.31-.66A2.25 2.25 0 009 17.25z" />
    </svg>
  );
}
