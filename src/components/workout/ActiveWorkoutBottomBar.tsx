import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useWorkoutStore } from '../../store/useWorkoutStore';
import { useAuthStore } from '../../store/useAuthStore';
import { mutateWorkout } from '../../lib/api';
import { Button } from '../ui/Button';
import { 
  Play, 
  Dumbbell, 
  Timer, 
  X, 
  CheckCircle2, 
  Clock, 
  Flame, 
  ChevronUp, 
  AlertTriangle,
  RotateCcw,
  Square
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { useNavigate, useLocation } from 'react-router-dom';

export function ActiveWorkoutBottomBar() {
  const { 
    activeWorkout, 
    isModalOpen, 
    startedAt, 
    restEndTime,
    openWorkoutModal, 
    discardWorkout, 
    finishWorkout,
    clearRestTimer,
    setLastSyncedAt,
    updateActiveWorkout
  } = useWorkoutStore();
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();

  const [elapsed, setElapsed] = useState(0);
  const [restRemaining, setRestRemaining] = useState(0);
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);

  // Live workout timer tick
  useEffect(() => {
    if (!activeWorkout || !startedAt) {
      setElapsed(0);
      return;
    }

    const updateTimer = () => {
      const currentSeconds = Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
      setElapsed(currentSeconds);
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [activeWorkout, startedAt]);

  // Live rest timer tick
  useEffect(() => {
    if (!restEndTime) {
      setRestRemaining(0);
      return;
    }

    const updateRest = () => {
      const diff = Math.max(0, Math.ceil((restEndTime - Date.now()) / 1000));
      setRestRemaining(diff);
      if (diff === 0) {
        clearRestTimer();
      }
    };

    updateRest();
    const interval = setInterval(updateRest, 1000);
    return () => clearInterval(interval);
  }, [restEndTime, clearRestTimer]);

  // Background auto-sync to Firestore every 45s
  useEffect(() => {
    if (!activeWorkout || !user) return;

    const syncInterval = setInterval(async () => {
      try {
        const updated = await mutateWorkout(
          activeWorkout.id,
          activeWorkout.version || 1,
          {
            title: activeWorkout.title,
            scheduledDate: activeWorkout.scheduledDate,
            status: activeWorkout.status,
            sets: activeWorkout.sets
          },
          elapsed,
          activeWorkout.volume
        );
        if (updated) {
          updateActiveWorkout(updated);
        }
        setLastSyncedAt(Date.now());
      } catch (err) {
        console.warn("Background workout auto-sync failed:", err);
      }
    }, 45000);

    return () => clearInterval(syncInterval);
  }, [activeWorkout, user, elapsed, setLastSyncedAt, updateActiveWorkout]);

  const formatTime = (totalSeconds: number) => {
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = totalSeconds % 60;
    if (h > 0) {
      return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    }
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  // Progress metrics
  const sets = activeWorkout?.sets || [];
  const totalSets = sets.length;
  const completedSets = sets.filter(s => s.completed).length;
  const progressPercent = totalSets > 0 ? Math.round((completedSets / totalSets) * 100) : 0;

  // Find currently active exercise (first with an incomplete set or the last completed)
  const currentIncompleteSet = sets.find(s => !s.completed);
  const currentExerciseName = currentIncompleteSet?.exercise || sets[sets.length - 1]?.exercise || 'Active Session';
  
  // Unique exercises count
  const uniqueExercises = Array.from(new Set(sets.map(s => s.exercise)));
  const currentExerciseIndex = uniqueExercises.indexOf(currentExerciseName) + 1;
  const totalExercisesCount = uniqueExercises.length;

  const handleResume = () => {
    openWorkoutModal();
  };

  const handleConfirmDiscard = () => {
    discardWorkout();
    setShowDiscardConfirm(false);
  };

  // If there's no active workout or the modal is currently open full-screen, hide mini bar
  if (!activeWorkout || isModalOpen) {
    return null;
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ y: 80, opacity: 0, scale: 0.96 }}
        animate={{ y: 0, opacity: 1, scale: 1 }}
        exit={{ y: 80, opacity: 0, scale: 0.96 }}
        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
        className="fixed z-40 left-3 right-3 bottom-[72px] md:bottom-5 md:left-auto md:right-6 md:w-[460px] max-w-full"
      >
        <div className="relative overflow-hidden rounded-2xl border border-primary/40 bg-card/95 text-card-foreground shadow-2xl backdrop-blur-xl transition-all">
          {/* Top subtle progress bar */}
          <div className="absolute top-0 left-0 right-0 h-1 bg-secondary/80">
            <div 
              className="h-full bg-gradient-to-r from-primary via-emerald-500 to-primary transition-all duration-300 ease-out"
              style={{ width: `${progressPercent}%` }}
            />
          </div>

          <div className="p-3.5 sm:p-4">
            <div className="flex items-center justify-between gap-3">
              {/* Left Workout Info & Icon */}
              <div 
                onClick={handleResume}
                className="flex items-center gap-3 min-w-0 flex-1 cursor-pointer group"
              >
                <div className="relative shrink-0 flex items-center justify-center h-10 w-10 rounded-xl bg-primary/10 text-primary border border-primary/20 group-hover:scale-105 group-hover:bg-primary group-hover:text-primary-foreground transition-all">
                  <Dumbbell size={18} className="animate-pulse" />
                  <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
                  </span>
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h4 className="text-xs sm:text-sm font-bold truncate text-foreground group-hover:text-primary transition-colors">
                      {activeWorkout.title || 'Workout Session'}
                    </h4>
                  </div>

                  <div className="flex items-center gap-2 text-[11px] text-muted-foreground mt-0.5">
                    {/* Live Timer */}
                    <span className="font-mono font-bold text-foreground flex items-center gap-1">
                      <Clock size={11} className="text-primary" />
                      {formatTime(elapsed)}
                    </span>
                    <span>•</span>
                    {/* Progress / Exercise info */}
                    <span className="truncate">
                      {totalExercisesCount > 0 && `Ex ${currentExerciseIndex > 0 ? currentExerciseIndex : 1}/${totalExercisesCount} • `}
                      {completedSets}/{totalSets} sets ({progressPercent}%)
                    </span>
                  </div>
                </div>
              </div>

              {/* Right: Rest Timer & Action Controls */}
              <div className="flex items-center gap-1.5 shrink-0">
                {/* Rest Countdown Pill if active */}
                {restRemaining > 0 && (
                  <div className="hidden sm:flex items-center gap-1 px-2 py-1 rounded-lg bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30 text-[10px] font-mono font-bold animate-pulse">
                    <Timer size={11} />
                    <span>{restRemaining}s</span>
                  </div>
                )}

                {/* Resume Button */}
                <Button
                  size="sm"
                  onClick={handleResume}
                  className="h-8 sm:h-9 px-3 sm:px-3.5 text-xs font-bold gap-1.5 shadow-sm"
                >
                  <Play size={12} fill="currentColor" />
                  <span>Resume</span>
                </Button>

                {/* Stop / Discard Button */}
                <button
                  onClick={() => setShowDiscardConfirm(true)}
                  title="End or Discard Session"
                  className="h-8 w-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            {/* Current exercise detail snippet */}
            <div className="mt-2 pt-2 border-t border-border/40 flex items-center justify-between text-[11px] text-muted-foreground">
              <span className="truncate pr-2">
                <span className="font-medium text-foreground">Next:</span> {currentExerciseName}
              </span>
              <span className="font-mono text-[10px] text-primary/80 font-bold shrink-0">
                LIVE
              </span>
            </div>
          </div>
        </div>

        {/* Discard Confirmation Dialog */}
        {showDiscardConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
            <motion.div
              initial={{ scale: 0.92, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="bg-card border border-border/80 rounded-2xl p-5 max-w-sm w-full shadow-2xl space-y-4 text-card-foreground"
            >
              <div className="flex items-center gap-3 text-destructive">
                <div className="p-2 rounded-xl bg-destructive/10">
                  <AlertTriangle size={22} />
                </div>
                <div>
                  <h3 className="font-bold text-base text-foreground">End Active Workout?</h3>
                  <p className="text-xs text-muted-foreground">
                    This will cancel your current background session.
                  </p>
                </div>
              </div>

              <div className="text-xs text-muted-foreground bg-secondary/30 p-3 rounded-lg border border-border/40">
                Workout: <strong className="text-foreground">{activeWorkout.title}</strong>
                <br />
                Elapsed: <span className="font-mono text-foreground">{formatTime(elapsed)}</span> ({completedSets}/{totalSets} sets completed)
              </div>

              <div className="flex gap-2 justify-end pt-1">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowDiscardConfirm(false)}
                >
                  Keep Running
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={handleConfirmDiscard}
                >
                  End & Discard
                </Button>
              </div>
            </motion.div>
          </div>
        )}
      </motion.div>
    </AnimatePresence>
  );
}
