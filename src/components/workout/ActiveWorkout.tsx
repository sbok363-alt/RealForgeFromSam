import React, { useState, useEffect, useMemo } from 'react';
import { useWorkoutStore } from '../../store/useWorkoutStore';
import { useAuthStore } from '../../store/useAuthStore';
import { getExerciseById, ExerciseDef } from '../../lib/exercises';
import { Button } from '../ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/Card';
import { Input } from '../ui/Input';
import { 
  Check, 
  Timer, 
  Plus, 
  X, 
  TrendingUp, 
  Minus, 
  TrendingDown, 
  HelpCircle, 
  Target, 
  Sparkles,
  ChevronDown,
  Info
} from 'lucide-react';
import { saveWorkout, mutateWorkout, getWorkouts, getPreviousPerformance } from '../../lib/api';
import { WorkoutExercise, WorkoutSet, Workout, ProgressionReport } from '../../types';
import { analyzeExerciseProgression } from '../../lib/progression';
import ExerciseSelector from './ExerciseSelector';
import { cn } from '../../lib/utils';

export default function ActiveWorkout() {
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
          duration,
          totalVolume
        );
      } catch (mutateErr: any) {
        if (mutateErr.message?.includes('not found') || mutateErr.message?.includes('NOT_FOUND') || mutateErr.status === 404) {
          await saveWorkout(completedWorkout, 'USER', `Completed active session: ${completedWorkout.title}`);
        } else {
          throw mutateErr;
        }
      }

      finishWorkout();
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
                
                {/* Sets Header */}
                <div className="grid grid-cols-[28px_1fr_1fr_64px_38px] gap-2 px-4 py-2 text-[11px] font-bold text-muted-foreground uppercase tracking-wider border-b border-border/50 bg-secondary/10">
                  <div className="text-center">Set</div>
                  <div className="text-center">kg</div>
                  <div className="text-center">Reps</div>
                  <div className="text-center">RIR</div>
                  <div className="text-center"><Check size={13} className="mx-auto" /></div>
                </div>

                {/* Sets List */}
                <div className="divide-y divide-border/30">
                  {ex.sets.map((set, setIndex) => (
                    <div 
                      key={set.id || setIndex} 
                      className={cn(
                        "grid grid-cols-[28px_1fr_1fr_64px_38px] gap-2 px-4 py-2 items-center transition-colors",
                        set.completed ? "bg-primary/5" : "bg-card hover:bg-secondary/20"
                      )}
                    >
                      <div className="text-center text-xs font-bold text-muted-foreground font-mono">
                        {setIndex + 1}
                      </div>

                      {/* Weight */}
                      <div>
                        <Input 
                          type="number" 
                          step="0.5"
                          min="0"
                          className={cn(
                            "h-9 text-center text-sm font-mono font-semibold",
                            set.completed ? "bg-transparent border-transparent text-primary font-bold" : "bg-background"
                          )} 
                          value={set.weight !== undefined && set.weight !== 0 ? set.weight : ''}
                          placeholder="0"
                          readOnly={set.completed}
                          onChange={(e) => updateSet(ex.id, set.id, { weight: parseFloat(e.target.value) || 0 })}
                        />
                      </div>

                      {/* Reps */}
                      <div>
                        <Input 
                          type="number" 
                          min="0"
                          className={cn(
                            "h-9 text-center text-sm font-mono font-semibold",
                            set.completed ? "bg-transparent border-transparent text-primary font-bold" : "bg-background"
                          )} 
                          value={set.reps !== undefined && set.reps !== 0 ? set.reps : ''}
                          placeholder="0"
                          readOnly={set.completed}
                          onChange={(e) => updateSet(ex.id, set.id, { reps: parseInt(e.target.value) || 0 })}
                        />
                      </div>

                      {/* RIR (Optional Effort Tracking) */}
                      <div>
                        <Input 
                          type="number"
                          min="0"
                          max="10"
                          className={cn(
                            "h-9 text-center text-xs font-mono",
                            set.completed ? "bg-transparent border-transparent text-muted-foreground font-medium" : "bg-background text-muted-foreground"
                          )}
                          value={set.rir !== undefined ? set.rir : ''}
                          placeholder="—"
                          title="Reps In Reserve (e.g. 0, 1, 2, 3)"
                          readOnly={set.completed}
                          onChange={(e) => {
                            const val = e.target.value === '' ? undefined : parseInt(e.target.value);
                            updateSet(ex.id, set.id, { rir: val });
                          }}
                        />
                      </div>

                      {/* Complete Checkbox */}
                      <div className="flex justify-center">
                        <Button 
                          size="icon" 
                          variant={set.completed ? "default" : "secondary"} 
                          className={cn(
                            "h-8 w-8 rounded-lg transition-all",
                            set.completed ? "bg-emerald-600 hover:bg-emerald-700 text-white" : "hover:bg-primary/20"
                          )}
                          onClick={() => handleCompleteSet(ex.id, set.id, set.completed, set.weight, set.reps)}
                        >
                          <Check size={15} />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
                
                {/* Add Set Button */}
                <div className="p-2 border-t border-border/40 flex justify-between items-center bg-secondary/5 px-4">
                  <span className="text-[11px] text-muted-foreground">
                    RIR = Reps in Reserve (optional)
                  </span>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className="text-xs text-primary font-semibold hover:bg-primary/10 h-7"
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
                    <Plus size={13} className="mr-1" /> Add Set
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
