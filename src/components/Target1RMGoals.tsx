import React, { useState, useMemo } from 'react';
import { Target1RM, Workout } from '../types';
import { Card, CardContent, CardHeader, CardTitle } from './ui/Card';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import { EXERCISE_DATABASE, getExerciseById } from '../lib/exercises';
import { calculateE1RM } from '../lib/progression';
import { 
  Target, 
  Plus, 
  Trash2, 
  Edit3, 
  Trophy, 
  Sparkles, 
  Dumbbell, 
  CheckCircle2, 
  ChevronRight, 
  Flame, 
  TrendingUp,
  X
} from 'lucide-react';
import { cn } from '../lib/utils';

interface Target1RMGoalsProps {
  userId: string;
  targets: Target1RM[];
  workouts: Workout[];
  onSaveTarget: (target: Target1RM) => Promise<void>;
  onDeleteTarget: (targetId: string) => Promise<void>;
}

export function computeBestE1RM(workouts: Workout[], exerciseIdOrName: string): {
  bestE1RM: number;
  bestWeight: number;
  bestReps: number;
} {
  const normTarget = exerciseIdOrName.toLowerCase().replace(/[-_\s]+/g, '');
  let bestE1RM = 0;
  let bestWeight = 0;
  let bestReps = 0;

  for (const w of workouts) {
    if (w.status !== 'COMPLETED' && w.status !== 'completed') continue;

    // Check flat sets
    if (Array.isArray(w.sets)) {
      for (const s of w.sets) {
        if (!s.completed && s.completed !== undefined) continue;
        if (!s.weight || !s.reps || s.weight <= 0 || s.reps <= 0) continue;
        const normEx = (s.exercise || '').toLowerCase().replace(/[-_\s]+/g, '');
        if (normEx === normTarget || normEx.includes(normTarget) || normTarget.includes(normEx)) {
          const e1rm = calculateE1RM(s.weight, s.reps, s.rir);
          if (e1rm > bestE1RM) {
            bestE1RM = e1rm;
            bestWeight = s.weight;
            bestReps = s.reps;
          }
        }
      }
    }

    // Check nested exercises
    if (Array.isArray(w.exercises)) {
      for (const ex of w.exercises) {
        const normExId = (ex.exerciseId || '').toLowerCase().replace(/[-_\s]+/g, '');
        if (normExId === normTarget || normExId.includes(normTarget) || normTarget.includes(normExId)) {
          for (const s of ex.sets) {
            if (!s.completed && s.completed !== undefined) continue;
            if (!s.weight || !s.reps || s.weight <= 0 || s.reps <= 0) continue;
            const e1rm = calculateE1RM(s.weight, s.reps, s.rir);
            if (e1rm > bestE1RM) {
              bestE1RM = e1rm;
              bestWeight = s.weight;
              bestReps = s.reps;
            }
          }
        }
      }
    }
  }

  return { 
    bestE1RM: Math.round(bestE1RM * 10) / 10, 
    bestWeight, 
    bestReps 
  };
}

export function Target1RMGoals({
  userId,
  targets,
  workouts,
  onSaveTarget,
  onDeleteTarget
}: Target1RMGoalsProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTarget, setEditingTarget] = useState<Target1RM | null>(null);

  // Form states
  const [selectedExerciseId, setSelectedExerciseId] = useState<string>('bench_press');
  const [customExerciseName, setCustomExerciseName] = useState<string>('');
  const [targetWeight, setTargetWeight] = useState<string>('100');
  const [notes, setNotes] = useState<string>('');
  const [isSaving, setIsSaving] = useState(false);

  // Calculate stats for all targets
  const targetStats = useMemo(() => {
    return targets.map(t => {
      const best = computeBestE1RM(workouts, t.exerciseId || t.exerciseName);
      const current1RM = best.bestE1RM;
      const progressPercent = t.target1RM > 0 ? Math.min(100, Math.round((current1RM / t.target1RM) * 100)) : 0;
      const rawPercent = t.target1RM > 0 ? Math.round((current1RM / t.target1RM) * 100) : 0;
      const remainingKg = Math.max(0, Math.round((t.target1RM - current1RM) * 10) / 10);
      const isAchieved = current1RM >= t.target1RM && current1RM > 0;
      const exDef = getExerciseById(t.exerciseId);

      return {
        ...t,
        current1RM,
        bestWeight: best.bestWeight,
        bestReps: best.bestReps,
        progressPercent,
        rawPercent,
        remainingKg,
        isAchieved,
        equipment: exDef?.equipment,
        primaryMuscle: exDef?.primaryMuscle
      };
    });
  }, [targets, workouts]);

  const summary = useMemo(() => {
    if (targetStats.length === 0) return null;
    const achievedCount = targetStats.filter(t => t.isAchieved).length;
    const avgProgress = Math.round(
      targetStats.reduce((sum, t) => sum + t.progressPercent, 0) / targetStats.length
    );
    return {
      total: targetStats.length,
      achievedCount,
      avgProgress
    };
  }, [targetStats]);

  const handleOpenAddModal = (preset?: { exerciseId: string; name: string; target: number; notes?: string }) => {
    if (preset) {
      setSelectedExerciseId(preset.exerciseId);
      setCustomExerciseName(preset.name);
      setTargetWeight(preset.target.toString());
      setNotes(preset.notes || '');
    } else {
      setSelectedExerciseId('bench_press');
      setCustomExerciseName('Bench Press');
      const best = computeBestE1RM(workouts, 'bench_press');
      const suggested = best.bestE1RM > 0 ? Math.ceil((best.bestE1RM + 10) / 2.5) * 2.5 : 100;
      setTargetWeight(suggested.toString());
      setNotes('');
    }
    setEditingTarget(null);
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (target: Target1RM) => {
    setEditingTarget(target);
    setSelectedExerciseId(target.exerciseId || 'custom');
    setCustomExerciseName(target.exerciseName);
    setTargetWeight(target.target1RM.toString());
    setNotes(target.notes || '');
    setIsModalOpen(true);
  };

  const handleExerciseChange = (exId: string) => {
    setSelectedExerciseId(exId);
    if (exId !== 'custom') {
      const def = getExerciseById(exId);
      if (def) {
        setCustomExerciseName(def.name);
        const best = computeBestE1RM(workouts, exId);
        const suggested = best.bestE1RM > 0 ? Math.ceil((best.bestE1RM + 7.5) / 2.5) * 2.5 : 100;
        setTargetWeight(suggested.toString());
      }
    }
  };

  const handleSaveGoal = async (e: React.FormEvent) => {
    e.preventDefault();
    const weightNum = parseFloat(targetWeight);
    if (isNaN(weightNum) || weightNum <= 0) return;

    let finalName = customExerciseName.trim();
    if (!finalName && selectedExerciseId !== 'custom') {
      const def = getExerciseById(selectedExerciseId);
      finalName = def ? def.name : selectedExerciseId;
    }
    if (!finalName) finalName = 'Exercise Goal';

    setIsSaving(true);
    try {
      const newOrUpdatedTarget: Target1RM = {
        id: editingTarget ? editingTarget.id : `target_${crypto.randomUUID()}`,
        userId,
        exerciseId: selectedExerciseId === 'custom' ? finalName.toLowerCase().replace(/\s+/g, '_') : selectedExerciseId,
        exerciseName: finalName,
        target1RM: weightNum,
        createdAt: editingTarget ? editingTarget.createdAt : Date.now(),
        updatedAt: Date.now(),
        notes: notes.trim() || undefined
      };

      await onSaveTarget(newOrUpdatedTarget);
      setIsModalOpen(false);
      setEditingTarget(null);
    } finally {
      setIsSaving(false);
    }
  };

  // Preview current 1RM in modal
  const modalCurrentBest = useMemo(() => {
    const exIdentifier = selectedExerciseId === 'custom' ? customExerciseName : selectedExerciseId;
    return computeBestE1RM(workouts, exIdentifier);
  }, [selectedExerciseId, customExerciseName, workouts]);

  return (
    <Card id="target-1rm-goals-card" className="border-border/80 shadow-xs">
      <CardHeader className="pb-3 border-b border-border/50">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <CardTitle className="text-base font-bold flex items-center gap-2">
              <Target size={18} className="text-primary" /> Target 1RM & Strength Milestones
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">
              Define target 1-Rep Max goals for your key lifts and monitor your progression trajectory.
            </p>
          </div>
          <Button
            id="btn-add-1rm-target"
            size="sm"
            onClick={() => handleOpenAddModal()}
            className="flex items-center gap-1.5 h-8 text-xs font-semibold"
          >
            <Plus size={14} /> Add 1RM Target
          </Button>
        </div>

        {summary && (
          <div className="grid grid-cols-3 gap-2 mt-3 pt-3 border-t border-border/40">
            <div className="bg-secondary/40 p-2.5 rounded-lg border border-border/40 text-center">
              <span className="text-[10px] text-muted-foreground uppercase block font-semibold">Active Targets</span>
              <span className="text-base font-bold text-foreground">{summary.total}</span>
            </div>
            <div className="bg-secondary/40 p-2.5 rounded-lg border border-border/40 text-center">
              <span className="text-[10px] text-muted-foreground uppercase block font-semibold">Achieved</span>
              <span className="text-base font-bold text-emerald-500 flex items-center justify-center gap-1">
                {summary.achievedCount > 0 && <Trophy size={13} className="text-emerald-500" />}
                {summary.achievedCount} / {summary.total}
              </span>
            </div>
            <div className="bg-secondary/40 p-2.5 rounded-lg border border-border/40 text-center">
              <span className="text-[10px] text-muted-foreground uppercase block font-semibold">Avg Completion</span>
              <span className="text-base font-bold text-primary">{summary.avgProgress}%</span>
            </div>
          </div>
        )}
      </CardHeader>

      <CardContent className="p-4 space-y-4">
        {targetStats.length === 0 ? (
          <div className="text-center py-8 px-4 rounded-xl bg-secondary/20 border border-dashed border-border/80 space-y-4">
            <div className="w-12 h-12 rounded-full bg-primary/10 text-primary flex items-center justify-center mx-auto">
              <Target size={24} />
            </div>
            <div>
              <h4 className="text-sm font-semibold text-foreground">No 1RM targets set yet</h4>
              <p className="text-xs text-muted-foreground max-w-sm mx-auto mt-1">
                Set milestone goals for your primary compound lifts to track how close you are to your strength targets.
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
              <Button
                variant="outline"
                size="sm"
                className="text-xs h-8"
                onClick={() => handleOpenAddModal({ exerciseId: 'bench_press', name: 'Bench Press', target: 100, notes: '2 plates milestone' })}
              >
                + Bench Press 100kg
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="text-xs h-8"
                onClick={() => handleOpenAddModal({ exerciseId: 'squat', name: 'Squat', target: 140, notes: '3 plates milestone' })}
              >
                + Squat 140kg
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="text-xs h-8"
                onClick={() => handleOpenAddModal({ exerciseId: 'romanian_deadlift', name: 'Romanian Deadlift', target: 160, notes: 'Posterior chain target' })}
              >
                + Deadlift 160kg
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3.5">
            {targetStats.map((item) => {
              const isComplete = item.isAchieved;
              
              return (
                <div
                  key={item.id}
                  id={`target-item-${item.id}`}
                  className={cn(
                    "p-3.5 rounded-xl border transition-all duration-200 space-y-2.5",
                    isComplete 
                      ? "bg-emerald-500/5 border-emerald-500/30 hover:border-emerald-500/50" 
                      : "bg-secondary/30 border-border/70 hover:border-border hover:bg-secondary/40"
                  )}
                >
                  {/* Top Bar: Name, tags & Action Buttons */}
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className={cn(
                        "w-8 h-8 rounded-lg flex items-center justify-center shrink-0",
                        isComplete ? "bg-emerald-500/20 text-emerald-500" : "bg-primary/10 text-primary"
                      )}>
                        {isComplete ? <Trophy size={16} /> : <Dumbbell size={16} />}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-bold text-sm text-foreground truncate">{item.exerciseName}</span>
                          {item.equipment && (
                            <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-secondary text-muted-foreground border border-border/40">
                              {item.equipment}
                            </span>
                          )}
                        </div>
                        {item.notes && (
                          <p className="text-[11px] text-muted-foreground truncate">{item.notes}</p>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleOpenEditModal(item)}
                        className="h-7 w-7 text-muted-foreground hover:text-foreground"
                        title="Edit target"
                      >
                        <Edit3 size={13} />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => onDeleteTarget(item.id)}
                        className="h-7 w-7 text-muted-foreground hover:text-rose-500"
                        title="Delete target"
                      >
                        <Trash2 size={13} />
                      </Button>
                    </div>
                  </div>

                  {/* 1RM Metrics Numbers */}
                  <div className="flex items-baseline justify-between text-xs pt-0.5">
                    <div className="flex items-baseline gap-1">
                      <span className="text-muted-foreground">Current e1RM:</span>
                      <span className="font-mono font-bold text-foreground text-sm">
                        {item.current1RM > 0 ? `${item.current1RM} kg` : 'No logs yet'}
                      </span>
                      {item.bestWeight > 0 && (
                        <span className="text-[10px] text-muted-foreground font-mono">
                          ({item.bestWeight}kg × {item.bestReps})
                        </span>
                      )}
                    </div>
                    <div className="flex items-baseline gap-1 text-right">
                      <span className="text-muted-foreground">Goal:</span>
                      <span className="font-mono font-bold text-primary text-sm">
                        {item.target1RM} kg
                      </span>
                    </div>
                  </div>

                  {/* Visual Progress Bar */}
                  <div className="space-y-1">
                    <div className="h-3.5 w-full bg-secondary/80 rounded-full overflow-hidden border border-border/50 relative p-0.5">
                      {/* Milestone Grid Markers */}
                      <div className="absolute inset-0 flex justify-between px-1/4 pointer-events-none opacity-20">
                        <div className="w-[1px] h-full bg-foreground ml-[25%]" />
                        <div className="w-[1px] h-full bg-foreground ml-[50%]" />
                        <div className="w-[1px] h-full bg-foreground ml-[75%]" />
                      </div>

                      {/* Animated Progress Fill */}
                      <div 
                        className={cn(
                          "h-full rounded-full transition-all duration-700 ease-out relative",
                          isComplete 
                            ? "bg-gradient-to-r from-emerald-500 to-teal-400 shadow-xs" 
                            : item.progressPercent >= 75 
                            ? "bg-gradient-to-r from-primary to-cyan-400" 
                            : item.progressPercent >= 40
                            ? "bg-gradient-to-r from-blue-600 to-indigo-500"
                            : "bg-gradient-to-r from-amber-500 to-orange-400"
                        )}
                        style={{ width: `${Math.max(4, Math.min(100, item.progressPercent))}%` }}
                      />
                    </div>

                    {/* Progress Bar Footer info */}
                    <div className="flex items-center justify-between text-[11px] pt-0.5">
                      <div className="flex items-center gap-1.5">
                        <span className={cn(
                          "font-bold font-mono px-1.5 py-0.2 rounded text-[10px]",
                          isComplete 
                            ? "bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30" 
                            : "bg-primary/10 text-primary border border-primary/20"
                        )}>
                          {item.rawPercent}%
                        </span>
                        
                        {isComplete ? (
                          <span className="text-emerald-600 dark:text-emerald-400 font-semibold flex items-center gap-1 text-[11px]">
                            <CheckCircle2 size={12} /> Target Achieved! {item.current1RM > item.target1RM ? `(+${Math.round((item.current1RM - item.target1RM)*10)/10}kg)` : ''}
                          </span>
                        ) : item.remainingKg > 0 ? (
                          <span className="text-muted-foreground font-medium">
                            <strong>{item.remainingKg} kg</strong> remaining to target
                          </span>
                        ) : null}
                      </div>

                      {item.progressPercent > 0 && !isComplete && (
                        <span className="text-[10px] text-muted-foreground font-mono">
                          {Math.round((item.current1RM / item.target1RM) * 100)}% of {item.target1RM}kg
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>

      {/* Add / Edit Target 1RM Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-xs">
          <div 
            className="w-full max-w-md bg-card border border-border rounded-xl shadow-xl p-5 space-y-4 animate-in fade-in zoom-in-95 duration-150"
            role="dialog"
            aria-modal="true"
          >
            <div className="flex items-center justify-between border-b border-border/50 pb-3">
              <h3 className="text-base font-bold flex items-center gap-2">
                <Target size={18} className="text-primary" />
                {editingTarget ? 'Edit Target 1RM' : 'Set New Target 1RM'}
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-muted-foreground hover:text-foreground p-1 rounded-md"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveGoal} className="space-y-4">
              {/* Exercise Selector */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">Exercise Lift</label>
                <select
                  id="select-target-exercise"
                  value={selectedExerciseId}
                  onChange={(e) => handleExerciseChange(e.target.value)}
                  className="w-full h-9 rounded-md border border-border bg-background px-3 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  <optgroup label="Popular Compound Lifts">
                    <option value="bench_press">Bench Press (Barbell)</option>
                    <option value="squat">Squat (Barbell)</option>
                    <option value="romanian_deadlift">Romanian Deadlift</option>
                    <option value="overhead_press">Overhead Press (Barbell)</option>
                    <option value="incline_bench_press">Incline Bench Press</option>
                    <option value="barbell_row">Barbell Row</option>
                    <option value="pull_up">Pull-Up</option>
                  </optgroup>
                  <optgroup label="All Exercises">
                    {EXERCISE_DATABASE.map((ex) => (
                      <option key={ex.id} value={ex.id}>
                        {ex.name} ({ex.equipment})
                      </option>
                    ))}
                  </optgroup>
                  <option value="custom">Other / Custom Exercise...</option>
                </select>
              </div>

              {selectedExerciseId === 'custom' && (
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-foreground">Custom Exercise Name</label>
                  <Input
                    id="input-custom-exercise-name"
                    type="text"
                    placeholder="e.g. Weighted Dips, Trap Bar Deadlift"
                    value={customExerciseName}
                    onChange={(e) => setCustomExerciseName(e.target.value)}
                    required
                  />
                </div>
              )}

              {/* Current Best Preview */}
              <div className="p-2.5 rounded-lg bg-secondary/50 border border-border/50 flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Current Estimated 1RM:</span>
                <span className="font-mono font-bold text-foreground">
                  {modalCurrentBest.bestE1RM > 0 ? `${modalCurrentBest.bestE1RM} kg` : '0 kg (No history yet)'}
                </span>
              </div>

              {/* Target 1RM Weight */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-foreground">Target 1RM Weight (kg)</label>
                  {modalCurrentBest.bestE1RM > 0 && (
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => setTargetWeight((modalCurrentBest.bestE1RM + 5).toString())}
                        className="text-[10px] text-primary hover:underline"
                      >
                        +5kg
                      </button>
                      <span className="text-muted-foreground text-[10px]">•</span>
                      <button
                        type="button"
                        onClick={() => setTargetWeight((modalCurrentBest.bestE1RM + 10).toString())}
                        className="text-[10px] text-primary hover:underline"
                      >
                        +10kg
                      </button>
                    </div>
                  )}
                </div>
                <Input
                  id="input-target-1rm-weight"
                  type="number"
                  step="0.5"
                  min="1"
                  max="600"
                  placeholder="e.g. 100"
                  value={targetWeight}
                  onChange={(e) => setTargetWeight(e.target.value)}
                  required
                />
              </div>

              {/* Notes */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">Goal Milestone Notes (Optional)</label>
                <Input
                  id="input-target-1rm-notes"
                  type="text"
                  placeholder="e.g. 2 plates milestone by Q4, competition prep"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-2 pt-2 border-t border-border/50">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setIsModalOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  id="btn-submit-1rm-target"
                  type="submit"
                  size="sm"
                  disabled={isSaving || !targetWeight || parseFloat(targetWeight) <= 0}
                  className="font-semibold"
                >
                  {isSaving ? 'Saving...' : editingTarget ? 'Update Goal' : 'Save Goal'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </Card>
  );
}
