import React, { useState, useEffect, useMemo } from 'react';
import { useWorkoutStore } from '../../store/useWorkoutStore';
import { useAuthStore } from '../../store/useAuthStore';
import { soundFx } from '../../lib/soundFx';
import { getExerciseById, ExerciseDef } from '../../lib/exercises';
import { Button } from '../ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/Card';
import { 
  Timer, 
  Plus, 
  X, 
  TrendingUp, 
  Minus, 
  TrendingDown, 
  HelpCircle, 
  Target
} from 'lucide-react';
import { getWorkouts } from '../../lib/api';
import { WorkoutExercise, WorkoutSet, Workout, ProgressionReport } from '../../types';
import { analyzeExerciseProgression } from '../../lib/progression';
import ExerciseSelector from './ExerciseSelector';
import { GymSetRow } from './GymSetRow';
import { useWakeLock } from '../../hooks/useWakeLock';
import {
  compareLiveSet,
  currentExerciseVolume,
  volumeDeltaPct,
  getPreviousExerciseSession,
} from '../../lib/sessionCompare';
import { cn } from '../../lib/utils';

export default function ActiveWorkout({
  finishActiveWorkout,
  onWorkoutFinished,
}: {
  finishActiveWorkout: () => Promise<Workout>;
  onWorkoutFinished?: (w: Workout) => void;
}) {
  const { 
    activeWorkout, 
    restEndTime, 
    setRestTimer, 
    clearRestTimer, 
    updateSet, 
    addSet, 
    removeSet, 
    discardWorkout,
    removeExercise, 
    addExercise,
    pendingMutation,
    syncConflict,
    syncError,
    persistenceWarning,
    resolveConflictWithServer,
  } = useWorkoutStore();
  
  const { user } = useAuthStore();
  const [restTimeLeft, setRestTimeLeft] = useState(0);
  const [saving, setSaving] = useState(false);
  const [showSelector, setShowSelector] = useState(false);
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);
  const [exercisePendingRemoval, setExercisePendingRemoval] = useState<{ id: string; name: string } | null>(null);
  const [allUserWorkouts, setAllUserWorkouts] = useState<Workout[]>([]);

  // Keep screen awake while a session is in progress (gym-friendly)
  useWakeLock(Boolean(activeWorkout));

  // Fetch all user workouts to calculate instant deterministic progression
  useEffect(() => {
    if (!user) return;
    getWorkouts(user.uid).then(wList => {
      setAllUserWorkouts(wList);
    });
  }, [user]);

  // Compute deterministic progression reports for all active exercises
  const progressionReports = useMemo(() => {
    const map: Record<string, ProgressionReport> = {};
    if (!activeWorkout || !activeWorkout.exercises) return map;
    
    for (const ex of activeWorkout.exercises) {
      const def = getExerciseById(ex.exerciseId);
      const rep = analyzeExerciseProgression(allUserWorkouts, ex.exerciseId, def?.name);
      map[ex.exerciseId] = rep;
    }
    return map;
  }, [activeWorkout?.exercises, allUserWorkouts]);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    
    const updateTimer = () => {
      if (restEndTime) {
        const remaining = Math.max(0, Math.ceil((restEndTime - Date.now()) / 1000));
        setRestTimeLeft(remaining);
        if (remaining === 0) {
          clearRestTimer();
        }
      } else {
        setRestTimeLeft(0);
      }
    };

    updateTimer();
    interval = setInterval(updateTimer, 1000);
    
    return () => clearInterval(interval);
  }, [restEndTime, clearRestTimer]);

  if (!activeWorkout) return null;

  const handleCompleteSet = (exId: string, setId: string, currentStatus: boolean, weight: number, reps: number) => {
    if (isFinishing) return;
    if (!currentStatus) {
      if (weight < 0 || reps <= 0) {
        alert("Weight cannot be negative and reps must be at least 1.");
        return;
      }
    }
    updateSet(exId, setId, { completed: !currentStatus });
    if (!currentStatus) {
      soundFx.playHeavyLock();
      setRestTimer(90); // default 90s
    }
  };

  const handleApplyNextTarget = (exId: string) => {
    if (isFinishing) return;
    const report = progressionReports[exId];
    if (!report || !report.nextTarget) return;
    
    const target = report.nextTarget;
    const currentEx = activeWorkout.exercises?.find(e => e.id === exId);
    if (!currentEx) return;

    currentEx.sets.forEach(set => {
      if (!set.completed) {
        updateSet(exId, set.id, {
          weight: target.targetWeight,
          reps: target.targetRepsMin || target.targetRepsMax,
          rir: target.suggestedRIR ?? 2
        });
      }
    });
  };

  const isFinishing = pendingMutation?.kind === 'FINISH';

  const handleSaveWorkout = async () => {
    if (!user || isFinishing) return;
    setSaving(true);
    try {
      const authoritative = await finishActiveWorkout();
      onWorkoutFinished?.(authoritative);
    } catch (e: any) {
      console.error(e);
      if (e?.message === 'EMPTY_WORKOUT') {
        alert('Cannot save an empty workout. Complete at least one working set.');
      } else if (e?.message !== 'AUTOSYNC_PENDING' && e?.message !== 'SYNC_CONFLICT') {
        alert('Failed to save workout. Your active session is still safe.');
      }
    } finally {
      setSaving(false);
    }
  };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const handleAddExercise = (def: ExerciseDef) => {
    if (isFinishing) return;
    // Generate progression report for initial target prefill
    const report = analyzeExerciseProgression(allUserWorkouts, def.id, def.name);
    const target = report.nextTarget;

    const newEx: WorkoutExercise = {
      id: crypto.randomUUID(),
      exerciseId: def.id,
      sets: [
        { 
          id: crypto.randomUUID(), 
          weight: target.targetWeight || 0, 
          reps: target.targetRepsMin || 8, 
          rir: target.suggestedRIR ?? 2,
          completed: false 
        }
      ]
    };
    
    addExercise(newEx);
  };

  const getProgressionBadge = (state: ProgressionReport['state'], deltaE1RM: number) => {
    switch (state) {
      case 'PROGRESSING':
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">
            <TrendingUp size={12} /> Progressing {deltaE1RM > 0 ? `(+${deltaE1RM}kg)` : ''}
          </span>
        );
      case 'STALLING':
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30">
            <Minus size={12} /> Stalling
          </span>
        );
      case 'REGRESSING':
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/30">
            <TrendingDown size={12} /> Regressing
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-muted text-muted-foreground border border-border">
            <HelpCircle size={12} /> Insufficient Data
          </span>
        );
    }
  };

  return (
    <div className="space-y-6 pb-24 relative max-w-3xl mx-auto">
      {/* Mobile-first active session header */}
      <div className="sticky top-0 z-20 -mx-4 border-b border-border bg-background/95 px-4 py-2.5 backdrop-blur md:-mx-8 md:px-8">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 className="truncate text-lg font-bold font-display sm:text-xl">
              {activeWorkout.title || activeWorkout.name || 'Workout Session'}
            </h2>
            <div className="text-[11px] text-muted-foreground">Workout in progress</div>
          </div>
          <div className="flex shrink-0 gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowDiscardConfirm(true)}
              disabled={isFinishing}
              className="min-h-10 px-3 text-muted-foreground hover:text-destructive"
            >
              Discard
            </Button>
            <Button
              variant="default"
              size="sm"
              onClick={handleSaveWorkout}
              disabled={saving || isFinishing || Boolean(syncConflict)}
              className="min-h-10 px-4 font-semibold"
            >
              <span className="sm:hidden">{saving || isFinishing ? 'Finishing…' : 'Finish'}</span>
              <span className="hidden sm:inline">{saving || isFinishing ? 'Finishing…' : 'Finish & Save'}</span>
            </Button>
          </div>
        </div>
      </div>

      {persistenceWarning && (
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-300">
          Local recovery is unavailable on this device right now. Keep this session open until storage works again.
        </div>
      )}
      {syncError && !syncConflict && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-muted-foreground">
          Sync pending: {syncError}
        </div>
      )}
      {syncConflict && (
        <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-xs space-y-2">
          <div>Sync conflict — server is at v{syncConflict.currentVersion}. Your local draft is still safe.</div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={resolveConflictWithServer}>Use server version</Button>
            <span className="self-center text-muted-foreground">Keep draft for now to leave autosync blocked.</span>
          </div>
        </div>
      )}

      {/* Contextual rest timer: visible, compact, and thumb-friendly */}
      {restTimeLeft > 0 && (
        <div
          className="sticky top-[61px] z-10 flex items-center justify-between gap-3 rounded-xl border border-primary/30 bg-background/95 p-2.5 shadow-lg shadow-primary/5 backdrop-blur"
          role="status"
          aria-live="polite"
        >
          <div className="flex min-w-0 items-center gap-2">
            <Timer className="shrink-0 text-primary" size={19} />
            <span className="font-mono text-xl font-black tabular-nums text-primary">
              {formatTime(restTimeLeft)}
            </span>
            <span className="hidden text-xs text-muted-foreground sm:inline">Rest</span>
          </div>
          <div className="flex shrink-0 gap-1.5">
            <Button
              size="sm"
              variant="outline"
              className="min-h-10 bg-background/60 px-3 text-xs font-bold"
              onClick={() => setRestTimer(restTimeLeft + 30)}
            >
              +30s
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-10 w-10 p-0"
              onClick={clearRestTimer}
              aria-label="Dismiss rest timer"
            >
              <X size={17}/>
            </Button>
          </div>
        </div>
      )}

      {/* Exercises List */}
      <div className="space-y-6">
        {(activeWorkout.exercises || []).map((ex) => {
          const def = getExerciseById(ex.exerciseId);
          const report = progressionReports[ex.exerciseId];
          const lastPerf = report?.lastPerformance;
          const target = report?.nextTarget;
          const previousSession = getPreviousExerciseSession(
            allUserWorkouts,
            def?.name || ex.name || ex.exerciseId,
            activeWorkout.id
          );
          const currentVolume = currentExerciseVolume(ex.sets);
          const volumeDelta = previousSession
            ? volumeDeltaPct(currentVolume, previousSession.sessionVolume)
            : null;

          return (
            <Card key={ex.id} className="overflow-hidden shadow-xs border-border/80">
              <CardHeader className="bg-secondary/40 pb-3 py-3 px-4 flex flex-row items-center justify-between border-b border-border/60">
                <div className="space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <CardTitle className="text-base font-bold text-foreground">{def?.name || ex.name || ex.exerciseId}</CardTitle>
                  </div>
                  <div className="text-xs text-muted-foreground">{def?.primaryMuscle} • {def?.equipment}</div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-10 w-10 -mr-2 text-muted-foreground hover:text-destructive"
                  disabled={isFinishing}
                  onClick={() => {
                    if (isFinishing) return;
                    setExercisePendingRemoval({
                      id: ex.id,
                      name: def?.name || ex.name || ex.exerciseId,
                    });
                  }}
                  aria-label={`Remove ${def?.name || ex.name || ex.exerciseId}`}
                >
                  <X size={17} />
                </Button>
              </CardHeader>

              <CardContent className="p-0">
                {/* Core loop first: the logger is always the first interactive content. */}
                <div className="p-3 space-y-3">
                  {ex.sets.map((set, setIndex) => {
                    const cmp = compareLiveSet(
                      allUserWorkouts,
                      def?.name || ex.name || ex.exerciseId,
                      setIndex,
                      { weight: set.weight, reps: set.reps, completed: set.completed },
                      activeWorkout.id
                    );
                    return (
                      <GymSetRow
                        key={set.id || setIndex}
                        setNumber={setIndex + 1}
                        set={set}
                        disabled={isFinishing}
                        onChange={(updates) => updateSet(ex.id, set.id, updates)}
                        onComplete={() => handleCompleteSet(ex.id, set.id, set.completed, set.weight, set.reps)}
                        previousLabel={cmp.label}
                        deltaPct={cmp.setDeltaPct}
                      />
                    );
                  })}
                </div>
                
                {/* Add Set Button */}
                <div className="p-3 border-t border-border/40 flex justify-between items-center bg-secondary/5 gap-2">
                  <span className="text-[11px] text-muted-foreground">
                    ±2.5kg · ±1 rep · rest starts on complete
                  </span>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="text-xs text-primary font-semibold border-primary/30 h-10 px-3 touch-manipulation"
                    disabled={isFinishing}
                    onClick={() => {
                      if (isFinishing) return;
                      const lastSet = ex.sets[ex.sets.length - 1];
                      addSet(ex.id, { 
                        id: crypto.randomUUID(), 
                        weight: lastSet ? lastSet.weight : (target?.targetWeight || 0), 
                        reps: lastSet ? lastSet.reps : (target?.targetRepsMin || 8), 
                        rir: lastSet?.rir ?? (target?.suggestedRIR ?? 2),
                        completed: false 
                      });
                    }}
                  >
                    <Plus size={14} className="mr-1" /> Add Set
                  </Button>
                </div>

                {(report || lastPerf || target || previousSession) && (
                  <details className="border-t border-border/40 bg-secondary/10 group">
                    <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-4 py-2.5 text-xs font-bold text-muted-foreground touch-manipulation">
                      <span>Session guidance</span>
                      <span className="text-[10px] font-medium text-muted-foreground/80 group-open:hidden">
                        Optional
                      </span>
                      <span className="hidden text-[10px] font-medium text-muted-foreground/80 group-open:inline">
                        Hide
                      </span>
                    </summary>
                    <div className="space-y-3 border-t border-border/30 px-4 py-3 text-xs">
                      {report && (
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="text-muted-foreground">Progress</span>
                          {getProgressionBadge(report.state, report.deltaE1RM)}
                        </div>
                      )}

                      {lastPerf && (
                        <div className="flex flex-wrap items-center justify-between gap-2 text-muted-foreground">
                          <span>Last performance</span>
                          <span className="font-mono font-medium text-foreground">
                            {lastPerf.weight}kg × {lastPerf.reps}
                            {lastPerf.rir !== undefined ? ` @ RIR ${lastPerf.rir}` : ''}
                          </span>
                        </div>
                      )}

                      {target && (
                        <div className="flex items-center justify-between gap-3 rounded-xl border border-primary/20 bg-primary/5 p-2.5">
                          <div className="flex min-w-0 items-start gap-1.5 text-primary">
                            <Target size={13} className="mt-0.5 shrink-0" />
                            <span>
                              Target <strong>{target.targetWeight}kg</strong> × {target.targetRepsMin}–{target.targetRepsMax}
                              {target.suggestedRIR !== undefined ? ` @ RIR ${target.suggestedRIR}` : ''}
                            </span>
                          </div>
                          <Button
                            size="sm"
                            variant="outline"
                            className="min-h-9 shrink-0 border-primary/30 px-2 text-[10px] font-bold text-primary hover:bg-primary/10"
                            disabled={isFinishing}
                            onClick={() => handleApplyNextTarget(ex.id)}
                          >
                            Apply
                          </Button>
                        </div>
                      )}

                      {previousSession && (
                        <div className="flex flex-wrap items-center justify-between gap-2 text-muted-foreground">
                          <span>
                            Last session volume{' '}
                            <strong className="font-mono text-foreground">
                              {Math.round(previousSession.sessionVolume).toLocaleString()} kg
                            </strong>
                          </span>
                          {volumeDelta !== null && currentVolume > 0 && (
                            <span
                              className={cn(
                                'font-bold px-2 py-0.5 rounded-full border',
                                volumeDelta > 0 && 'bg-emerald-500/15 text-emerald-600 border-emerald-500/30',
                                volumeDelta < 0 && 'bg-amber-500/15 text-amber-600 border-amber-500/30',
                                volumeDelta === 0 && 'bg-secondary text-muted-foreground border-border'
                              )}
                            >
                              {volumeDelta > 0 ? `+${volumeDelta}%` : volumeDelta < 0 ? `${volumeDelta}%` : '='} vs last
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </details>
                )}
              </CardContent>
            </Card>
          );
        })}

        {(activeWorkout.exercises || []).length === 0 && (
          <div className="text-center py-12 text-muted-foreground text-sm border border-dashed border-border rounded-xl bg-secondary/20">
            No exercises added yet. Click "+ Add Exercise" below to start.
          </div>
        )}
      </div>
      
      <Button 
        variant="outline" 
        className="w-full border-dashed py-6 bg-secondary/10 hover:bg-secondary/20 font-semibold text-sm" 
        disabled={isFinishing}
        onClick={() => !isFinishing && setShowSelector(true)}
      >
        <Plus size={16} className="mr-2 text-primary" /> Add Exercise
      </Button>
      
      {exercisePendingRemoval && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-3 backdrop-blur-sm sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-labelledby="remove-exercise-title"
          onClick={() => setExercisePendingRemoval(null)}
        >
          <div
            className="w-full max-w-sm rounded-3xl border border-white/10 bg-[#101012] p-5 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <h3 id="remove-exercise-title" className="text-lg font-black text-white">
              Remove {exercisePendingRemoval.name}?
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-neutral-400">
              Its sets and any progress logged in this active workout will be removed.
            </p>
            <div className="mt-5 space-y-2">
              <Button
                className="min-h-12 w-full font-bold"
                onClick={() => setExercisePendingRemoval(null)}
                autoFocus
              >
                Keep exercise
              </Button>
              <Button
                variant="danger"
                className="min-h-12 w-full font-bold"
                disabled={isFinishing}
                onClick={() => {
                  const target = exercisePendingRemoval;
                  setExercisePendingRemoval(null);
                  removeExercise(target.id);
                }}
              >
                Remove exercise
              </Button>
            </div>
          </div>
        </div>
      )}

      {showDiscardConfirm && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-3 backdrop-blur-sm sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-labelledby="discard-workout-title"
          onClick={() => setShowDiscardConfirm(false)}
        >
          <div
            className="w-full max-w-sm rounded-3xl border border-white/10 bg-[#101012] p-5 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <h3 id="discard-workout-title" className="text-lg font-black text-white">
              Discard this workout?
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-neutral-400">
              Your active session will be removed from this device. This cannot be undone.
            </p>
            <div className="mt-5 space-y-2">
              <Button
                className="min-h-12 w-full font-bold"
                onClick={() => setShowDiscardConfirm(false)}
                autoFocus
              >
                Keep workout
              </Button>
              <Button
                variant="danger"
                className="min-h-12 w-full font-bold"
                disabled={isFinishing}
                onClick={() => {
                  setShowDiscardConfirm(false);
                  discardWorkout();
                }}
              >
                Discard workout
              </Button>
            </div>
          </div>
        </div>
      )}

      {showSelector && (
        <ExerciseSelector 
          onClose={() => setShowSelector(false)} 
          onSelect={handleAddExercise} 
        />
      )}
    </div>
  );
}
