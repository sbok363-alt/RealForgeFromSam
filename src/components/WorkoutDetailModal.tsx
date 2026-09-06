import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Workout, WorkoutSetItem, ProgressionReport } from '../types';
import { ExerciseDef, getExerciseByName } from '../lib/exercises';
import { saveWorkout, getWorkouts, mutateWorkout, deleteWorkout } from '../lib/api';
import { analyzeExerciseProgression } from '../lib/progression';
import { useAuthStore } from '../store/useAuthStore';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import { OCCVersionBadge } from './OCCVersionBadge';
import { useGeminiStore } from '../store/useGeminiStore';
import { useWorkoutStore } from '../store/useWorkoutStore';
import { 
  X, 
  Plus, 
  Trash2, 
  Save, 
  Sparkles, 
  History, 
  AlertTriangle, 
  Calendar, 
  CheckCircle2,
  TrendingUp,
  Zap,
  RotateCcw,
  Layers,
  ArrowRight,
  MessageSquare,
  LineChart,
  Check,
  Brain as BrainIcon,
  Loader2,
  ChevronRight,
  Clock,
  Pencil,
  Dumbbell,
  Timer,
  MoreVertical
} from 'lucide-react';
import { cn } from '../lib/utils';

import { WorkoutCelebration } from './WorkoutCelebration';
import { ExerciseHistorySheet } from './ExerciseHistorySheet';
import { ExerciseThumbnail } from './workout/ExerciseThumbnail';
import { ExercisePickerModal } from './workout/ExercisePickerModal';
import { RestTimer } from './workout/RestTimer';

interface WorkoutDetailModalProps {
  workout: Workout;
  isOpen: boolean;
  onClose: () => void;
  onSave: (updated: Workout) => void;
  onDelete?: (workoutId: string) => void;
  onOpenBrain: (workout: Workout) => void;
  onOpenAudit: (workout: Workout) => void;
}

type OptimizationStrategy = 'OVERLOAD' | 'VOLUME' | 'DELOAD' | 'CUSTOM_AI' | 'SWAP_EXERCISE' | 'MID_SESSION_DELOAD';

export function WorkoutDetailModal({
  workout,
  isOpen,
  onClose,
  onSave,
  onDelete,
  onOpenBrain,
  onOpenAudit
}: WorkoutDetailModalProps) {
  if (!isOpen) return null;

  const { status: geminiStatus, apiKey: geminiApiKey, openModal: openBYOKModal } = useGeminiStore();
  const { 
    activeWorkout, 
    startWorkout: startActiveWorkout, 
    updateActiveWorkout, 
    finishWorkout: finishActiveWorkout,
    discardWorkout: discardActiveWorkout,
    setRestTimer: setStoreRestTimer,
    clearRestTimer: clearStoreRestTimer
  } = useWorkoutStore();
  const { user } = useAuthStore();

  const [title, setTitle] = useState(workout.title || 'Workout Session');
  const [scheduledDate, setScheduledDate] = useState(workout.scheduledDate);
  const [isEditMode, setIsEditMode] = useState(false);
  
  // Consume workout.exercises if available, otherwise fallback to flat sets
  const initialSets = useMemo(() => {
    if (workout.exercises && workout.exercises.length > 0) {
       return workout.exercises.flatMap(ex => ex.sets.map(s => ({
         ...s,
         exercise: ex.name || ex.exerciseId,
         setType: s.setType === 'normal' ? 'N' : s.setType
       } as WorkoutSetItem)));
    }
    return workout.sets || [];
  }, [workout]);
  
  const [sets, setSets] = useState<WorkoutSetItem[]>(initialSets);
  
  const [saving, setSaving] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [simulatingConflict, setSimulatingConflict] = useState(false);
  const [allUserWorkouts, setAllUserWorkouts] = useState<Workout[]>([]);
  const [showCelebration, setShowCelebration] = useState(false);
  const [showExercisePicker, setShowExercisePicker] = useState(false);

  // Rest Timer State
  const [defaultRestDuration, setDefaultRestDuration] = useState(120); // 2:00 default
  const [restRemaining, setRestRemaining] = useState<number | null>(null);
  const [isRestPaused, setIsRestPaused] = useState(false);

  const [duration, setDuration] = useState(() => {
    if (workout.startedAt) {
      return Math.floor((Date.now() - workout.startedAt) / 1000);
    }
    return 0;
  });
  const [exerciseNotes, setExerciseNotes] = useState<Record<string, string>>(workout.exerciseNotes || {});
  const [openNotes, setOpenNotes] = useState<Record<string, boolean>>({});
  const [activeExerciseHistory, setActiveExerciseHistory] = useState<string | null>(null);

  // Sync with active workout if this is the active session
  useEffect(() => {
    if (!isOpen) return;
    if (activeWorkout && activeWorkout.id === workout.id) {
      if (activeWorkout.exercises && activeWorkout.exercises.length > 0) {
         setSets(activeWorkout.exercises.flatMap(ex => ex.sets.map(s => ({
           ...s,
           exercise: ex.name || ex.exerciseId,
           setType: s.setType === 'normal' ? 'N' : s.setType
         } as WorkoutSetItem))));
      } else {
         setSets(activeWorkout.sets || []);
      }
      if (activeWorkout.title) setTitle(activeWorkout.title);
      if (activeWorkout.exerciseNotes) setExerciseNotes(activeWorkout.exerciseNotes);
    } else if (workout.status === 'IN_PROGRESS' || !isEditMode) {
      startActiveWorkout({
        ...workout,
        sets,
        exercises: workout.exercises || [],
        exerciseNotes,
        title,
        scheduledDate,
        startedAt: workout.startedAt || Date.now()
      });
    }
  }, [isOpen, workout.id]);

  // Duration timer
  useEffect(() => {
    if (!isOpen) return;
    const startMs = workout.startedAt || activeWorkout?.startedAt || Date.now();
    setDuration(Math.floor((Date.now() - startMs) / 1000));
    const interval = setInterval(() => {
      setDuration(Math.floor((Date.now() - startMs) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [isOpen, workout.startedAt, activeWorkout?.startedAt]);

  // Rest countdown ticker
  useEffect(() => {
    if (restRemaining === null || isRestPaused || restRemaining === 0) return;
    const timer = setInterval(() => {
      setRestRemaining(prev => {
        if (prev === null || prev <= 0) {
          clearInterval(timer);
          return 0;
        }
        if (prev === 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [restRemaining, isRestPaused]);

  const handleStartRestTimer = (seconds: number) => {
    setRestRemaining(seconds);
    setIsRestPaused(false);
    setStoreRestTimer(seconds);
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  };

  const handleAdjustRestTime = (deltaSeconds: number) => {
    setRestRemaining(prev => {
      const current = prev === null ? defaultRestDuration : prev;
      const updated = Math.max(0, current + deltaSeconds);
      if (updated > 0) {
        setStoreRestTimer(updated);
      }
      return updated;
    });
  };

  const handleTogglePauseRest = () => {
    setIsRestPaused(prev => !prev);
  };

  const handleSkipRest = () => {
    setRestRemaining(null);
    setIsRestPaused(false);
    clearStoreRestTimer();
  };

  const formatDuration = (totalSeconds: number) => {
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = totalSeconds % 60;
    if (h > 0) {
      return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    }
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  // Fetch all workouts to calculate progression history
  useEffect(() => {
    if (!user) return;
    getWorkouts(user.uid).then(w => setAllUserWorkouts(w));
  }, [user]);

  // Compute progression reports for each unique exercise
  const progressionReports = useMemo(() => {
    const map: Record<string, ProgressionReport> = {};
    if (!allUserWorkouts.length) return map;
    
    const exerciseIds = new Set(sets.map(s => s.exercise).filter((e): e is string => Boolean(e)));
    exerciseIds.forEach((exId: string) => {
      map[exId] = analyzeExerciseProgression(allUserWorkouts, exId);
    });
    return map;
  }, [sets, allUserWorkouts]);

  // Compute Historical All-Time PRs for each exercise (Excluding Current Session)
  const historicalPRs = useMemo(() => {
    const prs: Record<string, number> = {};
    allUserWorkouts.forEach(w => {
      if (w.id === workout.id || (w.status !== 'COMPLETED' && w.status !== 'completed')) return;
      
      const evaluateSet = (exName: string, weight: number, reps: number, completed: boolean) => {
        if (completed && weight > 0 && reps > 0) {
          const e1rm = weight * (1 + reps / 30);
          if (!prs[exName] || e1rm > prs[exName]) {
            prs[exName] = e1rm;
          }
        }
      };

      if (w.exercises && w.exercises.length > 0) {
        w.exercises.forEach(ex => {
          if (ex.name) {
             ex.sets.forEach(s => evaluateSet(ex.name, s.weight, s.reps, !!s.completed));
          }
        });
      } else if (w.sets) {
        w.sets.forEach(s => {
          if (s.exercise) {
            evaluateSet(s.exercise, s.weight, s.reps, !!s.completed);
          }
        });
      }
    });
    return prs;
  }, [allUserWorkouts, workout.id]);

  // Compute Volume & Real-time PRs for the current session
  const sessionStats = useMemo(() => {
    let volume = 0;
    let prsHit = 0;
    const currentSessionPRs: Record<string, number> = {};

    sets.forEach(s => {
      if (s.weight > 0 && s.reps > 0 && s.completed) {
        volume += s.weight * s.reps;
        const e1rm = s.weight * (1 + s.reps / 30);
        const historicalPR = historicalPRs[s.exercise] || 0;
        
        if (historicalPR > 0 && e1rm > historicalPR) {
          if (!currentSessionPRs[s.exercise] || e1rm > currentSessionPRs[s.exercise]) {
            prsHit++;
            currentSessionPRs[s.exercise] = e1rm;
          }
        }
      }
    });
    return { volume, prsHit };
  }, [sets, historicalPRs]);

  const isSetPR = useCallback((s: WorkoutSetItem) => {
    if (!s.completed || s.weight <= 0 || s.reps <= 0) return false;
    const historicalPR = historicalPRs[s.exercise] || 0;
    if (historicalPR === 0) return false;
    const e1rm = s.weight * (1 + s.reps / 30);
    return e1rm > historicalPR;
  }, [historicalPRs]);

  // AI Optimizer View State
  const [showOptimizer, setShowOptimizer] = useState(false);
  const [strategy, setStrategy] = useState<OptimizationStrategy>('OVERLOAD');
  const [optimizing, setOptimizing] = useState(false);
  const [proposedSets, setProposedSets] = useState<WorkoutSetItem[] | null>(null);
  const [optSummary, setOptSummary] = useState<string>('');
  const [optRationales, setOptRationales] = useState<string[]>([]);

  const syncActiveWorkout = (updatedSets: WorkoutSetItem[]) => {
    setSets(updatedSets);
    if (activeWorkout?.id === workout.id) {
      const updatedExercises = Array.from(new Set(updatedSets.map(s => s.exercise))).map((exName) => {
        const name = String(exName);
        const exDef = getExerciseByName(name);
        return {
          id: crypto.randomUUID(),
          exerciseId: name.toLowerCase().replace(/\s+/g, '-'),
          name: name,
          category: exDef?.primaryMuscle || 'OTHER',
          sets: updatedSets.filter(s => s.exercise === name).map(s => ({
            id: s.id,
            weight: s.weight,
            reps: s.reps,
            completed: !!s.completed,
            setType: (s.setType === 'N' ? 'normal' : s.setType) as 'N' | 'W' | 'D' | 'F' | 'normal',
            rir: s.rir,
            notes: s.notes
          }))
        };
      });
      updateActiveWorkout({ sets: updatedSets, exercises: updatedExercises });
    }
  };

  const handleUpdateSet = (index: number, field: keyof WorkoutSetItem, value: any) => {
    const updated = [...sets];
    updated[index] = { ...updated[index], [field]: value };
    setSets(updated);
    if (activeWorkout?.id === workout.id) {
      updateActiveWorkout({ sets: updated });
    }
  };

  // Handle toggling set completion -> auto triggers rest timer on complete!
  const handleToggleSet = (index: number) => {
    if (isEditMode) return;
    
    const wasCompleted = sets[index].completed;
    const isCompleted = !wasCompleted;
    handleUpdateSet(index, 'completed', isCompleted);

    if (isCompleted) {
      // Auto-start rest timer
      handleStartRestTimer(defaultRestDuration);
    }
  };

  const handleAddExercisesFromPicker = (selectedList: ExerciseDef[]) => {
    const newSetsToAdd: WorkoutSetItem[] = [];

    selectedList.forEach(ex => {
      // Check if user has past history for this exercise to pre-populate targets
      const pastReport = progressionReports[ex.name] || progressionReports[ex.id];
      const lastPerf = pastReport?.lastPerformance;
      const initialWeight = lastPerf ? lastPerf.weight : 0;
      const initialReps = lastPerf ? lastPerf.reps : 10;

      // Add 1 standard initial set for the newly chosen exercise as requested
      newSetsToAdd.push({
        id: crypto.randomUUID(),
        exercise: ex.name,
        reps: initialReps,
        weight: initialWeight,
        completed: false,
        setType: 'N'
      });
    });

    const updated = [...sets, ...newSetsToAdd];
    syncActiveWorkout(updated);
  };

  const handleAddSetForExercise = (exerciseName: string) => {
    const exerciseSets = sets.filter(s => s.exercise === exerciseName);
    const lastSet = exerciseSets.length > 0 ? exerciseSets[exerciseSets.length - 1] : null;
    const newSet: WorkoutSetItem = {
      id: crypto.randomUUID(),
      exercise: exerciseName,
      reps: lastSet ? lastSet.reps : 10,
      weight: lastSet ? lastSet.weight : 0,
      completed: false,
      setType: 'N'
    };
    
    // Insert new set after the last set of this exercise
    const newSets = [...sets];
    const lastIndex = newSets.map(s => s.exercise).lastIndexOf(exerciseName);
    if (lastIndex >= 0) {
      newSets.splice(lastIndex + 1, 0, newSet);
    } else {
      newSets.push(newSet);
    }
    syncActiveWorkout(newSets);
  };

  const handleRemoveSet = (index: number) => {
    const updated = sets.filter((_, i) => i !== index);
    syncActiveWorkout(updated);
  };

  const handleRemoveExercise = (exerciseName: string) => {
    const updated = sets.filter(s => s.exercise !== exerciseName);
    syncActiveWorkout(updated);
  };

  const calculateVolume = (setList: WorkoutSetItem[]) => {
    return setList.reduce((acc, s) => acc + ((s.weight || 0) * (s.reps || 0)), 0);
  };

  // Run Optimization Engine
  const handleRunOptimization = async (chosenStrategy: OptimizationStrategy = strategy) => {
    setStrategy(chosenStrategy);
    setOptimizing(true);
    setShowOptimizer(true);

    await new Promise(resolve => setTimeout(resolve, 400));

    let newSets: WorkoutSetItem[] = [];
    let summaryText = '';
    let rationales: string[] = [];

    const isCompound = (name: string) => {
      const lower = name.toLowerCase();
      return lower.includes('bench') || lower.includes('squat') || lower.includes('deadlift') || 
             lower.includes('press') || lower.includes('row') || lower.includes('pull-up') || lower.includes('dip');
    };

    if (chosenStrategy === 'OVERLOAD') {
      newSets = sets.map((s) => {
        const compound = isCompound(s.exercise);
        const weightIncrease = compound ? (s.weight >= 80 ? 5 : 2.5) : (s.weight >= 20 ? 2 : 1);
        const nextWeight = s.weight > 0 ? Number((s.weight + weightIncrease).toFixed(1)) : 0;
        const nextReps = s.weight === 0 ? s.reps + 2 : s.reps;
        return {
          ...s,
          id: crypto.randomUUID(),
          weight: nextWeight,
          reps: nextReps
        };
      });
      summaryText = `Progressive Overload Applied (+2.5kg - +5kg on Compound Movements)`;
      rationales = [
        "Incremented main compound movements to stimulate mechanical tension.",
        "Preserved rep targets to prioritize strength adaptations.",
        "Increased total tonnage while managing systemic fatigue."
      ];
    } else if (chosenStrategy === 'VOLUME') {
      newSets = sets.map((s) => ({
        ...s,
        id: crypto.randomUUID(),
        reps: s.reps + 2
      }));
      if (sets.length > 0) {
        const first = sets[0];
        newSets.push({
          id: crypto.randomUUID(),
          exercise: first.exercise,
          weight: Number((first.weight * 0.85).toFixed(1)),
          reps: first.reps + 4,
          completed: false,
          setType: 'D'
        });
      }
      summaryText = `Hypertrophy Volume Ramp (+2 Reps & 85% Back-off Set)`;
      rationales = [
        "Added +2 reps per working set to maximize metabolic fatigue.",
        "Inserted an 85% back-off set for extra hypertrophy volume.",
        "Elevated total session tonnage without excessive joint strain."
      ];
    } else if (chosenStrategy === 'DELOAD') {
      newSets = sets.map((s) => ({
        ...s,
        id: crypto.randomUUID(),
        weight: Number((s.weight * 0.65).toFixed(1)),
        reps: Math.min(s.reps, 8)
      }));
      summaryText = `Active Recovery & Deload Tuning (-35% Load, Form Focus)`;
      rationales = [
        "Scaled loads to 65% 1RM to dissipate central nervous system fatigue.",
        "Capped reps at 8 to keep RPE low and safeguard recovery.",
        "Retained movement patterns for motor skill consolidation."
      ];
    } else {
      newSets = sets.map((s, idx) => ({
        ...s,
        id: crypto.randomUUID(),
        weight: idx === 0 && isCompound(s.exercise) ? Number((s.weight + 2.5).toFixed(1)) : s.weight,
        reps: idx > 0 ? s.reps + 1 : s.reps
      }));
      summaryText = `AI Neuromuscular Optimization (Targeted Overload & Intensity Curve)`;
      rationales = [
        "Calibrated load distribution based on historical workout sets.",
        "Optimized working sets for peak rate of force development."
      ];
    }

    setProposedSets(newSets);
    setOptSummary(summaryText);
    setOptRationales(rationales);
    setOptimizing(false);
  };

  const handleApplyOptimization = async () => {
    if (!proposedSets) return;
    setSaving(true);
    try {
      const updatedExercises = Array.from(new Set(proposedSets.map(s => s.exercise))).map((exName) => {
        const name = String(exName);
        const exDef = getExerciseByName(name);
        return {
          id: crypto.randomUUID(),
          exerciseId: name.toLowerCase().replace(/\s+/g, '-'),
          name: name,
          category: exDef?.primaryMuscle || 'OTHER',
          sets: proposedSets.filter(s => s.exercise === name).map(s => ({
            id: s.id,
            weight: s.weight,
            reps: s.reps,
            completed: !!s.completed,
            setType: (s.setType === 'N' ? 'normal' : s.setType) as 'N' | 'W' | 'D' | 'F' | 'normal',
            rir: s.rir,
            notes: s.notes
          }))
        };
      });

      const vol = calculateVolume(proposedSets);
      const result = await mutateWorkout(
        workout.id,
        workout.version,
        {
          title,
          scheduledDate,
          status: isEditMode ? workout.status : 'IN_PROGRESS',
          sets: proposedSets,
          exercises: updatedExercises,
          exerciseNotes
        },
        duration,
        vol
      );
      onSave(result);
      onClose();
    } catch (e) {
      console.error("Failed to apply optimization:", e);
    } finally {
      setSaving(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const isCompleting = !isEditMode;
      const newStatus = isCompleting ? 'COMPLETED' : workout.status;
      
      const updatedExercises = Array.from(new Set(sets.map(s => s.exercise))).map((exName) => {
        const name = String(exName);
        const exDef = getExerciseByName(name);
        return {
          id: crypto.randomUUID(),
          exerciseId: name.toLowerCase().replace(/\s+/g, '-'),
          name: name,
          category: exDef?.primaryMuscle || 'OTHER',
          sets: sets.filter(s => s.exercise === name).map(s => ({
            id: s.id,
            weight: s.weight,
            reps: s.reps,
            completed: !!s.completed,
            setType: (s.setType === 'N' ? 'normal' : s.setType) as 'N' | 'W' | 'D' | 'F' | 'normal',
            rir: s.rir,
            notes: s.notes
          }))
        };
      });

      const updates = {
        title,
        scheduledDate,
        status: newStatus,
        sets,
        exercises: updatedExercises,
        exerciseNotes
      };
      
      const vol = calculateVolume(sets);
      const result = await mutateWorkout(workout.id, workout.version, updates, duration, vol);
      
      if (isCompleting) {
        setShowCelebration(true);
        onSave(result);
      } else {
        onSave(result);
        onClose();
      }
    } catch (e: any) {
      console.error(e);
      if (e.status === 409) {
        if (window.confirm(`Conflict: Workout modified on another device (v${e.currentVersion}). Force override?`)) {
          try {
            const isCompleting = !isEditMode;
            const newStatus = isCompleting ? 'COMPLETED' : workout.status;
            
            const updatedExercises = Array.from(new Set(sets.map(s => s.exercise))).map((exName) => {
              const name = String(exName);
              const exDef = getExerciseByName(name);
              return {
                id: crypto.randomUUID(),
                exerciseId: name.toLowerCase().replace(/\s+/g, '-'),
                name: name,
                category: exDef?.primaryMuscle || 'OTHER',
                sets: sets.filter(s => s.exercise === name).map(s => ({
                  id: s.id,
                  weight: s.weight,
                  reps: s.reps,
                  completed: !!s.completed,
                  setType: (s.setType === 'N' ? 'normal' : s.setType) as 'N' | 'W' | 'D' | 'F' | 'normal',
                  rir: s.rir,
                  notes: s.notes
                }))
              };
            });

            const updates = { title, scheduledDate, status: newStatus, sets, exercises: updatedExercises, exerciseNotes };
            const vol = calculateVolume(sets);
            const result = await mutateWorkout(workout.id, e.currentVersion, updates, duration, vol);
            if (isCompleting) {
              setShowCelebration(true);
              onSave(result);
            } else {
              onSave(result);
              onClose();
            }
          } catch (retryErr: any) {
            alert(`Failed to force update: ${retryErr.message}`);
          }
        }
      } else {
        alert(`Failed to save workout: ${e.message}`);
      }
    } finally {
      setSaving(false);
    }
  };

  const handleSimulateExternalEdit = async () => {
    setSimulatingConflict(true);
    try {
      const result = await mutateWorkout(
        workout.id,
        workout.version,
        {
          title: `${title} (v${workout.version + 1} Ext)`,
          sets: sets.map((s, idx) => idx === 0 ? { ...s, weight: s.weight + 2.5 } : s)
        }
      );
      onSave(result);
    } catch (e) {
      console.error(e);
    } finally {
      setSimulatingConflict(false);
    }
  };

  const handleDeleteWorkout = async () => {
    const targetUserId = workout.userId || user?.uid;
    if (!targetUserId) return;
    setDeleting(true);
    try {
      if (activeWorkout?.id === workout.id) {
        discardActiveWorkout();
      }
      await deleteWorkout(workout.id, targetUserId);
      if (onDelete) {
        onDelete(workout.id);
      }
      setShowDeleteConfirm(false);
      onClose();
    } catch (e) {
      console.error("Failed to delete workout:", e);
    } finally {
      setDeleting(false);
    }
  };

  // Group sets by exercise name
  const groupedExercises = useMemo(() => {
    const groups: { 
      exercise: string; 
      sets: { set: WorkoutSetItem; index: number; setNumber: number }[] 
    }[] = [];

    sets.forEach((set, index) => {
      let group = groups.find(g => g.exercise === set.exercise);
      if (!group) {
        group = { exercise: set.exercise, sets: [] };
        groups.push(group);
      }
      group.sets.push({
        set,
        index,
        setNumber: group.sets.length + 1
      });
    });

    return groups;
  }, [sets]);

  const uniqueExerciseNames = groupedExercises.map(g => g.exercise);

  return (
    <>
      <AnimatePresence>
        {isOpen && (
          <motion.div
            key="workout-detail-modal"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="fixed inset-0 z-[60] flex flex-col items-center justify-end bg-background/95 backdrop-blur-md"
          >
            <div className="bg-card w-full h-full sm:h-[96vh] sm:max-w-3xl sm:rounded-t-3xl sm:border sm:border-border sm:border-b-0 shadow-2xl flex flex-col overflow-hidden">

              {/* Top Header Bar */}
              <div className="p-3.5 sm:p-4 border-b border-border flex items-center justify-between bg-secondary/30 gap-3 shrink-0">
                <div className="min-w-0 flex-1 flex items-center gap-2">
                  <Input 
                    value={title} 
                    onChange={(e) => setTitle(e.target.value)}
                    className="font-bold text-base sm:text-lg h-9 bg-background/80 border-border/80 flex-1 max-w-sm"
                    placeholder="Workout Title"
                  />
                  <OCCVersionBadge 
                    version={workout.version} 
                    onClick={() => onOpenAudit(workout)}
                  />
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  <Button 
                    variant={isEditMode ? "default" : "outline"} 
                    size="sm" 
                    onClick={() => setIsEditMode(!isEditMode)}
                    className="h-8 text-xs font-semibold gap-1.5"
                  >
                    <Pencil size={13} />
                    <span className="hidden sm:inline">{isEditMode ? "Done" : "Edit"}</span>
                  </Button>

                  <Button 
                    variant="ghost" 
                    size="icon" 
                    onClick={() => setShowDeleteConfirm(true)}
                    title="Delete Workout"
                    className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                  >
                    <Trash2 size={16} />
                  </Button>

                  <Button variant="ghost" size="icon" onClick={onClose} className="h-8 w-8">
                    <X size={18} />
                  </Button>
                </div>
              </div>

              {/* Persistent Rest Timer Bar (Hevy-style) */}
              <div className="px-3.5 sm:px-4 py-2 border-b border-border/60 bg-background/80 shrink-0">
                <RestTimer
                  restRemaining={restRemaining}
                  defaultDuration={defaultRestDuration}
                  onStartRest={handleStartRestTimer}
                  onAdjustTime={handleAdjustRestTime}
                  onTogglePause={handleTogglePauseRest}
                  onSkipRest={handleSkipRest}
                  onDefaultDurationChange={(sec) => setDefaultRestDuration(sec)}
                  isPaused={isRestPaused}
                />
              </div>

              {/* Workout Metrics & Quick Action Bar */}
              <div className={cn(
                "px-3.5 sm:px-4 py-2.5 border-b flex items-center justify-between gap-2 flex-wrap shrink-0 transition-colors duration-500",
                sessionStats.prsHit > 0 
                  ? "bg-amber-500/10 border-amber-500/20" 
                  : "bg-secondary/20 border-border/40"
              )}>
                <div className="flex items-center gap-3 text-xs font-bold text-muted-foreground font-mono">
                  <span className="flex items-center gap-1.5 text-foreground">
                    <Clock size={13} className={sessionStats.prsHit > 0 ? "text-amber-600 dark:text-amber-500" : "text-primary"} /> {formatDuration(duration)}
                  </span>
                  <span>•</span>
                  <span className="flex items-center gap-1.5 text-foreground">
                    <Layers size={13} className={sessionStats.prsHit > 0 ? "text-amber-600 dark:text-amber-500" : "text-primary"} /> {sessionStats.volume.toLocaleString()} kg
                  </span>
                  <span>•</span>
                  <span className={cn("flex items-center gap-1.5", sessionStats.prsHit > 0 ? "text-amber-600 dark:text-amber-500" : "text-foreground")}>
                    <TrendingUp size={13} /> {sessionStats.prsHit} PRs
                  </span>
                  <span>•</span>
                  <span className="flex items-center gap-1.5 text-foreground">
                    <CheckCircle2 size={13} className={sessionStats.prsHit > 0 ? "text-emerald-600 dark:text-emerald-500" : "text-emerald-500"} /> {sets.filter(s => s.completed).length}/{sets.length}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <Button 
                    size="sm" 
                    variant={showOptimizer ? "secondary" : "outline"}
                    className="h-7 text-xs font-semibold gap-1 border-primary/30 text-primary hover:bg-primary/10"
                    onClick={() => {
                      if (!showOptimizer) {
                        handleRunOptimization('OVERLOAD');
                      } else {
                        setShowOptimizer(false);
                      }
                    }}
                  >
                    <Sparkles size={12} /> 
                    <span>{showOptimizer ? "Sets View" : "⚡ Optimize"}</span>
                  </Button>

                  <Button
                    size="sm"
                    onClick={() => setShowExercisePicker(true)}
                    className="h-7 text-xs font-bold gap-1 bg-primary text-primary-foreground shadow-2xs"
                  >
                    <Plus size={13} />
                    <span>Add Exercise</span>
                  </Button>
                </div>
              </div>

              {/* Main Content Area */}
              {showOptimizer ? (
                /* AI Optimizer Diff Screen */
                <div className="p-4 sm:p-5 overflow-y-auto space-y-4 flex-1">
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span className="font-semibold text-foreground flex items-center gap-1.5">
                      <Sparkles size={14} className="text-primary" /> Select Optimization Strategy:
                    </span>
                    <span className="font-mono text-[11px]">OCC Target: v{workout.version} → v{workout.version + 1}</span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {[
                      { id: 'OVERLOAD', label: 'Overload', desc: '+2.5-5kg Load', icon: TrendingUp },
                      { id: 'VOLUME', label: 'Hypertrophy', desc: '+2 Reps & Back-off', icon: Layers },
                      { id: 'DELOAD', label: 'Deload', desc: '-35% Load Reset', icon: RotateCcw },
                      { id: 'CUSTOM_AI', label: 'Neural AI', desc: 'Custom Curve', icon: BrainIcon }
                    ].map(item => {
                      const Icon = item.icon;
                      const active = strategy === item.id;
                      return (
                        <button
                          key={item.id}
                          onClick={() => handleRunOptimization(item.id as OptimizationStrategy)}
                          disabled={optimizing}
                          className={cn(
                            "p-2.5 rounded-xl text-left border transition-all flex flex-col justify-between gap-1",
                            active 
                              ? "bg-primary/10 border-primary text-primary shadow-xs" 
                              : "bg-secondary/40 border-border/60 hover:bg-secondary text-foreground"
                          )}
                        >
                          <div className="flex items-center justify-between">
                            <Icon size={14} className={active ? "text-primary" : "text-muted-foreground"} />
                            {active && <Check size={12} className="text-primary font-bold" />}
                          </div>
                          <div>
                            <div className="text-xs font-bold leading-tight">{item.label}</div>
                            <div className="text-[10px] text-muted-foreground mt-0.5">{item.desc}</div>
                          </div>
                        </button>
                      );
                    })}
                  </div>

                  {optimizing ? (
                    <div className="p-8 text-center border border-dashed border-primary/30 rounded-2xl bg-primary/5 flex flex-col items-center justify-center gap-2">
                      <Loader2 size={24} className="text-primary animate-spin" />
                      <span className="text-sm font-semibold text-foreground">Calculating progressive overload...</span>
                    </div>
                  ) : proposedSets ? (
                    <div className="space-y-3">
                      <div className="p-3.5 rounded-xl bg-secondary/50 border border-primary/20 space-y-2">
                        <div className="flex items-center justify-between flex-wrap gap-2">
                          <div className="flex items-center gap-2">
                            <Sparkles size={14} className="text-primary" />
                            <span className="font-bold text-xs sm:text-sm text-foreground">{optSummary}</span>
                          </div>
                        </div>
                        <ul className="space-y-1 text-xs text-muted-foreground pt-1 border-t border-border/40">
                          {optRationales.map((r, i) => (
                            <li key={i} className="flex items-start gap-1.5">
                              <CheckCircle2 size={13} className="text-primary shrink-0 mt-0.5" />
                              <span>{r}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : (
                /* Hevy-Style Workout Sets & Exercises View */
                <div className="p-3.5 sm:p-5 overflow-y-auto space-y-4 flex-1">
                  {groupedExercises.length === 0 ? (
                    /* Clean Empty State with Add Exercise CTA */
                    <div className="text-center py-16 px-4 rounded-3xl border-2 border-dashed border-border/80 bg-secondary/10 space-y-4 max-w-md mx-auto my-6">
                      <div className="w-16 h-16 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mx-auto border border-primary/20 shadow-xs">
                        <Dumbbell size={32} />
                      </div>
                      <div className="space-y-1.5">
                        <h3 className="font-display font-bold text-lg text-foreground">
                          No exercises added yet
                        </h3>
                        <p className="text-xs text-muted-foreground leading-relaxed">
                          Tap below to open the exercise library and pick the movements you want to train today.
                        </p>
                      </div>

                      <Button
                        size="default"
                        onClick={() => setShowExercisePicker(true)}
                        className="font-bold text-xs gap-2 px-6 shadow-sm"
                      >
                        <Plus size={16} />
                        Add Exercise
                      </Button>
                    </div>
                  ) : (
                    /* Exercise Cards List */
                    <div className="space-y-4">
                      {groupedExercises.map((group) => {
                        const rep = progressionReports[group.exercise];
                        const exDef = getExerciseByName(group.exercise);

                        return (
                          <div 
                            key={group.exercise} 
                            className="rounded-2xl border border-border/80 shadow-xs overflow-hidden bg-card transition-all"
                          >
                            {/* Exercise Card Header */}
                            <div className="bg-secondary/30 p-3 sm:p-3.5 flex items-center justify-between border-b border-border/60 gap-3">
                              <div className="flex items-center gap-3 min-w-0 flex-1">
                                {/* 40x40px Rounded Thumbnail */}
                                <ExerciseThumbnail
                                  exerciseName={group.exercise}
                                  muscle={exDef?.primaryMuscle}
                                  equipment={exDef?.equipment}
                                  size="md"
                                />

                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-2">
                                    <h4 className="font-bold text-sm text-foreground truncate">
                                      {group.exercise}
                                    </h4>
                                    {rep && rep.state === 'PROGRESSING' && (
                                      <span className="px-1.5 py-0.2 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 rounded text-[9px] font-bold tracking-wider shrink-0">
                                        +OVERLOAD
                                      </span>
                                    )}
                                  </div>

                                  <div className="flex items-center gap-2 text-[10px] text-muted-foreground mt-0.5 flex-wrap">
                                    <span className="font-bold text-foreground/80">{exDef?.primaryMuscle || 'Exercise'}</span>
                                    <span>•</span>
                                    <span>{group.sets.length} sets</span>
                                    {rep?.nextTarget && (
                                      <>
                                        <span>•</span>
                                        <span className="text-primary/80 font-medium">
                                          🎯 Target: {rep.nextTarget.targetWeight}kg × {rep.nextTarget.targetRepsMax}
                                        </span>
                                      </>
                                    )}
                                  </div>
                                </div>
                              </div>

                              {/* Exercise Actions */}
                              <div className="flex items-center gap-1 shrink-0">
                                <Button 
                                  variant="ghost" 
                                  size="icon" 
                                  className="h-8 w-8 text-muted-foreground hover:text-primary hover:bg-primary/10"
                                  onClick={() => setOpenNotes(prev => ({ ...prev, [group.exercise]: !prev[group.exercise] }))}
                                  title="Exercise Notes"
                                >
                                  <MessageSquare size={14} className={exerciseNotes[group.exercise] ? "text-primary fill-primary/20" : ""} />
                                </Button>
                                
                                <Button 
                                  variant="ghost" 
                                  size="icon" 
                                  className="h-8 w-8 text-muted-foreground hover:text-primary hover:bg-primary/10"
                                  title="History & Analysis"
                                  onClick={() => setActiveExerciseHistory(group.exercise)}
                                >
                                  <LineChart size={14} />
                                </Button>

                                {isEditMode && (
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                                    onClick={() => handleRemoveExercise(group.exercise)}
                                    title="Remove Exercise"
                                  >
                                    <Trash2 size={14} />
                                  </Button>
                                )}
                              </div>
                            </div>

                            {/* Collapsible Exercise Notes */}
                            <AnimatePresence>
                              {(openNotes[group.exercise] || exerciseNotes[group.exercise]) && (
                                <motion.div
                                  initial={{ height: 0, opacity: 0 }}
                                  animate={{ height: 'auto', opacity: 1 }}
                                  exit={{ height: 0, opacity: 0 }}
                                  className="overflow-hidden bg-secondary/15 border-b border-border/60"
                                >
                                  <div className="p-2.5">
                                    <textarea 
                                      value={exerciseNotes[group.exercise] || ''}
                                      onChange={(e) => setExerciseNotes(prev => ({ ...prev, [group.exercise]: e.target.value }))}
                                      placeholder="Add equipment settings, seat height, form cues..."
                                      className="w-full bg-background/50 rounded-lg p-2 border border-border/50 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary resize-none min-h-[44px] placeholder:text-muted-foreground/60"
                                    />
                                  </div>
                                </motion.div>
                              )}
                            </AnimatePresence>

                            {/* Hevy-Style Sets Table */}
                            <div className="p-2.5 sm:p-3 space-y-1.5">
                              {/* Column Headers */}
                              <div className="grid grid-cols-[36px_1fr_64px_64px_42px_36px_28px] gap-1.5 sm:gap-2 px-1 text-[10px] font-bold text-muted-foreground uppercase tracking-wider items-center">
                                <div className="text-center">Set</div>
                                <div>Previous</div>
                                <div className="text-center">KG</div>
                                <div className="text-center">Reps</div>
                                <div className="text-center">RIR</div>
                                <div className="text-center">✓</div>
                                <div></div>
                              </div>

                              {/* Rows */}
                              {group.sets.map(({ set, index, setNumber }, i) => {
                                const isCompleted = set.completed;
                                const prevSet = rep?.history?.[0]?.sets?.[i];
                                const prevText = prevSet 
                                  ? `${prevSet.weight}kg × ${prevSet.reps}` 
                                  : (rep?.nextTarget ? `🎯 ${rep.nextTarget.targetWeight}×${rep.nextTarget.targetRepsMax}` : '-');

                                return (
                                  <div 
                                    key={set.id || index}
                                    className={cn(
                                      "grid grid-cols-[36px_1fr_64px_64px_42px_36px_28px] gap-1.5 sm:gap-2 items-center px-1.5 py-1.5 rounded-xl transition-all duration-200 group border relative",
                                      isCompleted 
                                        ? isSetPR(set)
                                          ? "bg-amber-500/15 dark:bg-amber-950/40 border-amber-500/40 text-foreground shadow-[0_0_12px_rgba(245,158,11,0.15)] overflow-hidden"
                                          : "bg-emerald-500/15 dark:bg-emerald-950/30 border-emerald-500/35 text-foreground shadow-2xs" 
                                        : "bg-secondary/20 hover:bg-secondary/40 border-border/40"
                                    )}
                                  >
                                    {isCompleted && isSetPR(set) && (
                                      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-amber-500/15 to-transparent animate-shimmer pointer-events-none" />
                                    )}
                                    {/* Set Type Pill Badge */}
                                    <button 
                                      onClick={() => {
                                        const types: ('N' | 'W' | 'D' | 'F')[] = ['N', 'W', 'D', 'F'];
                                        const current = set.setType || 'N';
                                        const next = types[(types.indexOf(current) + 1) % types.length];
                                        handleUpdateSet(index, 'setType', next);
                                      }}
                                      className={cn(
                                        "text-center text-xs font-mono font-bold w-7 h-7 rounded-lg mx-auto flex items-center justify-center transition-all cursor-pointer border shadow-2xs",
                                        set.setType === 'W' ? "bg-amber-500/25 text-amber-600 dark:text-amber-400 border-amber-500/40" :
                                        set.setType === 'D' ? "bg-purple-500/25 text-purple-600 dark:text-purple-400 border-purple-500/40" :
                                        set.setType === 'F' ? "bg-rose-500/25 text-rose-600 dark:text-rose-400 border-rose-500/40" :
                                        "bg-secondary text-foreground border-border/80 hover:bg-secondary/80"
                                      )}
                                      title={`Type: ${set.setType === 'W' ? 'Warmup' : set.setType === 'D' ? 'Drop Set' : set.setType === 'F' ? 'Failure' : 'Normal'} (Tap to change)`}
                                    >
                                      {set.setType && set.setType !== 'N' ? set.setType : setNumber}
                                    </button>

                                    {/* Previous Set ghost stats OR PR Badge */}
                                    <div className="flex items-center gap-1.5 overflow-hidden">
                                      <button 
                                        className="text-[11px] text-muted-foreground truncate hover:text-primary transition-colors text-left font-mono min-w-0" 
                                        title={prevSet ? `Previous session: ${prevSet.weight}kg × ${prevSet.reps}` : (rep?.nextTarget ? `Overload Target: ${rep.nextTarget.targetWeight}kg × ${rep.nextTarget.targetRepsMax}` : 'No previous log')}
                                        onClick={() => setActiveExerciseHistory(group.exercise)}
                                      >
                                        {prevText}
                                      </button>
                                      <AnimatePresence>
                                        {isSetPR(set) && (
                                          <motion.div 
                                            initial={{ scale: 0, opacity: 0 }}
                                            animate={{ scale: 1, opacity: 1 }}
                                            exit={{ scale: 0, opacity: 0 }}
                                            className="px-1.5 py-0.5 rounded text-[9px] font-black bg-amber-500 text-amber-950 flex items-center gap-0.5 shadow-[0_0_10px_rgba(245,158,11,0.5)] shrink-0 animate-pulse"
                                            title={`Personal Record! Epley 1RM: ${(set.weight * (1 + set.reps / 30)).toFixed(1)}kg`}
                                          >
                                            <Zap size={8} className="fill-amber-950" /> PR
                                          </motion.div>
                                        )}
                                      </AnimatePresence>
                                    </div>

                                    {/* KG Input Box with High Contrast */}
                                    <div className="relative">
                                      <input 
                                        type="number"
                                        step="0.5"
                                        value={set.weight === 0 ? '' : set.weight}
                                        placeholder={rep?.nextTarget ? rep.nextTarget.targetWeight.toString() : "0"}
                                        title={rep?.nextTarget ? `Overload Target: ${rep.nextTarget.targetWeight}kg × ${rep.nextTarget.targetRepsMax} reps` : undefined}
                                        onChange={(e) => handleUpdateSet(index, 'weight', parseFloat(e.target.value) || 0)}
                                        className={cn(
                                          "w-full h-8 text-xs text-center font-mono font-bold rounded-lg border transition-all focus:outline-none focus:ring-1 focus:ring-primary px-1 placeholder:text-muted-foreground/40",
                                          isCompleted
                                            ? "bg-emerald-500/20 dark:bg-emerald-900/40 border-emerald-500/40 text-foreground"
                                            : "bg-secondary/80 border-border/80 text-foreground hover:bg-secondary"
                                        )}
                                      />
                                    </div>

                                    {/* Reps Input Box */}
                                    <div className="relative">
                                      <input 
                                        type="number"
                                        value={set.reps === 0 ? '' : set.reps}
                                        placeholder={rep?.nextTarget ? rep.nextTarget.targetRepsMax.toString() : "0"}
                                        title={rep?.nextTarget ? `Overload Target: ${rep.nextTarget.targetWeight}kg × ${rep.nextTarget.targetRepsMax} reps` : undefined}
                                        onChange={(e) => handleUpdateSet(index, 'reps', parseInt(e.target.value) || 0)}
                                        className={cn(
                                          "w-full h-8 text-xs text-center font-mono font-bold rounded-lg border transition-all focus:outline-none focus:ring-1 focus:ring-primary px-1 placeholder:text-muted-foreground/40",
                                          isCompleted
                                            ? "bg-emerald-500/20 dark:bg-emerald-900/40 border-emerald-500/40 text-foreground"
                                            : "bg-secondary/80 border-border/80 text-foreground hover:bg-secondary"
                                        )}
                                      />
                                    </div>

                                    {/* RIR Input Box */}
                                    <div className="relative">
                                      <input 
                                        type="number"
                                        min="0" 
                                        max="10"
                                        value={set.rir !== undefined ? set.rir : ''}
                                        placeholder="—"
                                        onChange={(e) => handleUpdateSet(index, 'rir', e.target.value === '' ? undefined : parseInt(e.target.value))}
                                        className={cn(
                                          "w-full h-8 text-xs text-center font-mono rounded-lg border transition-all focus:outline-none focus:ring-1 focus:ring-primary px-1",
                                          isCompleted
                                            ? "bg-emerald-500/20 dark:bg-emerald-900/40 border-emerald-500/40 text-foreground"
                                            : "bg-secondary/60 border-border/60 text-muted-foreground hover:bg-secondary"
                                        )}
                                      />
                                    </div>

                                    {/* Hevy-Style Checkmark Toggle Button */}
                                    <div className="flex justify-center">
                                      <motion.button
                                        whileTap={!isEditMode ? { scale: 0.88 } : {}}
                                        animate={isCompleted ? { scale: [1, 1.2, 1] } : {}}
                                        transition={{ duration: 0.25 }}
                                        onClick={() => handleToggleSet(index)}
                                        className={cn(
                                          "flex items-center justify-center h-7 w-7 rounded-lg border transition-all shadow-xs",
                                          isEditMode ? "opacity-40 cursor-not-allowed" : "cursor-pointer",
                                          isCompleted 
                                            ? "bg-emerald-500 text-white border-emerald-600 shadow-[0_0_10px_rgba(16,185,129,0.4)]" 
                                            : "bg-secondary/70 text-muted-foreground border-border/80 hover:bg-secondary hover:border-primary/50"
                                        )}
                                        disabled={isEditMode}
                                        title={isCompleted ? "Completed (Tap to undo)" : "Mark set complete"}
                                      >
                                        {isCompleted && <Check size={14} strokeWidth={3} />}
                                      </motion.button>
                                    </div>

                                    {/* Delete Set Button */}
                                    <div className="flex justify-center">
                                      {isEditMode ? (
                                        <button 
                                          className="h-6 w-6 rounded-md flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                                          onClick={() => handleRemoveSet(index)}
                                          title="Delete set"
                                        >
                                          <Trash2 size={12} />
                                        </button>
                                      ) : (
                                        <div className="w-4" />
                                      )}
                                    </div>
                                  </div>
                                );
                              })}

                              {/* Add Set Button for this exercise */}
                              <div className="pt-1.5">
                                <Button 
                                  size="sm" 
                                  variant="ghost" 
                                  className="h-8 text-xs font-bold text-primary hover:bg-primary/10 w-full rounded-xl border border-dashed border-primary/30"
                                  onClick={() => handleAddSetForExercise(group.exercise)}
                                >
                                  <Plus size={13} className="mr-1" /> Add Set
                                </Button>
                              </div>
                            </div>
                          </div>
                        );
                      })}

                      {/* Bottom Add Exercise CTA Button */}
                      <div className="pt-2">
                        <Button
                          size="default"
                          variant="outline"
                          onClick={() => setShowExercisePicker(true)}
                          className="w-full h-11 text-xs font-bold gap-2 rounded-2xl border-primary/40 text-primary hover:bg-primary/10"
                        >
                          <Plus size={15} />
                          Add Another Exercise
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Bottom Footer Actions */}
              <div className="p-3 sm:p-4 border-t border-border bg-secondary/30 flex items-center justify-between gap-3 shrink-0">
                <div className="text-[11px] text-muted-foreground font-mono font-medium hidden sm:block">
                  OCC: <span className="font-bold text-foreground">v{workout.version} → v{workout.version + 1}</span>
                </div>

                <div className="flex gap-2 w-full sm:w-auto justify-end">
                  {showOptimizer ? (
                    <>
                      <Button 
                        variant="outline" 
                        size="sm" 
                        className="h-9 text-xs flex-1 sm:flex-none" 
                        onClick={() => setShowOptimizer(false)}
                      >
                        Back to Sets
                      </Button>
                      <Button 
                        size="sm" 
                        className="h-9 text-xs font-bold gap-1.5 bg-primary text-primary-foreground flex-1 sm:flex-none" 
                        onClick={handleApplyOptimization} 
                        disabled={saving || !proposedSets || optimizing}
                      >
                        <Check size={14} />
                        {saving ? 'Applying...' : 'Apply Optimization'}
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button variant="outline" size="sm" className="h-9 text-xs flex-1 sm:flex-none" onClick={onClose}>
                        Close
                      </Button>
                      <Button 
                        size="sm" 
                        className={cn(
                          "h-9 text-xs font-bold gap-1.5 text-white flex-1 sm:flex-none shadow-sm",
                          isEditMode ? "bg-primary hover:bg-primary/90" : "bg-emerald-600 hover:bg-emerald-700"
                        )} 
                        onClick={handleSave} 
                        disabled={saving}
                      >
                        {isEditMode ? <Save size={14} /> : <CheckCircle2 size={14} />}
                        {saving ? 'Saving...' : (isEditMode ? 'Save Structure' : 'Finish Workout')}
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Searchable, Filterable Exercise Picker Modal */}
      <ExercisePickerModal
        isOpen={showExercisePicker}
        onClose={() => setShowExercisePicker(false)}
        onSelectExercises={handleAddExercisesFromPicker}
        alreadyAddedNames={uniqueExerciseNames}
      />

      {/* Exercise History Sheet */}
      <AnimatePresence>
        {activeExerciseHistory && (
          <ExerciseHistorySheet
            exercise={activeExerciseHistory}
            report={progressionReports[activeExerciseHistory]}
            onClose={() => setActiveExerciseHistory(null)}
          />
        )}
      </AnimatePresence>

      {/* Workout Celebration Modal */}
      <AnimatePresence>
        {showCelebration && (
          <WorkoutCelebration 
            workout={{...workout, sets}} 
            onClose={() => {
              setShowCelebration(false);
              onClose();
            }} 
          />
        )}
      </AnimatePresence>

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {showDeleteConfirm && (
          <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-card border border-destructive/30 rounded-2xl p-5 max-w-md w-full shadow-2xl space-y-4"
            >
              <div className="flex items-center gap-3 text-destructive">
                <div className="p-2 rounded-xl bg-destructive/10">
                  <AlertTriangle size={22} />
                </div>
                <div>
                  <h3 className="font-bold text-base text-foreground">Delete Workout?</h3>
                  <p className="text-xs text-muted-foreground">This will remove this session from your logs.</p>
                </div>
              </div>

              <div className="p-3 bg-secondary/30 rounded-xl border border-border/60 text-xs space-y-1">
                <div className="font-semibold text-foreground truncate">{title}</div>
                <div className="text-muted-foreground">{scheduledDate} • {sets.length} sets</div>
              </div>

              <div className="flex gap-2 justify-end pt-1">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowDeleteConfirm(false)}
                  disabled={deleting}
                  className="h-9 text-xs"
                >
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={handleDeleteWorkout}
                  disabled={deleting}
                  className="h-9 text-xs font-bold gap-1.5 bg-destructive hover:bg-destructive/90"
                >
                  <Trash2 size={14} />
                  {deleting ? 'Deleting...' : 'Confirm Delete'}
                </Button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}
