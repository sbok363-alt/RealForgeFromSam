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
import { saveWorkout, mutateWorkout, getWorkouts } from '../../lib/api';
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

export default function ActiveWorkout({ onWorkoutFinished }: { onWorkoutFinished?: (w: Workout) => void }) {
  const { 
    activeWorkout, 
    restEndTime, 
    setRestTimer, 
    clearRestTimer, 
    updateSet, 
    addSet, 
    removeSet, 
    finishWorkout, 
    removeExercise, 
    addExercise 
  } = useWorkoutStore();
  
  const { user } = useAuthStore();
  const [restTimeLeft, setRestTimeLeft] = useState(0);
  const [saving, setSaving] = useState(false);
  const [showSelector, setShowSelector] = useState(false);
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
    if (!currentStatus) {
      if (weight < 0 || reps < 0) {
        alert("Weight and reps cannot be negative.");
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

  const handleSaveWorkout = async () => {
    if (!user) return;
    setSaving(true);
    
    try {
      let totalVolume = 0;
      const currentExercises = activeWorkout.exercises || [];
      const cleanedExercises = currentExercises.map(ex => {
        const completedSets = ex.sets.filter(s => s.completed);
        completedSets.forEach(s => totalVolume += (s.weight * s.reps));
        return { ...ex, sets: completedSets };
      }).filter(ex => ex.sets.length > 0);

      if (cleanedExercises.length === 0) {
        alert("Cannot save an empty workout. Complete at least one set.");
        setSaving(false);
        return;
      }

      const completedWorkout: Workout = {
        ...activeWorkout,
        userId: user.uid,
        title: activeWorkout.title || activeWorkout.name || 'Completed Workout',
        scheduledDate: activeWorkout.scheduledDate || new Date().toISOString().split('T')[0],
        status: 'COMPLETED',
        version: (activeWorkout.version || 0) + 1,
        completedAt: Date.now(),
        exercises: cleanedExercises,
        sets: cleanedExercises.flatMap(e => e.sets.map(s => ({
          id: s.id,
          exercise: e.exerciseId,
          weight: s.weight,
          reps: s.reps,
          rir: s.rir,
          rpe: s.rpe,
          notes: s.notes,
          completed: s.completed
        }))),
        totalVolume
      };
      
      const startedAt = activeWorkout.startedAt || Date.now();
      const duration = Math.max(0, Math.floor((Date.now() - startedAt) / 1000));

      try {
        await mutateWorkout(
          activeWorkout.id,
          activeWorkout.version || 1,
          {
            title: completedWorkout.title,
            scheduledDate: completedWorkout.scheduledDate,
            status: 'COMPLETED',
            sets: completedWorkout.sets,
            exercises: completedWorkout.exercises,
            completedAt: completedWorkout.completedAt,
            totalVolume
          },
          {
            mutationId: crypto.randomUUID(),
            duration,
            volume: totalVolume
          }
        );
      } catch (mutateErr: any) {
        if (mutateErr.message?.includes('not found') || mutateErr.message?.includes('NOT_FOUND') || mutateErr.status === 404) {
          await saveWorkout(completedWorkout, 'USER', `Completed active session: ${completedWorkout.title}`);
        } else {
          throw mutateErr;
        }
      }

      finishWorkout();
      if (onWorkoutFinished) {
        onWorkoutFinished(completedWorkout);
      }
    } catch (e) {
      console.error(e);
      alert("Failed to save workout");
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
      {/* Header */}
      <div className="flex items-center justify-between sticky top-0 bg-background/95 backdrop-blur z-20 py-2 border-b border-border -mx-4 px-4 md:-mx-8 md:px-8">
        <div>
          <h2 className="text-xl font-bold font-display">{activeWorkout.title || activeWorkout.name || 'Workout Session'}</h2>
          <div className="text-xs text-muted-foreground">Active Session Logger</div>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={() => finishWorkout()}>Cancel</Button>
          <Button variant="default" size="sm" onClick={handleSaveWorkout} disabled={saving} className="font-semibold">
            {saving ? 'Saving...' : 'Finish & Save'}
          </Button>
        </div>
      </div>

      {/* Rest Timer Banner */}
      {restTimeLeft > 0 && (
        <div className="bg-primary/15 border border-primary/30 rounded-xl p-3 flex items-center justify-between sticky top-14 z-10 backdrop-blur shadow-lg shadow-primary/5">
          <div className="flex items-center gap-2">
            <Timer className="text-primary animate-pulse" size={20} />
            <span className="font-mono font-bold text-lg text-primary">{formatTime(restTimeLeft)}</span>
            <span className="text-xs text-muted-foreground hidden sm:inline">Rest in progress</span>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" className="h-8 text-xs bg-background/60" onClick={() => setRestTimer(restTimeLeft + 30)}>+30s</Button>
            <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={clearRestTimer}><X size={16}/></Button>
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

          return (
            <Card key={ex.id} className="overflow-hidden shadow-xs border-border/80">
              <CardHeader className="bg-secondary/40 pb-3 py-3 px-4 flex flex-row items-center justify-between border-b border-border/60">
                <div className="space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <CardTitle className="text-base font-bold text-foreground">{def?.name || ex.exerciseId}</CardTitle>
                    {report && getProgressionBadge(report.state, report.deltaE1RM)}
                  </div>
                  <div className="text-xs text-muted-foreground">{def?.primaryMuscle} • {def?.equipment}</div>
                </div>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="text-muted-foreground hover:text-destructive h-8 w-8 -mr-2" 
                  onClick={() => removeExercise(ex.id)}
                >
                  <X size={16} />
                </Button>
              </CardHeader>

              <CardContent className="p-0">
                {/* Previous Performance & Next Target Banner */}
                <div className="bg-secondary/15 px-4 py-2.5 border-b border-border/50 space-y-1.5 text-xs">
                  {lastPerf && (
                    <div className="flex items-center justify-between text-muted-foreground">
                      <span>Last Performance:</span>
                      <span className="font-mono font-medium text-foreground">
                        {lastPerf.weight}kg × {lastPerf.reps} reps {lastPerf.rir !== undefined ? `@ RIR ${lastPerf.rir}` : ''} (e1RM: {lastPerf.e1RM}kg)
                      </span>
                    </div>
                  )}

                  {target && (
                    <div className="flex items-center justify-between gap-2 pt-1 border-t border-border/30">
                      <div className="flex items-center gap-1.5 font-medium text-primary">
                        <Target size={13} className="shrink-0" />
                        <span>Next Target: <strong>{target.targetWeight}kg</strong> × {target.targetRepsMin}–{target.targetRepsMax} reps {target.suggestedRIR !== undefined ? `@ RIR ${target.suggestedRIR}` : ''}</span>
                      </div>
                      <Button 
                        size="sm" 
                        variant="outline" 
                        className="h-6 px-2 text-[10px] font-bold border-primary/30 text-primary hover:bg-primary/10 shrink-0"
                        onClick={() => handleApplyNextTarget(ex.id)}
                      >
                        Apply Target
                      </Button>
                    </div>
                  )}
                </div>
                
                {/* Exercise volume vs last session */}
                {(() => {
                  const prev = getPreviousExerciseSession(
                    allUserWorkouts,
                    def?.name || ex.exerciseId,
                    activeWorkout.id
                  );
                  const curVol = currentExerciseVolume(ex.sets);
                  const dPct = prev ? volumeDeltaPct(curVol, prev.sessionVolume) : null;
                  if (!prev) return null;
                  return (
                    <div className="px-3 pt-2 flex items-center justify-between text-[11px]">
                      <span className="text-muted-foreground font-mono">
                        Last session vol:{' '}
                        <span className="text-foreground font-semibold">
                          {Math.round(prev.sessionVolume).toLocaleString()} kg
                        </span>
                      </span>
                      {dPct !== null && curVol > 0 && (
                        <span
                          className={cn(
                            'font-bold px-2 py-0.5 rounded-full border',
                            dPct > 0 && 'bg-emerald-500/15 text-emerald-600 border-emerald-500/30',
                            dPct < 0 && 'bg-amber-500/15 text-amber-600 border-amber-500/30',
                            dPct === 0 && 'bg-secondary text-muted-foreground border-border'
                          )}
                        >
                          {dPct > 0 ? `+${dPct}%` : dPct < 0 ? `${dPct}%` : '='} vs last
                        </span>
                      )}
                    </div>
                  );
                })()}

                {/* Gym-first set rows: big steppers + full-width complete + vs last */}
                <div className="p-3 space-y-3">
                  {ex.sets.map((set, setIndex) => {
                    const cmp = compareLiveSet(
                      allUserWorkouts,
                      def?.name || ex.exerciseId,
                      setIndex,
                      { weight: set.weight, reps: set.reps, completed: set.completed },
                      activeWorkout.id
                    );
                    return (
                      <GymSetRow
                        key={set.id || setIndex}
                        setNumber={setIndex + 1}
                        set={set}
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
                    onClick={() => {
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
        onClick={() => setShowSelector(true)}
      >
        <Plus size={16} className="mr-2 text-primary" /> Add Exercise
      </Button>
      
      {showSelector && (
        <ExerciseSelector 
          onClose={() => setShowSelector(false)} 
          onSelect={handleAddExercise} 
        />
      )}
    </div>
  );
}
