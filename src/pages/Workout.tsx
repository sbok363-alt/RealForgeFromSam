import React, { useState, useEffect, useMemo } from 'react';
import { Workout, WorkoutSetItem } from '../types';
import { useAuthStore } from '../store/useAuthStore';
import { 
  getWorkouts, 
  saveWorkout, 
  deleteWorkout
} from '../lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Skeleton } from '../components/ui/Skeleton';
import { OCCVersionBadge } from '../components/OCCVersionBadge';
import { WorkoutDetailModal } from '../components/WorkoutDetailModal';
import { MutationAuditModal } from '../components/MutationAuditModal';
import { WorkoutConflictModal } from '../components/workout/WorkoutConflictModal';
import { useWorkoutStore } from '../store/useWorkoutStore';
import { ExerciseThumbnail } from '../components/workout/ExerciseThumbnail';
import { 
  Dumbbell, 
  Plus, 
  Calendar, 
  Sparkles, 
  History, 
  Play, 
  CheckCircle2, 
  Clock, 
  Flame,
  ArrowRight,
  Layers,
  ChevronRight,
  Trash2,
  AlertTriangle,
  Zap
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { cn } from '../lib/utils';
import { isGuestUserId } from '../lib/guest-session';

export default function WorkoutPage() {
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const { activeWorkout, startWorkout, discardWorkout } = useWorkoutStore();
  const isGuest = Boolean(user && isGuestUserId(user.uid));

  const [workouts, setWorkouts] = useState<Workout[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedWorkout, setSelectedWorkout] = useState<Workout | null>(null);
  const [auditTargetWorkout, setAuditTargetWorkout] = useState<Workout | null>(null);
  const [conflictTargetWorkout, setConflictTargetWorkout] = useState<Workout | null>(null);
  const [workoutToDelete, setWorkoutToDelete] = useState<Workout | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [creating, setCreating] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'ALL' | 'PLANNED' | 'COMPLETED'>('ALL');
  const deleteCancelRef = React.useRef<HTMLButtonElement>(null);

  // Calculate historical PR counts for completed workouts using Epley's formula
  const workoutPRCounts = useMemo(() => {
    const completedWorkouts = [...workouts]
      .filter(w => w.status === 'COMPLETED' || w.status === 'completed')
      .sort((a, b) => new Date(a.scheduledDate || 0).getTime() - new Date(b.scheduledDate || 0).getTime());

    const runningPRs: Record<string, number> = {};
    const prCounts: Record<string, number> = {};

    completedWorkouts.forEach(w => {
      let count = 0;
      const sets = w.sets || [];
      sets.forEach(s => {
        if (s.completed && s.weight > 0 && s.reps > 0 && s.exercise) {
          const e1rm = s.weight * (1 + s.reps / 30);
          const currentRecord = runningPRs[s.exercise] || 0;
          if (currentRecord > 0 && e1rm > currentRecord) {
            count++;
            runningPRs[s.exercise] = e1rm;
          } else if (currentRecord === 0) {
            runningPRs[s.exercise] = e1rm;
          }
        }
      });
      if (count > 0) {
        prCounts[w.id] = count;
      }
    });

    return prCounts;
  }, [workouts]);

  const fetchWorkoutsList = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const data = await getWorkouts(user.uid);
      setWorkouts(data);
    } catch (e) {
      console.error("Error fetching workouts:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchWorkoutsList();
  }, [user]);

  useEffect(() => {
    if (!workoutToDelete) return;
    const previousFocus = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    const frame = requestAnimationFrame(() => deleteCancelRef.current?.focus());

    return () => {
      cancelAnimationFrame(frame);
      previousFocus?.focus();
    };
  }, [workoutToDelete]);


  const handleStartWorkout = (workout: Workout) => {
    if (activeWorkout && activeWorkout.id !== workout.id) {
      setConflictTargetWorkout(workout);
      return;
    }
    startWorkout(workout);
    setSelectedWorkout(workout);
  };

  const handleConfirmConflict = () => {
    if (!conflictTargetWorkout) return;
    discardWorkout();
    startWorkout(conflictTargetWorkout);
    setSelectedWorkout(conflictTargetWorkout);
    setConflictTargetWorkout(null);
  };

  const handleCreateEmptyWorkout = async () => {
    if (!user || creating) return;
    setCreating(true);
    setActionError(null);
    try {
      const todayStr = new Date().toISOString().split('T')[0];
      const newW: Workout = {
        id: crypto.randomUUID(),
        userId: user.uid,
        title: `Workout Session #${workouts.length + 1}`,
        scheduledDate: todayStr,
        status: 'PLANNED',
        version: 1,
        sets: [],
        exercises: [],
        updatedAt: new Date().toISOString()
      };

      const saved = await saveWorkout(newW, 'USER', `Created empty workout: ${newW.title}`);
      setWorkouts(prev => [saved, ...prev]);
      setSelectedWorkout(saved);
    } catch (error: any) {
      console.error('Failed to create workout:', error);
      setActionError(error?.message || 'Could not create the workout. Retry without losing your existing training.');
    } finally {
      setCreating(false);
    }
  };

  const handleOpenBrainForWorkout = (workout: Workout) => {
    navigate('/brain', { 
      state: { 
        targetWorkoutId: workout.id,
        autoPrompt: `Please analyze and optimize this workout: "${workout.title}". Suggest progressive overload adjustments, set volume, and exercise sequence.`
      } 
    });
  };

  const handleDeleteWorkout = async (workout: Workout) => {
    if (!user) return;
    setDeleting(true);
    setActionError(null);
    try {
      await deleteWorkout(workout.id, user.uid);
      if (activeWorkout?.id === workout.id) {
        discardWorkout();
      }
      setWorkouts(prev => prev.filter(w => w.id !== workout.id));
      if (selectedWorkout?.id === workout.id) {
        setSelectedWorkout(null);
      }
      setWorkoutToDelete(null);
    } catch (e: any) {
      console.error("Failed to delete workout:", e);
      setActionError(e?.message || 'Could not delete the workout. Nothing was removed locally.');
    } finally {
      setDeleting(false);
    }
  };

  const filteredWorkouts = workouts.filter(w => {
    if (filter === 'ALL') return true;
    return String(w.status).toUpperCase() === filter;
  });

  const getStatusBadge = (status: Workout['status']) => {
    switch (status) {
      case 'IN_PROGRESS':
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/20">
            <Clock size={11} /> In Progress
          </span>
        );
      case 'COMPLETED':
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
            <CheckCircle2 size={11} /> Completed
          </span>
        );
      case 'SKIPPED':
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
            Skipped
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
            <Calendar size={11} /> Planned
          </span>
        );
    }
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-12">
      {/* Page Header */}
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-display font-bold">Workouts & Schedules</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Optimistic Concurrency Control (OCC) enabled. AI changes are proposed before writing.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button 
            size="sm"
            onClick={handleCreateEmptyWorkout}
            disabled={creating}
            className="text-xs font-semibold gap-1.5"
          >
            <Plus size={15} /> {creating ? 'Creating…' : 'New Workout'}
          </Button>
        </div>
      </header>

      {actionError && (
        <div role="alert" className="rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-xs text-destructive">
          {actionError}
        </div>
      )}

      {/* Filter Tabs */}
      <div className="flex items-center gap-2 border-b border-border pb-2" aria-busy={loading}>
        <button
          onClick={() => setFilter('ALL')}
          className={cn(
            "px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors",
            filter === 'ALL' ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-secondary"
          )}
        >
          All Workouts ({loading ? '…' : workouts.length})
        </button>
        <button
          onClick={() => setFilter('PLANNED')}
          className={cn(
            "px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors",
            filter === 'PLANNED' ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-secondary"
          )}
        >
          Planned ({loading ? '…' : workouts.filter(w => String(w.status).toUpperCase() === 'PLANNED').length})
        </button>
        <button
          onClick={() => setFilter('COMPLETED')}
          className={cn(
            "px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors",
            filter === 'COMPLETED' ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-secondary"
          )}
        >
          Completed ({loading ? '…' : workouts.filter(w => String(w.status).toUpperCase() === 'COMPLETED').length})
        </button>
      </div>

      {/* Workouts Grid / List */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1, 2, 3, 4].map((n) => (
            <Card 
              key={n} 
              className="overflow-hidden border border-border/70 flex flex-col justify-between"
            >
              <div>
                {/* Header Skeleton */}
                <CardHeader className="p-4 bg-card border-b border-border/40 pb-3 flex flex-row items-start justify-between gap-2">
                  <div className="space-y-2 flex-1 min-w-0 pr-2">
                    <Skeleton className="h-5 w-3/4 max-w-[200px]" />
                    <div className="flex items-center gap-2">
                      <Skeleton className="h-3.5 w-20" />
                      <Skeleton className="h-3.5 w-12" />
                      <Skeleton className="h-3.5 w-14" />
                    </div>
                  </div>
                  <Skeleton className="h-6 w-20 rounded-full shrink-0" />
                </CardHeader>

                {/* Content Exercise List Skeleton */}
                <CardContent className="p-4 space-y-2.5">
                  <div className="flex justify-between items-center py-0.5">
                    <Skeleton className="h-4 w-44" />
                    <Skeleton className="h-3.5 w-12" />
                  </div>
                  <div className="flex justify-between items-center py-0.5">
                    <Skeleton className="h-4 w-36" />
                    <Skeleton className="h-3.5 w-12" />
                  </div>
                  <div className="flex justify-between items-center py-0.5">
                    <Skeleton className="h-4 w-40" />
                    <Skeleton className="h-3.5 w-12" />
                  </div>
                </CardContent>
              </div>

              {/* Action Buttons Skeleton */}
              <div className="p-3 bg-card border-t border-border/40 flex gap-2">
                <Skeleton className="h-11 flex-1 rounded-lg" />
                <Skeleton className="h-11 flex-1 rounded-lg" />
              </div>
            </Card>
          ))}
        </div>
      ) : filteredWorkouts.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground space-y-3 bg-secondary/10 rounded-2xl border border-dashed border-border p-8">
          <Dumbbell size={40} className="mx-auto opacity-30 text-primary" />
          <h3 className="font-semibold text-base text-foreground">No workouts found</h3>
          <p className="text-xs max-w-sm mx-auto">
            {isGuest
              ? 'Create a custom workout locally. Connect Google later if you want Hardstate Brain suggestions.'
              : 'Create a custom workout or ask Hardstate Brain to construct a progressive overload routine for you.'}
          </p>
          <Button size="sm" onClick={handleCreateEmptyWorkout} disabled={creating}>
            {creating ? 'Creating…' : 'Create First Workout'}
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredWorkouts.map((workout) => {
            // Group exercises for concise summary
            const flatExerciseNames = (workout.sets || [])
              .map((set) => set.exercise)
              .filter((name): name is string => Boolean(name));
            const nestedExerciseNames = (workout.exercises || [])
              .map((exercise) => exercise.name || exercise.exerciseId)
              .filter(Boolean);
            const uniqueExercises: string[] = Array.from(
              new Set(flatExerciseNames.length > 0 ? flatExerciseNames : nestedExerciseNames)
            );
            const displaySets = (workout.sets && workout.sets.length > 0)
              ? workout.sets
              : (workout.exercises || []).flatMap((exercise) =>
                  exercise.sets.map((set) => ({
                    ...set,
                    exercise: exercise.name || exercise.exerciseId,
                  }))
                );
            const totalVolume = displaySets.reduce((sum, set) => sum + (set.weight * set.reps), 0);
            const isActiveThis = activeWorkout?.id === workout.id;

            return (
              <Card 
                key={workout.id}
                className={cn(
                  "overflow-hidden border transition-all shadow-sm hover:shadow-md flex flex-col justify-between",
                  isActiveThis ? "border-emerald-500/60 ring-1 ring-emerald-500/30" : "border-border/70 hover:border-primary/50"
                )}
              >
                <div>
                  {/* Card Header */}
                  <CardHeader className="p-4 bg-card border-b border-border/40 pb-3 flex flex-row items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <CardTitle className="text-lg font-bold truncate">
                          {workout.title}
                        </CardTitle>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1.5 font-medium flex-wrap">
                        <Calendar size={12} className="text-primary" />
                        <span>{workout.scheduledDate}</span>
                        <span>•</span>
                        <span>{displaySets.length} sets</span>
                        <span>•</span>
                        <span>{Math.round(totalVolume)} kg</span>
                        {workoutPRCounts[workout.id] && workoutPRCounts[workout.id] > 0 && (
                          <>
                            <span>•</span>
                            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-500 dark:text-amber-400 bg-amber-500/10 border border-amber-500/20 px-1.5 py-0.5 rounded-md">
                              <Zap size={11} className="fill-amber-500" /> {workoutPRCounts[workout.id]} PR{workoutPRCounts[workout.id] > 1 ? 's' : ''}
                            </span>
                          </>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {isActiveThis ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 animate-pulse">
                          <Clock size={11} /> Active
                        </span>
                      ) : getStatusBadge(workout.status)}
                      <button 
                        className="p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-md transition-colors"
                        title="Delete Workout"
                        onClick={(e) => {
                          e.stopPropagation();
                          setWorkoutToDelete(workout);
                        }}
                      >
                        <Trash2 size={14} />
                      </button>
                      <button 
                        className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-secondary rounded-md ml-0.5"
                        onClick={() => setSelectedWorkout(isActiveThis ? activeWorkout || workout : workout)}
                      >
                         <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="1"></circle><circle cx="12" cy="5" r="1"></circle><circle cx="12" cy="19" r="1"></circle></svg>
                      </button>
                    </div>
                  </CardHeader>

                  {/* Card Content */}
                  <CardContent className="p-4 space-y-3">
                    {/* Exercise List */}
                    {uniqueExercises.length === 0 ? (
                      <div className="py-2 text-center text-xs text-muted-foreground italic flex items-center justify-center gap-1.5">
                        <Dumbbell size={14} className="opacity-40" /> Empty session — ready to add exercises
                      </div>
                    ) : (
                      <div className="space-y-1.5">
                        {uniqueExercises.slice(0, 3).map((ex, i) => {
                          const count = displaySets.filter((set) => set.exercise === ex).length;
                          return (
                            <div key={i} className="flex items-center justify-between gap-2.5 py-1">
                              <div className="flex items-center gap-2.5 min-w-0 flex-1">
                                <ExerciseThumbnail exerciseName={ex} size="sm" />
                                <span className="text-xs font-bold text-foreground/90 truncate">{ex}</span>
                              </div>
                              <span className="text-muted-foreground text-[11px] font-mono whitespace-nowrap shrink-0">{count} sets</span>
                            </div>
                          );
                        })}
                        {uniqueExercises.length > 3 && (
                          <div className="text-[11px] text-muted-foreground italic pt-1 pl-1">
                            +{uniqueExercises.length - 3} more exercises
                          </div>
                        )}
                      </div>
                    )}
                  </CardContent>
                </div>

                {/* Card Actions */}
                <div className="p-3 bg-card border-t border-border/40">
                  {String(workout.status).toUpperCase() === 'COMPLETED' ? (
                     <Button 
                       variant="secondary" 
                       className="w-full font-bold h-11 text-xs"
                       onClick={() => setSelectedWorkout(workout)}
                     >
                       View Summary
                     </Button>
                  ) : (
                    <div className="flex gap-2">
                      <Button 
                        variant="outline"
                        className="flex-1 font-semibold h-11 text-xs gap-1.5 border-primary/30 hover:bg-primary/10 text-primary"
                        onClick={() => {
                          setSelectedWorkout(isActiveThis ? activeWorkout || workout : workout);
                        }}
                      >
                        <Layers size={14} /> Details / Edit
                      </Button>
                      <Button 
                        className={cn(
                          "flex-1 font-bold h-11 text-xs gap-1.5",
                          isActiveThis ? "bg-emerald-600 hover:bg-emerald-700 text-white" : ""
                        )}
                        onClick={() => {
                          if (isActiveThis) {
                            setSelectedWorkout(activeWorkout || workout);
                          } else if (uniqueExercises.length === 0) {
                            setSelectedWorkout(workout);
                          } else {
                            handleStartWorkout(workout);
                          }
                        }}
                      >
                        {uniqueExercises.length === 0 ? (
                          <>
                            <Plus size={14} /> Add exercises
                          </>
                        ) : (
                          <>
                            <Play size={14} fill="currentColor" /> {isActiveThis ? "Resume" : "Start"}
                          </>
                        )}
                      </Button>
                    </div>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Workout Detail & Set Editor Modal */}
      {selectedWorkout && (
        <WorkoutDetailModal 
          workout={selectedWorkout}
          isOpen={!!selectedWorkout}
          onClose={() => setSelectedWorkout(null)}
          onSave={(updated) => {
            setWorkouts(prev => prev.map(w => w.id === updated.id ? updated : w));
            setSelectedWorkout(null);
          }}
          onDelete={(id) => {
            setWorkouts(prev => prev.filter(w => w.id !== id));
            setSelectedWorkout(null);
          }}
          onOpenBrain={(w) => handleOpenBrainForWorkout(w)}
          onOpenAudit={(w) => setAuditTargetWorkout(w)}
        />
      )}

      {/* Workout Conflict Modal */}
      {conflictTargetWorkout && activeWorkout && (
        <WorkoutConflictModal
          isOpen={!!conflictTargetWorkout}
          activeWorkout={activeWorkout}
          newWorkout={conflictTargetWorkout}
          onCancel={() => setConflictTargetWorkout(null)}
          onConfirm={handleConfirmConflict}
        />
      )}

      {/* Workout Delete Confirmation Modal */}
      {workoutToDelete && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="workout-delete-title"
            aria-describedby="workout-delete-description"
            onKeyDown={(event) => {
              if (event.key === 'Escape' && !deleting) {
                event.stopPropagation();
                setWorkoutToDelete(null);
              }
            }}
            className="bg-card border border-destructive/30 rounded-2xl p-5 max-w-md w-full shadow-2xl space-y-4 animate-in fade-in zoom-in-95"
          >
            <div className="flex items-center gap-3 text-destructive">
              <div className="p-2 rounded-xl bg-destructive/10">
                <AlertTriangle size={22} />
              </div>
              <div>
                <h3 id="workout-delete-title" className="font-bold text-base text-foreground">Delete Workout?</h3>
                <p id="workout-delete-description" className="text-xs text-muted-foreground">This action will remove the session from your history.</p>
              </div>
            </div>

            <div className="p-3 bg-secondary/30 rounded-xl border border-border/60 text-xs space-y-1">
              <div className="font-semibold text-foreground truncate">{workoutToDelete.title}</div>
              <div className="text-muted-foreground">{workoutToDelete.scheduledDate} • {workoutToDelete.sets?.length || 0} sets</div>
            </div>

            <p className="text-xs text-muted-foreground leading-relaxed">
              Deleting this workout cannot be undone. An audit snapshot will be preserved in your OCC logs should you need to reference prior state.
            </p>

            <div className="flex gap-2 justify-end pt-1">
              <Button
                ref={deleteCancelRef}
                variant="outline"
                size="sm"
                onClick={() => setWorkoutToDelete(null)}
                disabled={deleting}
                className="h-9 text-xs"
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => handleDeleteWorkout(workoutToDelete)}
                disabled={deleting}
                className="h-9 text-xs font-bold gap-1.5 bg-destructive hover:bg-destructive/90"
              >
                <Trash2 size={14} />
                {deleting ? 'Deleting...' : 'Confirm Delete'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Mutation Audit & Undo Modal */}
      {auditTargetWorkout && user && (
        <MutationAuditModal 
          isOpen={!!auditTargetWorkout}
          onClose={() => setAuditTargetWorkout(null)}
          userId={user.uid}
          targetWorkout={auditTargetWorkout}
          onWorkoutRestored={(restored) => {
            setWorkouts(prev => prev.map(w => w.id === restored.id ? restored : w));
          }}
        />
      )}
    </div>
  );
}
