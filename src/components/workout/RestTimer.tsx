import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Timer, Play, Pause, RotateCcw, Plus, Minus, X, Volume2, Bell, Check, Sparkles, ChevronDown } from 'lucide-react';
import { cn } from '../../lib/utils';
import { Button } from '../ui/Button';

interface RestTimerProps {
  restRemaining: number | null; // seconds remaining, or null if inactive
  defaultDuration?: number; // e.g. 120
  onStartRest: (seconds: number) => void;
  onAdjustTime: (deltaSeconds: number) => void;
  onTogglePause?: () => void;
  onSkipRest: () => void;
  onDefaultDurationChange?: (seconds: number) => void;
  className?: string;
  isPaused?: boolean;
}

const PRESET_DURATIONS = [
  { label: '30s', value: 30 },
  { label: '60s', value: 60 },
  { label: '90s', value: 90 },
  { label: '2:00', value: 120 },
  { label: '3:00', value: 180 },
  { label: '5:00', value: 300 }
];

export function RestTimer({
  restRemaining,
  defaultDuration = 120,
  onStartRest,
  onAdjustTime,
  onTogglePause,
  onSkipRest,
  onDefaultDurationChange,
  className,
  isPaused = false
}: RestTimerProps) {
  const [showDurationPicker, setShowDurationPicker] = useState(false);
  const isRunning = restRemaining !== null && restRemaining > 0;
  const isFinished = restRemaining === 0;

  const formatSeconds = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const displayTime = isRunning 
    ? formatSeconds(restRemaining || 0) 
    : isFinished 
    ? '00:00' 
    : formatSeconds(defaultDuration);

  // Audio & Notification sound when timer completes
  const audioPlayedRef = useRef(false);
  useEffect(() => {
    if (isFinished && !audioPlayedRef.current) {
      audioPlayedRef.current = true;
      try {
        const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
        const playChime = (offset: number) => {
          const osc = audioCtx.createOscillator();
          const gainNode = audioCtx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(880, audioCtx.currentTime + offset);
          osc.frequency.exponentialRampToValueAtTime(440, audioCtx.currentTime + offset + 0.25);
          gainNode.gain.setValueAtTime(0.4, audioCtx.currentTime + offset);
          gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + offset + 0.25);
          osc.connect(gainNode);
          gainNode.connect(audioCtx.destination);
          osc.start(audioCtx.currentTime + offset);
          osc.stop(audioCtx.currentTime + offset + 0.25);
        };
        playChime(0);
        playChime(0.25);
        playChime(0.5);
      } catch (e) {
        // silent audioContext fallback
      }

      if ('vibrate' in navigator) {
        navigator.vibrate([250, 100, 250]);
      }
    } else if (!isFinished) {
      audioPlayedRef.current = false;
    }
  }, [isFinished]);

  // Percentage calculation for progress bar
  const progressPercent = isRunning && defaultDuration > 0
    ? Math.max(0, Math.min(100, ((defaultDuration - (restRemaining || 0)) / defaultDuration) * 100))
    : isFinished ? 100 : 0;

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-2xl border transition-all select-none shadow-sm",
        isFinished
          ? "bg-rose-500/15 border-rose-500/50 text-rose-600 dark:text-rose-400 shadow-[0_0_20px_rgba(244,63,94,0.3)] animate-pulse"
          : isRunning
          ? "bg-primary/10 border-primary/40 text-foreground"
          : "bg-secondary/40 border-border/70 text-muted-foreground",
        className
      )}
    >
      {/* Background visual progress bar while running */}
      {isRunning && (
        <div 
          className="absolute inset-y-0 left-0 bg-primary/15 transition-all duration-1000 ease-linear pointer-events-none"
          style={{ width: `${progressPercent}%` }}
        />
      )}

      <div className="relative p-2.5 sm:p-3 flex items-center justify-between gap-3">
        {/* Left: Timer display & Preset Duration Trigger */}
        <div className="flex items-center gap-2.5">
          <div 
            onClick={() => {
              if (!isRunning && !isFinished) {
                onStartRest(defaultDuration);
              }
            }}
            className={cn(
              "flex items-center justify-center h-9 w-9 rounded-xl border transition-all cursor-pointer",
              isFinished
                ? "bg-rose-600 text-white border-rose-500"
                : isRunning
                ? "bg-primary text-primary-foreground border-primary shadow-xs"
                : "bg-background border-border text-foreground hover:border-primary/50"
            )}
            title={isRunning ? "Resting..." : "Start Rest Timer"}
          >
            <Timer size={18} className={isRunning && !isPaused ? "animate-pulse" : ""} />
          </div>

          <div>
            <div className="flex items-center gap-1.5">
              <span 
                className={cn(
                  "font-mono font-black tracking-tight text-base sm:text-lg",
                  isFinished ? "text-rose-600 dark:text-rose-400" : isRunning ? "text-primary font-bold" : "text-foreground"
                )}
              >
                {displayTime}
              </span>

              {isFinished && (
                <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-rose-600 text-white animate-bounce">
                  Time's Up!
                </span>
              )}

              {isRunning && isPaused && (
                <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-500 text-white">
                  Paused
                </span>
              )}
            </div>

            {/* Sub-label: Default duration selector */}
            <div className="relative">
              <button
                onClick={() => setShowDurationPicker(!showDurationPicker)}
                className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground hover:text-foreground transition-colors -mt-0.5"
              >
                <span>Rest Target: <strong className="text-foreground">{formatSeconds(defaultDuration)}</strong></span>
                <ChevronDown size={11} className={showDurationPicker ? "rotate-180 transition-transform" : "transition-transform"} />
              </button>

              {/* Preset Selector Dropdown */}
              <AnimatePresence>
                {showDurationPicker && (
                  <motion.div
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 5 }}
                    className="absolute left-0 top-full mt-1.5 z-50 bg-card border border-border rounded-xl p-1.5 shadow-xl flex items-center gap-1 backdrop-blur-md"
                  >
                    {PRESET_DURATIONS.map((preset) => (
                      <button
                        key={preset.value}
                        onClick={() => {
                          if (onDefaultDurationChange) {
                            onDefaultDurationChange(preset.value);
                          }
                          if (isRunning) {
                            onStartRest(preset.value);
                          }
                          setShowDurationPicker(false);
                        }}
                        className={cn(
                          "px-2 py-1 rounded-lg text-xs font-bold font-mono transition-colors",
                          defaultDuration === preset.value
                            ? "bg-primary text-primary-foreground"
                            : "bg-secondary/60 hover:bg-secondary text-foreground"
                        )}
                      >
                        {preset.label}
                      </button>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>

        {/* Right: Quick Action Controls */}
        <div className="flex items-center gap-1 sm:gap-1.5">
          {isRunning ? (
            <>
              {/* -30s */}
              <button
                onClick={() => onAdjustTime(-30)}
                className="h-8 px-2 rounded-lg bg-background/80 hover:bg-background border border-border/70 text-xs font-mono font-bold text-foreground transition-colors"
                title="Minus 30 seconds"
              >
                -30s
              </button>

              {/* +30s */}
              <button
                onClick={() => onAdjustTime(30)}
                className="h-8 px-2 rounded-lg bg-background/80 hover:bg-background border border-border/70 text-xs font-mono font-bold text-foreground transition-colors"
                title="Plus 30 seconds"
              >
                +30s
              </button>

              {/* Pause / Play */}
              {onTogglePause && (
                <button
                  onClick={onTogglePause}
                  className="h-8 w-8 rounded-lg bg-background/80 hover:bg-background border border-border/70 flex items-center justify-center text-foreground transition-colors"
                  title={isPaused ? "Resume Timer" : "Pause Timer"}
                >
                  {isPaused ? <Play size={13} fill="currentColor" /> : <Pause size={13} fill="currentColor" />}
                </button>
              )}

              {/* Skip / Close */}
              <button
                onClick={onSkipRest}
                className="h-8 px-2.5 rounded-lg bg-background/80 hover:bg-destructive/10 hover:text-destructive border border-border/70 text-xs font-bold text-muted-foreground transition-colors"
                title="Skip Rest Timer"
              >
                Skip
              </button>
            </>
          ) : isFinished ? (
            <Button
              size="sm"
              onClick={onSkipRest}
              className="h-8 text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white"
            >
              Dismiss
            </Button>
          ) : (
            <div className="flex items-center gap-1.5">
              <Button
                variant="outline"
                size="sm"
                onClick={() => onStartRest(defaultDuration)}
                className="h-8 text-xs font-bold gap-1 border-primary/30 text-primary hover:bg-primary/10"
              >
                <Play size={11} fill="currentColor" />
                Start Rest
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
