import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/Card';
import { Button } from './ui/Button';
import { Workout } from '../types';
import { EXERCISE_DATABASE, MuscleGroup } from '../lib/exercises';
import { soundFx } from '../lib/soundFx';
import { 
  Flame, 
  Layers, 
  RotateCw, 
  Target, 
  Zap, 
  Activity, 
  ChevronRight,
  ShieldCheck,
  Dumbbell
} from 'lucide-react';
import { cn } from '../lib/utils';
import { useNavigate } from 'react-router-dom';

interface DashboardMuscleHeatmapProps {
  workouts?: Workout[];
  todayWorkout?: Workout | null;
  className?: string;
}

type MuscleKey = 
  | 'chest' 
  | 'front_delts' 
  | 'rear_delts' 
  | 'biceps' 
  | 'triceps' 
  | 'forearms' 
  | 'abs' 
  | 'obliques' 
  | 'lats' 
  | 'traps' 
  | 'lower_back' 
  | 'glutes' 
  | 'quads' 
  | 'hamstrings' 
  | 'calves';

interface MuscleInfo {
  key: MuscleKey;
  label: string;
  group: MuscleGroup;
  primaryIn: ('PUSH' | 'PULL' | 'LEGS')[];
  view: 'front' | 'back' | 'both';
  recommendedExercises: string[];
}

const MUSCLE_REGISTRY: Record<MuscleKey, MuscleInfo> = {
  chest: {
    key: 'chest',
    label: 'Pectorals (Chest)',
    group: 'CHEST',
    primaryIn: ['PUSH'],
    view: 'front',
    recommendedExercises: ['Barbell Bench Press', 'Incline Dumbbell Press', 'Cable Flyes']
  },
  front_delts: {
    key: 'front_delts',
    label: 'Anterior Deltoids',
    group: 'SHOULDERS',
    primaryIn: ['PUSH'],
    view: 'front',
    recommendedExercises: ['Overhead Press', 'Dumbbell Shoulder Press', 'Lateral Raises']
  },
  rear_delts: {
    key: 'rear_delts',
    label: 'Posterior Deltoids',
    group: 'SHOULDERS',
    primaryIn: ['PULL'],
    view: 'back',
    recommendedExercises: ['Face Pulls', 'Reverse Pec Deck', 'Bent-Over Dumbbell Flyes']
  },
  biceps: {
    key: 'biceps',
    label: 'Biceps Brachii',
    group: 'ARMS',
    primaryIn: ['PULL'],
    view: 'front',
    recommendedExercises: ['Barbell Curl', 'Incline Dumbbell Curl', 'Hammer Curls']
  },
  triceps: {
    key: 'triceps',
    label: 'Triceps Brachii',
    group: 'ARMS',
    primaryIn: ['PUSH'],
    view: 'back',
    recommendedExercises: ['Tricep Rope Pushdowns', 'Skull Crushers', 'Close-Grip Bench Press']
  },
  forearms: {
    key: 'forearms',
    label: 'Forearms & Grip',
    group: 'ARMS',
    primaryIn: ['PULL'],
    view: 'both',
    recommendedExercises: ['Farmer Walks', 'Reverse Grip Curls', 'Dead Hangs']
  },
  abs: {
    key: 'abs',
    label: 'Rectus Abdominis (Abs)',
    group: 'CORE',
    primaryIn: ['PUSH', 'PULL', 'LEGS'],
    view: 'front',
    recommendedExercises: ['Hanging Leg Raises', 'Cable Crunches', 'Ab Wheel Rollouts']
  },
  obliques: {
    key: 'obliques',
    label: 'Internal/External Obliques',
    group: 'CORE',
    primaryIn: ['PUSH', 'PULL', 'LEGS'],
    view: 'front',
    recommendedExercises: ['Pallof Press', 'Woodchoppers', 'Side Planks']
  },
  lats: {
    key: 'lats',
    label: 'Latissimus Dorsi (Lats)',
    group: 'BACK',
    primaryIn: ['PULL'],
    view: 'back',
    recommendedExercises: ['Lat Pulldowns', 'Barbell Rows', 'Pull-Ups / Chin-Ups']
  },
  traps: {
    key: 'traps',
    label: 'Trapezius & Upper Back',
    group: 'BACK',
    primaryIn: ['PULL'],
    view: 'back',
    recommendedExercises: ['Barbell Shrugs', 'Chest-Supported Row', 'Rack Pulls']
  },
  lower_back: {
    key: 'lower_back',
    label: 'Erector Spinae',
    group: 'BACK',
    primaryIn: ['PULL', 'LEGS'],
    view: 'back',
    recommendedExercises: ['Romanian Deadlift', 'Back Extensions', 'Good Mornings']
  },
  glutes: {
    key: 'glutes',
    label: 'Gluteus Maximus',
    group: 'LEGS',
    primaryIn: ['LEGS'],
    view: 'back',
    recommendedExercises: ['Barbell Hip Thrust', 'Bulgarian Split Squats', 'Sumo Deadlifts']
  },
  quads: {
    key: 'quads',
    label: 'Quadriceps',
    group: 'LEGS',
    primaryIn: ['LEGS'],
    view: 'front',
    recommendedExercises: ['Barbell Back Squat', 'Leg Press', 'Walking Lunges', 'Leg Extensions']
  },
  hamstrings: {
    key: 'hamstrings',
    label: 'Hamstrings',
    group: 'LEGS',
    primaryIn: ['LEGS'],
    view: 'back',
    recommendedExercises: ['Lying Leg Curl', 'Romanian Deadlift', 'Nordic Curls']
  },
  calves: {
    key: 'calves',
    label: 'Gastrocnemius & Soleus',
    group: 'LEGS',
    primaryIn: ['LEGS'],
    view: 'both',
    recommendedExercises: ['Standing Calf Raises', 'Seated Calf Raises']
  }
};

type SplitFilter = 'AUTO' | 'PUSH' | 'PULL' | 'LEGS' | 'WEEKLY';

export function DashboardMuscleHeatmap({
  workouts = [],
  todayWorkout,
  className
}: DashboardMuscleHeatmapProps) {
  const navigate = useNavigate();
  const [view, setView] = useState<'front' | 'back'>('front');
  const [selectedSplit, setSelectedSplit] = useState<SplitFilter>('AUTO');
  const [selectedMuscle, setSelectedMuscle] = useState<MuscleKey>('chest');

  // Compute weekly volume per muscle key based on real workouts
  const weeklyLoad = useMemo(() => {
    const counts: Record<MuscleKey, number> = {
      chest: 0,
      front_delts: 0,
      rear_delts: 0,
      biceps: 0,
      triceps: 0,
      forearms: 0,
      abs: 0,
      obliques: 0,
      lats: 0,
      traps: 0,
      lower_back: 0,
      glutes: 0,
      quads: 0,
      hamstrings: 0,
      calves: 0
    };

    const oneWeekAgo = Date.now() - 7 * 24 * 3600 * 1000;
    workouts.forEach((w) => {
      const isDone = w.status === 'COMPLETED' || w.status === 'completed';
      if (!isDone) return;
      const ts = w.completedAt || (w.scheduledDate ? new Date(w.scheduledDate).getTime() : 0);
      if (ts < oneWeekAgo) return;

      (w.exercises || []).forEach((ex) => {
        const def = EXERCISE_DATABASE.find(e => e.id === ex.exerciseId || e.name.toLowerCase() === ex.exerciseId.toLowerCase());
        const setsCount = (ex.sets || []).filter(s => s.completed !== false && s.reps > 0).length || 3;
        
        if (!def) return;
        const group = def.primaryMuscle;
        if (group === 'CHEST') counts.chest += setsCount;
        if (group === 'BACK') {
          counts.lats += Math.ceil(setsCount * 0.7);
          counts.traps += Math.ceil(setsCount * 0.4);
        }
        if (group === 'SHOULDERS') {
          counts.front_delts += Math.ceil(setsCount * 0.6);
          counts.rear_delts += Math.ceil(setsCount * 0.4);
        }
        if (group === 'ARMS') {
          counts.biceps += Math.ceil(setsCount * 0.5);
          counts.triceps += Math.ceil(setsCount * 0.5);
        }
        if (group === 'LEGS') {
          counts.quads += Math.ceil(setsCount * 0.5);
          counts.hamstrings += Math.ceil(setsCount * 0.3);
          counts.glutes += Math.ceil(setsCount * 0.3);
        }
        if (group === 'CORE') {
          counts.abs += setsCount;
        }
      });
    });

    return counts;
  }, [workouts]);

  // Determine active target muscles based on filter or today's session
  const activeTargets = useMemo(() => {
    const targets = new Set<MuscleKey>();

    if (selectedSplit === 'PUSH') {
      targets.add('chest');
      targets.add('front_delts');
      targets.add('triceps');
      targets.add('abs');
      return targets;
    }

    if (selectedSplit === 'PULL') {
      targets.add('lats');
      targets.add('traps');
      targets.add('rear_delts');
      targets.add('biceps');
      targets.add('forearms');
      return targets;
    }

    if (selectedSplit === 'LEGS') {
      targets.add('quads');
      targets.add('hamstrings');
      targets.add('glutes');
      targets.add('calves');
      targets.add('lower_back');
      return targets;
    }

    if (selectedSplit === 'WEEKLY') {
      // Highlight muscles that have been trained this week
      (Object.keys(weeklyLoad) as MuscleKey[]).forEach((key) => {
        if (weeklyLoad[key] > 0) targets.add(key);
      });
      return targets;
    }

    // AUTO: Check today's workout title or exercises
    const title = (todayWorkout?.title || '').toLowerCase();
    if (title.includes('pull') || title.includes('back')) {
      targets.add('lats');
      targets.add('traps');
      targets.add('rear_delts');
      targets.add('biceps');
    } else if (title.includes('leg') || title.includes('lower') || title.includes('squat')) {
      targets.add('quads');
      targets.add('hamstrings');
      targets.add('glutes');
      targets.add('calves');
    } else {
      // Default to Push / Upper Primary target
      targets.add('chest');
      targets.add('front_delts');
      targets.add('triceps');
    }

    return targets;
  }, [selectedSplit, todayWorkout, weeklyLoad]);

  const handleMuscleClick = (m: MuscleKey) => {
    soundFx.playTargetLock();
    setSelectedMuscle(m);
  };

  const getMuscleHeatStyles = (key: MuscleKey) => {
    const isTarget = activeTargets.has(key);
    const isSelected = selectedMuscle === key;
    const weeklySets = weeklyLoad[key] || 0;

    if (isSelected) {
      return {
        fill: '#06b6d4',
        stroke: '#22d3ee',
        strokeWidth: 2.5,
        filter: 'drop-shadow(0 0 10px rgba(6,182,212,0.9))'
      };
    }

    if (selectedSplit === 'WEEKLY') {
      if (weeklySets >= 12) {
        return {
          fill: '#f43f5e',
          stroke: '#fb7185',
          strokeWidth: 1.5,
          filter: 'drop-shadow(0 0 8px rgba(244,63,94,0.7))'
        };
      }
      if (weeklySets >= 6) {
        return {
          fill: '#10b981',
          stroke: '#34d399',
          strokeWidth: 1.5,
          filter: 'drop-shadow(0 0 6px rgba(16,185,129,0.6))'
        };
      }
      if (weeklySets > 0) {
        return {
          fill: '#0284c7',
          stroke: '#38bdf8',
          strokeWidth: 1.2,
          filter: 'drop-shadow(0 0 5px rgba(2,132,199,0.5))'
        };
      }
      return {
        fill: '#1e293b',
        stroke: '#334155',
        strokeWidth: 1
      };
    }

    if (isTarget) {
      return {
        fill: '#0891b2',
        stroke: '#22d3ee',
        strokeWidth: 2,
        filter: 'drop-shadow(0 0 8px rgba(6,182,212,0.75))'
      };
    }

    return {
      fill: '#1e293b',
      stroke: '#334155',
      strokeWidth: 1
    };
  };

  const currentMuscleInfo = MUSCLE_REGISTRY[selectedMuscle];

  return (
    <Card className={cn(
      "overflow-hidden border-border/80 dark:border-cyan-500/20 bg-card/90 dark:bg-black/60 backdrop-blur-xl shadow-[0_0_30px_rgba(6,182,212,0.06)]",
      className
    )}>
      <CardHeader className="pb-3 border-b border-border/40 flex flex-row items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/25 shadow-[0_0_12px_rgba(6,182,212,0.25)]">
            <Activity size={18} className="animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <CardTitle className="text-base font-bold tracking-tight">Kinetic Muscle Heatmap</CardTitle>
              <span className="text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded bg-cyan-500/15 text-cyan-400 border border-cyan-500/30">
                Live Load
              </span>
            </div>
            <p className="text-xs text-muted-foreground">Interactive target intensity & anatomical stress</p>
          </div>
        </div>

        {/* View Switcher: Front vs Back */}
        <div className="flex items-center bg-secondary/50 dark:bg-black/50 p-1 rounded-xl border border-border/50">
          <button
            type="button"
            onClick={() => {
              soundFx.playClick(1000);
              setView('front');
            }}
            className={cn(
              "px-2.5 py-1 text-xs font-semibold rounded-lg transition-all relative",
              view === 'front' ? "text-cyan-400 font-bold" : "text-muted-foreground hover:text-foreground"
            )}
          >
            {view === 'front' && (
              <motion.div
                layoutId="heatmapViewPill"
                className="absolute inset-0 bg-cyan-500/20 border border-cyan-500/40 rounded-lg shadow-[0_0_10px_rgba(6,182,212,0.2)]"
                transition={{ type: "spring", stiffness: 400, damping: 25 }}
              />
            )}
            <span className="relative z-10">Front</span>
          </button>

          <button
            type="button"
            onClick={() => {
              soundFx.playClick(1000);
              setView('back');
            }}
            className={cn(
              "px-2.5 py-1 text-xs font-semibold rounded-lg transition-all relative",
              view === 'back' ? "text-cyan-400 font-bold" : "text-muted-foreground hover:text-foreground"
            )}
          >
            {view === 'back' && (
              <motion.div
                layoutId="heatmapViewPill"
                className="absolute inset-0 bg-cyan-500/20 border border-cyan-500/40 rounded-lg shadow-[0_0_10px_rgba(6,182,212,0.2)]"
                transition={{ type: "spring", stiffness: 400, damping: 25 }}
              />
            )}
            <span className="relative z-10">Back</span>
          </button>
        </div>
      </CardHeader>

      <CardContent className="p-4 sm:p-5 space-y-4">
        {/* Split Filter Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none text-xs">
          {[
            { id: 'AUTO', label: "Today's Target", icon: Target },
            { id: 'PUSH', label: 'Push Day', icon: Zap },
            { id: 'PULL', label: 'Pull Day', icon: Layers },
            { id: 'LEGS', label: 'Legs Day', icon: Dumbbell },
            { id: 'WEEKLY', label: '7-Day Activity', icon: Flame },
          ].map((item) => {
            const Icon = item.icon;
            const active = selectedSplit === item.id;
            return (
              <button
                key={item.id}
                onClick={() => {
                  soundFx.playClick(1200);
                  setSelectedSplit(item.id as SplitFilter);
                }}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-xl border font-semibold whitespace-nowrap transition-all touch-manipulation",
                  active
                    ? "bg-cyan-500/15 border-cyan-500/50 text-cyan-400 shadow-[0_0_12px_rgba(6,182,212,0.2)]"
                    : "bg-secondary/30 border-border/50 text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
                )}
              >
                <Icon size={13} className={active ? "text-cyan-400" : "text-muted-foreground"} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>

        {/* Heatmap Anatomy & Inspector Panel */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-5 items-center">
          {/* Anatomical SVG Silhouette Canvas */}
          <div className="md:col-span-6 flex flex-col items-center justify-center relative p-3 bg-black/40 dark:bg-black/60 rounded-2xl border border-cyan-500/15 overflow-hidden min-h-[290px]">
            {/* Ambient scanner grid line */}
            <div className="absolute inset-0 bg-[linear-gradient(to_right,#0891b20a_1px,transparent_1px),linear-gradient(to_bottom,#0891b20a_1px,transparent_1px)] bg-[size:16px_16px] pointer-events-none" />
            
            {/* Cybernetic HUD overlay */}
            <div className="absolute top-2.5 left-2.5 flex items-center gap-1.5 text-[10px] font-mono text-cyan-400/70">
              <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-ping" />
              <span>TARGET SCANNER // {view.toUpperCase()}</span>
            </div>

            <svg
              viewBox="0 0 200 320"
              className="w-48 sm:w-56 h-auto max-h-[280px] drop-shadow-lg cursor-pointer select-none"
            >
              <defs>
                <filter id="neonGlow" x="-20%" y="-20%" width="140%" height="140%">
                  <feGaussianBlur stdDeviation="3" result="blur" />
                  <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
              </defs>

              {/* Head Silhouette */}
              <circle cx="100" cy="24" r="14" fill="#0f172a" stroke="#334155" strokeWidth="1" />
              <path d="M 94 38 L 106 38 L 108 46 L 92 46 Z" fill="#0f172a" stroke="#334155" strokeWidth="1" />

              {view === 'front' ? (
                <g>
                  {/* FRONT ANATOMY */}
                  {/* Pectorals (Chest) Left and Right */}
                  <path
                    d="M 82 52 C 82 50 96 50 98 55 L 98 80 C 88 80 78 72 74 65 Z"
                    style={getMuscleHeatStyles('chest')}
                    onClick={() => handleMuscleClick('chest')}
                    className="transition-all duration-300 hover:opacity-80"
                  />
                  <path
                    d="M 118 52 C 118 50 104 50 102 55 L 102 80 C 112 80 122 72 126 65 Z"
                    style={getMuscleHeatStyles('chest')}
                    onClick={() => handleMuscleClick('chest')}
                    className="transition-all duration-300 hover:opacity-80"
                  />

                  {/* Anterior Deltoids (Shoulders) */}
                  <path
                    d="M 72 54 C 63 56 60 66 62 76 C 66 74 72 68 74 62 Z"
                    style={getMuscleHeatStyles('front_delts')}
                    onClick={() => handleMuscleClick('front_delts')}
                    className="transition-all duration-300 hover:opacity-80"
                  />
                  <path
                    d="M 128 54 C 137 56 140 66 138 76 C 134 74 128 68 126 62 Z"
                    style={getMuscleHeatStyles('front_delts')}
                    onClick={() => handleMuscleClick('front_delts')}
                    className="transition-all duration-300 hover:opacity-80"
                  />

                  {/* Biceps (Front Arms) */}
                  <path
                    d="M 60 78 C 56 86 56 100 62 108 C 66 102 68 90 64 80 Z"
                    style={getMuscleHeatStyles('biceps')}
                    onClick={() => handleMuscleClick('biceps')}
                    className="transition-all duration-300 hover:opacity-80"
                  />
                  <path
                    d="M 140 78 C 144 86 144 100 138 108 C 134 102 132 90 136 80 Z"
                    style={getMuscleHeatStyles('biceps')}
                    onClick={() => handleMuscleClick('biceps')}
                    className="transition-all duration-300 hover:opacity-80"
                  />

                  {/* Forearms */}
                  <path
                    d="M 61 110 C 56 122 52 138 56 150 L 63 148 C 66 138 67 122 64 112 Z"
                    style={getMuscleHeatStyles('forearms')}
                    onClick={() => handleMuscleClick('forearms')}
                    className="transition-all duration-300 hover:opacity-80"
                  />
                  <path
                    d="M 139 110 C 144 122 148 138 144 150 L 137 148 C 134 138 133 122 136 112 Z"
                    style={getMuscleHeatStyles('forearms')}
                    onClick={() => handleMuscleClick('forearms')}
                    className="transition-all duration-300 hover:opacity-80"
                  />

                  {/* Rectus Abdominis (Abs) */}
                  <path
                    d="M 90 84 L 110 84 L 109 97 L 91 97 Z M 90 100 L 110 100 L 108 114 L 92 114 Z M 92 117 L 108 117 L 106 132 L 94 132 Z"
                    style={getMuscleHeatStyles('abs')}
                    onClick={() => handleMuscleClick('abs')}
                    className="transition-all duration-300 hover:opacity-80"
                  />

                  {/* Obliques */}
                  <path
                    d="M 76 84 C 74 98 75 116 78 130 C 84 130 88 120 88 105 Z"
                    style={getMuscleHeatStyles('obliques')}
                    onClick={() => handleMuscleClick('obliques')}
                    className="transition-all duration-300 hover:opacity-80"
                  />
                  <path
                    d="M 124 84 C 126 98 125 116 122 130 C 116 130 112 120 112 105 Z"
                    style={getMuscleHeatStyles('obliques')}
                    onClick={() => handleMuscleClick('obliques')}
                    className="transition-all duration-300 hover:opacity-80"
                  />

                  {/* Quadriceps (Front Thighs) */}
                  <path
                    d="M 78 140 C 74 165 72 195 80 216 C 88 214 94 200 95 175 L 94 142 Z"
                    style={getMuscleHeatStyles('quads')}
                    onClick={() => handleMuscleClick('quads')}
                    className="transition-all duration-300 hover:opacity-80"
                  />
                  <path
                    d="M 122 140 C 126 165 128 195 120 216 C 112 214 106 200 105 175 L 106 142 Z"
                    style={getMuscleHeatStyles('quads')}
                    onClick={() => handleMuscleClick('quads')}
                    className="transition-all duration-300 hover:opacity-80"
                  />

                  {/* Calves / Shins */}
                  <path
                    d="M 78 228 C 74 246 75 272 82 288 L 88 288 C 91 270 91 245 88 228 Z"
                    style={getMuscleHeatStyles('calves')}
                    onClick={() => handleMuscleClick('calves')}
                    className="transition-all duration-300 hover:opacity-80"
                  />
                  <path
                    d="M 122 228 C 126 246 125 272 118 288 L 112 288 C 109 270 109 245 112 228 Z"
                    style={getMuscleHeatStyles('calves')}
                    onClick={() => handleMuscleClick('calves')}
                    className="transition-all duration-300 hover:opacity-80"
                  />
                </g>
              ) : (
                <g>
                  {/* BACK ANATOMY */}
                  {/* Trapezius (Traps) */}
                  <path
                    d="M 86 46 L 114 46 L 126 56 L 100 85 L 74 56 Z"
                    style={getMuscleHeatStyles('traps')}
                    onClick={() => handleMuscleClick('traps')}
                    className="transition-all duration-300 hover:opacity-80"
                  />

                  {/* Posterior Deltoids (Rear Shoulders) */}
                  <path
                    d="M 72 56 C 62 60 60 70 64 78 C 69 74 74 68 74 60 Z"
                    style={getMuscleHeatStyles('rear_delts')}
                    onClick={() => handleMuscleClick('rear_delts')}
                    className="transition-all duration-300 hover:opacity-80"
                  />
                  <path
                    d="M 128 56 C 138 60 140 70 136 78 C 131 74 126 68 126 60 Z"
                    style={getMuscleHeatStyles('rear_delts')}
                    onClick={() => handleMuscleClick('rear_delts')}
                    className="transition-all duration-300 hover:opacity-80"
                  />

                  {/* Triceps */}
                  <path
                    d="M 61 80 C 56 90 56 102 62 108 C 65 100 66 90 64 80 Z"
                    style={getMuscleHeatStyles('triceps')}
                    onClick={() => handleMuscleClick('triceps')}
                    className="transition-all duration-300 hover:opacity-80"
                  />
                  <path
                    d="M 139 80 C 144 90 144 102 138 108 C 135 100 134 90 136 80 Z"
                    style={getMuscleHeatStyles('triceps')}
                    onClick={() => handleMuscleClick('triceps')}
                    className="transition-all duration-300 hover:opacity-80"
                  />

                  {/* Lats (Latissimus Dorsi) Left and Right wings */}
                  <path
                    d="M 74 68 C 70 85 71 106 78 122 C 86 118 94 105 96 85 Z"
                    style={getMuscleHeatStyles('lats')}
                    onClick={() => handleMuscleClick('lats')}
                    className="transition-all duration-300 hover:opacity-80"
                  />
                  <path
                    d="M 126 68 C 130 85 129 106 122 122 C 114 118 106 105 104 85 Z"
                    style={getMuscleHeatStyles('lats')}
                    onClick={() => handleMuscleClick('lats')}
                    className="transition-all duration-300 hover:opacity-80"
                  />

                  {/* Lower Back */}
                  <path
                    d="M 88 115 L 112 115 L 110 135 L 90 135 Z"
                    style={getMuscleHeatStyles('lower_back')}
                    onClick={() => handleMuscleClick('lower_back')}
                    className="transition-all duration-300 hover:opacity-80"
                  />

                  {/* Glutes */}
                  <path
                    d="M 78 138 C 74 152 76 172 88 174 C 96 174 98 155 98 138 Z"
                    style={getMuscleHeatStyles('glutes')}
                    onClick={() => handleMuscleClick('glutes')}
                    className="transition-all duration-300 hover:opacity-80"
                  />
                  <path
                    d="M 122 138 C 126 152 124 172 112 174 C 104 174 102 155 102 138 Z"
                    style={getMuscleHeatStyles('glutes')}
                    onClick={() => handleMuscleClick('glutes')}
                    className="transition-all duration-300 hover:opacity-80"
                  />

                  {/* Hamstrings */}
                  <path
                    d="M 80 178 C 76 195 76 215 84 225 C 92 222 95 205 96 178 Z"
                    style={getMuscleHeatStyles('hamstrings')}
                    onClick={() => handleMuscleClick('hamstrings')}
                    className="transition-all duration-300 hover:opacity-80"
                  />
                  <path
                    d="M 120 178 C 124 195 124 215 116 225 C 108 222 105 205 104 178 Z"
                    style={getMuscleHeatStyles('hamstrings')}
                    onClick={() => handleMuscleClick('hamstrings')}
                    className="transition-all duration-300 hover:opacity-80"
                  />

                  {/* Calves (Gastrocnemius) */}
                  <path
                    d="M 80 230 C 74 246 76 270 84 288 L 88 288 C 92 272 92 248 88 230 Z"
                    style={getMuscleHeatStyles('calves')}
                    onClick={() => handleMuscleClick('calves')}
                    className="transition-all duration-300 hover:opacity-80"
                  />
                  <path
                    d="M 120 230 C 126 246 124 270 116 288 L 112 288 C 108 272 108 248 112 230 Z"
                    style={getMuscleHeatStyles('calves')}
                    onClick={() => handleMuscleClick('calves')}
                    className="transition-all duration-300 hover:opacity-80"
                  />
                </g>
              )}
            </svg>

            {/* Tap instruction */}
            <div className="text-[11px] text-muted-foreground/80 font-medium mt-1">
              Tap muscle to inspect biomechanics
            </div>
          </div>

          {/* Muscle Detail & Inspector Panel */}
          <div className="md:col-span-6 flex flex-col justify-between space-y-3">
            <div className="p-4 rounded-2xl bg-secondary/30 dark:bg-black/40 border border-border/50 dark:border-cyan-500/20 space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <span className="text-[10px] font-bold font-mono uppercase tracking-wider text-cyan-500">
                    Selected Target
                  </span>
                  <h4 className="text-base sm:text-lg font-bold text-foreground">
                    {currentMuscleInfo?.label || 'Muscle Group'}
                  </h4>
                </div>

                <span className={cn(
                  "px-2 py-0.5 rounded-full text-[10px] font-bold font-mono uppercase border",
                  activeTargets.has(selectedMuscle)
                    ? "bg-cyan-500/15 text-cyan-400 border-cyan-500/30"
                    : "bg-secondary text-muted-foreground border-border/40"
                )}>
                  {activeTargets.has(selectedMuscle) ? 'Active Target' : 'Secondary'}
                </span>
              </div>

              {/* Weekly training metrics for this muscle */}
              <div className="grid grid-cols-2 gap-2 pt-2 border-t border-border/30 text-xs">
                <div className="p-2 rounded-xl bg-background/50 border border-border/40">
                  <div className="text-[10px] text-muted-foreground font-mono">7-Day Volume</div>
                  <div className="text-sm font-bold font-mono text-cyan-400">
                    {weeklyLoad[selectedMuscle] || 0} <span className="text-[10px] font-sans text-muted-foreground">sets</span>
                  </div>
                </div>

                <div className="p-2 rounded-xl bg-background/50 border border-border/40">
                  <div className="text-[10px] text-muted-foreground font-mono">Stimulus Status</div>
                  <div className="text-sm font-bold text-foreground">
                    {(weeklyLoad[selectedMuscle] || 0) >= 10 ? 'Optimal' : (weeklyLoad[selectedMuscle] || 0) > 0 ? 'Warmed' : 'Recovery'}
                  </div>
                </div>
              </div>

              {/* Recommended Exercises for Selected Muscle */}
              <div className="space-y-1.5 pt-1">
                <div className="text-[11px] font-semibold text-muted-foreground flex items-center gap-1.5">
                  <Dumbbell size={12} className="text-cyan-500" />
                  <span>Target Overload Exercises:</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {(currentMuscleInfo?.recommendedExercises || []).map((exName, idx) => (
                    <span 
                      key={idx}
                      className="px-2 py-1 rounded-lg text-xs font-medium bg-background/70 border border-border/50 text-foreground"
                    >
                      {exName}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            {/* Deep Analytics Action */}
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                className="flex-1 text-xs font-semibold h-9 gap-1.5 border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/10"
                onClick={() => navigate('/progress#physique-heatmap')}
              >
                <ShieldCheck size={13} /> Full Anatomical 3D Model
              </Button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
