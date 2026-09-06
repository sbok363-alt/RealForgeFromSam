import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Workout } from '../types';
import { MuscleGroup, MUSCLE_COLORS, EXERCISE_DATABASE } from '../lib/exercises';
import { 
  calculatePhysiqueHypertrophyVolume, 
  getStoredHypertrophyThresholds, 
  saveStoredHypertrophyThresholds,
  generateDemoHypertrophyWorkouts,
  HypertrophyThresholds,
  MuscleVolumeWeekly
} from '../lib/hypertrophy';
import { 
  AlertTriangle, 
  Info, 
  Sliders, 
  Flame, 
  CheckCircle2, 
  RotateCcw, 
  ChevronRight, 
  Sparkles, 
  Target, 
  X,
  Activity,
  Layers,
  Scale,
  Zap,
  Dumbbell,
  Eye,
  Clock,
  HelpCircle,
  Scan,
  Radar
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/Card';
import { Button } from './ui/Button';
import { cn } from '../lib/utils';
import { useThemeStore } from '../store/useThemeStore';
import { AnteriorPhysiqueSvg, MuscleSvgStyle } from './heatmap/AnteriorPhysiqueSvg';
import { PosteriorPhysiqueSvg } from './heatmap/PosteriorPhysiqueSvg';
import { SymmetryBalanceCard } from './heatmap/SymmetryBalanceCard';
import { soundFx } from '../lib/soundFx';
import { RadarChart } from './heatmap/RadarChart';
import { HoloScannerOverlay } from './heatmap/HoloScannerOverlay';
import { VolumeAudioToggle } from './heatmap/VolumeAudioToggle';
import { StimulusSimulator, SimulatedVolumeDelta } from './heatmap/StimulusSimulator';
import { KineticSynergyBadge } from './heatmap/KineticSynergyBadge';

export type HeatmapMetricMode = 'HYPERTROPHY_PCT' | 'RAW_VOLUME' | 'RECOVERY_READINESS';
export type BodyFocusRegion = 'ALL' | 'UPPER' | 'LOWER';

interface PhysiqueHeatmapProps {
  workouts: Workout[];
  className?: string;
  onNavigateToWorkout?: () => void;
}

export const PhysiqueHeatmap: React.FC<PhysiqueHeatmapProps> = ({ 
  workouts, 
  className,
  onNavigateToWorkout 
}) => {
  const [viewMode, setViewMode] = useState<'FRONT' | 'BACK' | 'BOTH'>('BOTH');
  const [focusRegion, setFocusRegion] = useState<BodyFocusRegion>('ALL');
  const [selectedMuscle, setSelectedMuscle] = useState<MuscleGroup | null>(null);
  const [hoveredMuscle, setHoveredMuscle] = useState<MuscleGroup | null>(null);
  const [timePerspective, setTimePerspective] = useState<'WEEK1' | 'WEEK2' | 'AVERAGE'>('WEEK1');
  const [metricMode, setMetricMode] = useState<HeatmapMetricMode>('HYPERTROPHY_PCT');
  const [includeSecondary, setIncludeSecondary] = useState<boolean>(true);
  const [isThresholdModalOpen, setIsThresholdModalOpen] = useState(false);
  const [dismissedNotice, setDismissedNotice] = useState(false);
  const [focusDeficitsOnly, setFocusDeficitsOnly] = useState(false);
  const [showSymmetryPanel, setShowSymmetryPanel] = useState(false);
  const [useDemoData, setUseDemoData] = useState(false);
  const [simulatedDelta, setSimulatedDelta] = useState<SimulatedVolumeDelta | null>(null);
  const [showScannerFx, setShowScannerFx] = useState(true);
  const [showRadarChart, setShowRadarChart] = useState(false);
  const [mouseTilt, setMouseTilt] = useState({ x: 0, y: 0 });

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width - 0.5;
    const y = (e.clientY - rect.top) / rect.height - 0.5;
    setMouseTilt({ x: Math.round(x * 12 * 10) / 10, y: Math.round(-y * 12 * 10) / 10 });
  };

  const handleMouseLeave = () => {
    setMouseTilt({ x: 0, y: 0 });
  };

  // App Theme state for dual-tone rendering
  const { theme } = useThemeStore();
  const isDark = theme === 'dark';

  // Local state for user-defined thresholds
  const [thresholds, setThresholds] = useState<HypertrophyThresholds>(() => getStoredHypertrophyThresholds());

  // Effective workout dataset (real workouts or demo preview + simulated delta)
  const activeWorkouts = useMemo(() => {
    let base = useDemoData ? generateDemoHypertrophyWorkouts() : workouts;
    if (simulatedDelta && Object.keys(simulatedDelta).length > 0) {
      const simSets = Object.entries(simulatedDelta).flatMap(([muscle, count]) => {
        const numCount = typeof count === 'number' ? count : 0;
        if (numCount <= 0) return [];
        const ex = EXERCISE_DATABASE.find(e => e.primaryMuscle === muscle)?.name || `${muscle} Exercise`;
        return Array.from({ length: numCount }).map((_, idx) => ({
          id: `sim_${muscle}_${idx}`,
          exercise: ex,
          reps: 10,
          weight: 75,
          completed: true
        }));
      });

      const simulatedWorkout: Workout = {
        id: 'simulated_session_active',
        title: '⚡ Simulated Protocol',
        scheduledDate: new Date().toISOString().split('T')[0],
        completedAt: Date.now(),
        status: 'COMPLETED',
        version: 1,
        sets: simSets
      };
      return [simulatedWorkout, ...base];
    }
    return base;
  }, [useDemoData, workouts, simulatedDelta]);

  // Compute weekly volume breakdown & 2-consecutive-week deficits
  const auditResult = useMemo(() => {
    return calculatePhysiqueHypertrophyVolume(activeWorkouts, thresholds, includeSecondary);
  }, [activeWorkouts, thresholds, includeSecondary]);

  const { muscles, deficientMuscles, hasTwoWeekDeficit, totalDeficientMusclesCount, symmetry } = auditResult;

  // Selected muscle data
  const activeMuscleData: MuscleVolumeWeekly | null = selectedMuscle ? muscles[selectedMuscle] : null;
  const hoveredMuscleData: MuscleVolumeWeekly | null = hoveredMuscle ? muscles[hoveredMuscle] : null;

  const handleUpdateThreshold = (muscle: MuscleGroup, value: number) => {
    const updated = { ...thresholds, [muscle]: Math.max(1, value) };
    setThresholds(updated);
    saveStoredHypertrophyThresholds(updated);
  };

  const handleSetGlobalThreshold = (value: number) => {
    const clamped = Math.max(1, value);
    const updated: HypertrophyThresholds = {
      CHEST: clamped,
      BACK: clamped,
      SHOULDERS: clamped,
      LEGS: clamped,
      ARMS: clamped,
      CORE: clamped,
      FULL_BODY: clamped
    };
    setThresholds(updated);
    saveStoredHypertrophyThresholds(updated);
  };

  const handleResetDefaults = () => {
    const defaults = {
      CHEST: 10,
      BACK: 12,
      SHOULDERS: 10,
      LEGS: 12,
      ARMS: 8,
      CORE: 6,
      FULL_BODY: 10
    };
    setThresholds(defaults);
    saveStoredHypertrophyThresholds(defaults);
  };

  // Helper to dynamically color muscles based on selected metric mode (DUAL-TONE SYSTEM)
  const getMuscleStyle = (muscle: MuscleGroup): MuscleSvgStyle => {
    const item = muscles[muscle];

    // Determine relevant sets based on active time perspective
    let sets = item ? item.week1Sets : 0;
    if (timePerspective === 'WEEK2' && item) sets = item.week2Sets;
    if (timePerspective === 'AVERAGE' && item) sets = item ? (item.week1Sets + item.week2Sets) / 2 : 0;

    const isDeficit = !!item?.isTwoWeekDeficit;
    // Active only if sets have been recorded or an active deficit has been identified
    const isActive = sets > 0 || (isDeficit && hasTwoWeekDeficit);

    // =========================================================================
    // DUAL-TONE UNTARGETED LAYER:
    // Untargeted muscles have a faint, semi-transparent base outline/fill
    // (light muted grey/pink #f1e4e8 in light mode, translucent in dark mode)
    // with clean white dividing seams separating each anatomical muscle head!
    // =========================================================================
    if (!isActive) {
      return {
        fill: isDark ? 'rgba(244, 226, 232, 0.12)' : '#f1e4e8',
        opacity: isDark ? 0.7 : 0.9,
        stroke: isDark ? 'rgba(255, 255, 255, 0.22)' : '#ffffff',
        strokeWidth: 1.2,
        isDeficit: false,
        isActive: false
      };
    }

    // If user clicked "Focus Deficits", dim any muscle that is not in active deficit
    if (focusDeficitsOnly && !isDeficit) {
      return {
        fill: isDark ? 'rgba(30, 41, 59, 0.4)' : '#e2e8f0',
        opacity: 0.35,
        stroke: isDark ? '#334155' : '#ffffff',
        strokeWidth: 1,
        isDeficit: false,
        isActive: false
      };
    }

    // =========================================================================
    // ACTIVE MUSCLE STIMULUS LAYER:
    // Only active muscles light up with the dynamic stimulus colors
    // (Optimal emerald, High cyan, Maintenance amber, Deficit red)
    // =========================================================================
    const target = item?.targetThreshold || 10;
    const pct = Math.min(150, Math.round((sets / target) * 100));
    const activeStroke = isDark ? 'rgba(255, 255, 255, 0.85)' : '#ffffff';
    const activeStrokeWidth = 1.3;

    // MODE 1: HYPERTROPHY PERCENTAGE (Default Evidence-Based Model)
    if (metricMode === 'HYPERTROPHY_PCT') {
      if (isDeficit) {
        return { 
          fill: '#e11d48', // Radiant deep red like Photo 2
          opacity: 0.95, 
          isDeficit: true,
          stroke: '#ffffff',
          strokeWidth: 1.8,
          isActive: true
        };
      }
      if (pct >= 100) {
        // Optimal Hypertrophy (100%+)
        return { fill: '#10b981', opacity: 0.95, isDeficit: false, stroke: activeStroke, strokeWidth: activeStrokeWidth, isOptimal: true, isActive: true };
      }
      if (pct >= 75) {
        // High Stimulus (75-99%)
        return { fill: '#06b6d4', opacity: 0.92, isDeficit: false, stroke: activeStroke, strokeWidth: activeStrokeWidth, isActive: true };
      }
      if (pct >= 50) {
        // Maintenance Volume (50-74%)
        return { fill: '#f59e0b', opacity: 0.9, isDeficit: false, stroke: activeStroke, strokeWidth: activeStrokeWidth, isActive: true };
      }
      // Sub-optimal / Below threshold (<50% but active sets > 0)
      return { fill: '#f43f5e', opacity: 0.85, isDeficit: false, stroke: activeStroke, strokeWidth: activeStrokeWidth, isActive: true };
    }

    // MODE 2: RAW SET VOLUME
    if (metricMode === 'RAW_VOLUME') {
      if (sets >= 15) {
        return { fill: '#8b5cf6', opacity: 0.95, isDeficit: false, stroke: activeStroke, strokeWidth: activeStrokeWidth, isActive: true };
      }
      if (sets >= 10) {
        return { fill: '#10b981', opacity: 0.95, isDeficit: false, stroke: activeStroke, strokeWidth: activeStrokeWidth, isActive: true };
      }
      if (sets >= 6) {
        return { fill: '#06b6d4', opacity: 0.9, isDeficit: false, stroke: activeStroke, strokeWidth: activeStrokeWidth, isActive: true };
      }
      return { fill: '#3b82f6', opacity: 0.8, isDeficit: false, stroke: activeStroke, strokeWidth: activeStrokeWidth, isActive: true };
    }

    // MODE 3: RECOVERY & READINESS
    if (metricMode === 'RECOVERY_READINESS') {
      const status = item?.recoveryStatus || 'RESTED';
      if (status === 'FATIGUED') {
        return { fill: '#f43f5e', opacity: 0.92, isDeficit: false, stroke: activeStroke, strokeWidth: activeStrokeWidth, isActive: true };
      }
      if (status === 'RECOVERING') {
        return { fill: '#f59e0b', opacity: 0.9, isDeficit: false, stroke: activeStroke, strokeWidth: activeStrokeWidth, isActive: true };
      }
      if (status === 'PRIMED') {
        return { fill: '#10b981', opacity: 0.95, isDeficit: false, stroke: activeStroke, strokeWidth: activeStrokeWidth, isOptimal: true, isActive: true };
      }
      return { fill: '#0ea5e9', opacity: 0.8, isDeficit: false, stroke: activeStroke, strokeWidth: activeStrokeWidth, isActive: true };
    }

    return { 
      fill: isDark ? 'rgba(244, 226, 232, 0.12)' : '#f1e4e8', 
      opacity: 0.85, 
      stroke: activeStroke, 
      strokeWidth: 1.2, 
      isDeficit: false, 
      isActive: false 
    };
  };

  // List of recommended exercises when a muscle is selected
  const recommendedExercises = useMemo(() => {
    if (!selectedMuscle) return [];
    return EXERCISE_DATABASE.filter(ex => ex.primaryMuscle === selectedMuscle).slice(0, 4);
  }, [selectedMuscle]);

  return (
    <div id="physique-heatmap" className={cn("space-y-4", className)}>
      {/* 2-CONSECUTIVE-WEEK DEFICIT NOTIFICATION BANNER */}
      {hasTwoWeekDeficit && !dismissedNotice && (
        <motion.div 
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95 }}
          className="relative overflow-hidden rounded-2xl border border-rose-500/40 bg-gradient-to-r from-rose-500/15 via-rose-500/10 to-amber-500/10 p-4 sm:p-5 shadow-lg backdrop-blur-sm"
        >
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-rose-500/10 to-transparent animate-shimmer pointer-events-none" />
          
          <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div className="flex items-start gap-3.5">
              <div className="p-2.5 rounded-xl bg-rose-500/20 text-rose-500 border border-rose-500/30 shrink-0 shadow-inner">
                <AlertTriangle className="w-5 h-5 animate-pulse" />
              </div>

              <div className="space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-black tracking-wider uppercase px-2 py-0.5 rounded-md bg-rose-500 text-white shadow-xs">
                    2-Week Deficit Alert
                  </span>
                  <h3 className="font-bold text-base text-foreground flex items-center gap-1.5">
                    {totalDeficientMusclesCount} Muscle Group{totalDeficientMusclesCount > 1 ? 's' : ''} Below Optimal Hypertrophy
                  </h3>
                </div>
                
                <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed max-w-2xl">
                  Stimulus has remained below your target threshold for <strong>two consecutive weeks</strong> ({auditResult.week2RangeStr} and {auditResult.week1RangeStr}). Muscle groups in deficit are flashing with beacon markers on the heatmap.
                </p>

                {/* Badges of affected muscle groups */}
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {deficientMuscles.map(m => (
                    <button
                      key={m.muscle}
                      onClick={() => {
                        setSelectedMuscle(m.muscle);
                        setFocusDeficitsOnly(true);
                      }}
                      className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-md bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/40 transition-colors"
                    >
                      <Flame size={11} className="text-rose-400" />
                      <span>{m.muscle}</span>
                      <span className="text-rose-400/80 font-mono">({m.week1Sets}/{m.targetThreshold} sets)</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex items-center gap-2 self-end md:self-center shrink-0">
              <Button 
                size="sm" 
                variant="outline"
                className="text-xs border-rose-500/30 hover:bg-rose-500/15 text-rose-400 gap-1.5 h-8 font-medium"
                onClick={() => setFocusDeficitsOnly(!focusDeficitsOnly)}
              >
                <Target size={13} />
                {focusDeficitsOnly ? 'Show All' : 'Highlight Deficits'}
              </Button>

              <Button 
                size="sm"
                className="text-xs bg-rose-600 hover:bg-rose-500 text-white gap-1.5 h-8 font-semibold shadow-sm"
                onClick={() => setIsThresholdModalOpen(true)}
              >
                <Sliders size={13} />
                Adjust Targets
              </Button>

              <button 
                onClick={() => setDismissedNotice(true)}
                className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary/40 transition-colors"
                title="Dismiss banner"
              >
                <X size={15} />
              </button>
            </div>
          </div>
        </motion.div>
      )}

      {/* MAIN CARD */}
      <Card className="border-border/80 shadow-sm overflow-hidden">
        <CardHeader className="pb-3 border-b border-border/50">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <CardTitle className="text-base sm:text-lg font-bold flex items-center gap-2">
                  <Activity size={18} className="text-primary" />
                  Physique Hypertrophy Heatmap
                </CardTitle>
                {hasTwoWeekDeficit && (
                  <span className="inline-flex items-center gap-1 text-[11px] font-extrabold px-2 py-0.5 rounded-full bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/30 animate-pulse">
                    <AlertTriangle size={11} /> {totalDeficientMusclesCount} Lagging
                  </span>
                )}
                {useDemoData && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-500 border border-amber-500/30">
                    <Sparkles size={10} /> Demo Data
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                Interactive anatomical stimulus auditor tracking weekly set volume, muscle recovery, and 2-week hypertrophy deficits.
              </p>
            </div>

            {/* Top Bar Controls */}
            <div className="flex items-center gap-1.5 flex-wrap">
              {/* Metric Mode Selector */}
              <div className="flex items-center rounded-lg bg-secondary/50 p-0.5 border border-border/50 text-xs">
                <button
                  onClick={() => setMetricMode('HYPERTROPHY_PCT')}
                  className={cn(
                    "px-2.5 py-1 rounded-md font-medium transition-all flex items-center gap-1",
                    metricMode === 'HYPERTROPHY_PCT' ? "bg-background text-foreground shadow-xs font-bold text-primary" : "text-muted-foreground hover:text-foreground"
                  )}
                  title="Hypertrophy Target %"
                >
                  <Target size={12} />
                  <span>Stimulus %</span>
                </button>
                <button
                  onClick={() => setMetricMode('RAW_VOLUME')}
                  className={cn(
                    "px-2.5 py-1 rounded-md font-medium transition-all flex items-center gap-1",
                    metricMode === 'RAW_VOLUME' ? "bg-background text-foreground shadow-xs font-bold text-primary" : "text-muted-foreground hover:text-foreground"
                  )}
                  title="Absolute Set Volume"
                >
                  <Layers size={12} />
                  <span>Sets</span>
                </button>
                <button
                  onClick={() => setMetricMode('RECOVERY_READINESS')}
                  className={cn(
                    "px-2.5 py-1 rounded-md font-medium transition-all flex items-center gap-1",
                    metricMode === 'RECOVERY_READINESS' ? "bg-background text-foreground shadow-xs font-bold text-primary" : "text-muted-foreground hover:text-foreground"
                  )}
                  title="Muscle Freshness & Recovery"
                >
                  <Clock size={12} />
                  <span>Recovery</span>
                </button>
              </div>

              {/* Holo-HUD Scanner Mode Toggle */}
              <Button
                variant={showScannerFx ? "default" : "outline"}
                size="sm"
                onClick={() => {
                  soundFx.playScanBeam();
                  setShowScannerFx(!showScannerFx);
                }}
                className={cn(
                  "h-7 px-2 text-xs gap-1 font-medium transition-all",
                  showScannerFx 
                    ? "bg-cyan-500 hover:bg-cyan-400 text-black font-bold shadow-[0_0_12px_rgba(6,182,212,0.4)] border-cyan-400" 
                    : "border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/10"
                )}
                title="Toggle Holographic Scanner FX & Biometric HUD"
              >
                <Scan size={12} className={showScannerFx ? "animate-pulse" : ""} />
                <span className="hidden sm:inline">Holo-HUD</span>
              </Button>

              {/* Spider Radar Button */}
              <Button
                variant={showRadarChart ? "default" : "outline"}
                size="sm"
                onClick={() => {
                  soundFx.playClick();
                  setShowRadarChart(!showRadarChart);
                }}
                className={cn(
                  "h-7 px-2 text-xs gap-1 font-medium transition-all",
                  showRadarChart ? "bg-primary text-primary-foreground font-bold shadow-xs" : ""
                )}
                title="Toggle 6-Axis Hypertrophy Spider Radar"
              >
                <Radar size={12} />
                <span className="hidden md:inline">Radar</span>
              </Button>

              {/* Symmetry Button */}
              <Button
                variant={showSymmetryPanel ? "default" : "outline"}
                size="sm"
                onClick={() => {
                  soundFx.playClick();
                  setShowSymmetryPanel(!showSymmetryPanel);
                }}
                className="h-7 px-2 text-xs gap-1 font-medium"
                title="Toggle Physique Symmetry & Balance Ratios"
              >
                <Scale size={12} />
                <span className="hidden md:inline">Symmetry</span>
              </Button>

              {/* Thresholds / Target Customizer */}
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => {
                  soundFx.playClick();
                  setIsThresholdModalOpen(true);
                }}
                className="h-7 px-2 text-xs gap-1 font-medium"
                title="Define Optimal Hypertrophy Targets"
              >
                <Sliders size={12} />
                <span className="hidden md:inline">Targets</span>
              </Button>

              {/* Demo Mode Toggle */}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  soundFx.playClick();
                  setUseDemoData(!useDemoData);
                }}
                className={cn(
                  "h-7 px-2 text-xs gap-1 font-medium",
                  useDemoData ? "text-amber-500 bg-amber-500/10" : "text-muted-foreground hover:text-foreground"
                )}
                title="Toggle preview sample hypertrophy data"
              >
                <Sparkles size={12} />
                <span className="hidden lg:inline">{useDemoData ? 'Exit Demo' : 'Demo Mode'}</span>
              </Button>

              {/* High-Tech SFX Audio Toggle */}
              <VolumeAudioToggle />
            </div>
          </div>

          {/* Quick Muscle Filter Bar */}
          <div className="flex items-center gap-1.5 pt-2.5 overflow-x-auto pb-1 scrollbar-none">
            <button
              onClick={() => setSelectedMuscle(null)}
              className={cn(
                "px-2.5 py-0.5 rounded-full text-xs font-medium shrink-0 transition-all border",
                selectedMuscle === null 
                  ? "bg-primary text-primary-foreground border-primary font-bold shadow-xs" 
                  : "bg-secondary/30 text-muted-foreground hover:text-foreground border-border/50"
              )}
            >
              All Muscles
            </button>
            {(['CHEST', 'BACK', 'SHOULDERS', 'LEGS', 'ARMS', 'CORE'] as MuscleGroup[]).map(muscle => {
              const item = muscles[muscle];
              const isDeficit = item?.isTwoWeekDeficit;
              const isSelected = selectedMuscle === muscle;
              return (
                <button
                  key={muscle}
                  onClick={() => setSelectedMuscle(isSelected ? null : muscle)}
                  className={cn(
                    "px-2.5 py-0.5 rounded-full text-xs font-medium shrink-0 transition-all border flex items-center gap-1.5",
                    isSelected 
                      ? "bg-primary text-primary-foreground border-primary font-bold shadow-xs" 
                      : isDeficit
                        ? "bg-rose-500/15 text-rose-400 border-rose-500/40 hover:bg-rose-500/25"
                        : "bg-secondary/30 text-muted-foreground hover:text-foreground border-border/50"
                  )}
                >
                  <span className={cn(
                    "w-1.5 h-1.5 rounded-full shrink-0",
                    isDeficit ? "bg-rose-500 animate-ping" : item?.week1Percentage >= 100 ? "bg-emerald-400" : "bg-muted-foreground/60"
                  )} />
                  <span>{muscle}</span>
                  <span className="font-mono text-[10px] opacity-80">
                    {timePerspective === 'WEEK2' ? item?.week2Sets : item?.week1Sets}s
                  </span>
                </button>
              );
            })}
          </div>
        </CardHeader>

        <CardContent className="p-4 sm:p-6 space-y-6">
          {/* INTERACTIVE STIMULUS "WHAT-IF" SIMULATOR */}
          <StimulusSimulator
            activeDelta={simulatedDelta}
            onSimulateDelta={(delta) => setSimulatedDelta(delta)}
            onApplyToWorkout={onNavigateToWorkout}
          />

          {/* SYMMETRY & BALANCE DRAWER (Optional Collapsible Panel) */}
          <AnimatePresence>
            {showSymmetryPanel && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden"
              >
                <SymmetryBalanceCard symmetry={symmetry} />
              </motion.div>
            )}
          </AnimatePresence>

          {/* VISUAL BODY STAGE & INSPECTOR GRID */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* HEATMAP ANATOMY STAGE (Col 1-7) */}
            <div 
              onMouseMove={handleMouseMove}
              onMouseLeave={handleMouseLeave}
              className="lg:col-span-7 flex flex-col items-center justify-center p-4 rounded-2xl bg-secondary/15 border border-border/60 relative min-h-[410px] overflow-hidden group perspective-1000"
            >
              {/* CYBERNETIC HOLOGRAPHIC SCANNER OVERLAY */}
              <HoloScannerOverlay
                active={showScannerFx}
                selectedMuscle={selectedMuscle}
                hoveredMuscle={hoveredMuscle}
                isDark={isDark}
              />

              {/* Stage Sub-Controls Bar */}
              <div className="w-full flex items-center justify-between gap-2 mb-3 text-xs flex-wrap relative z-10">
                {/* Time Perspective Selector */}
                <div className="flex items-center rounded-lg bg-background/80 p-0.5 border border-border/60 text-[11px] shadow-xs backdrop-blur-xs">
                  <button
                    onClick={() => {
                      soundFx.playClick(750);
                      setTimePerspective('WEEK1');
                    }}
                    className={cn(
                      "px-2 py-0.5 rounded font-medium transition-all",
                      timePerspective === 'WEEK1' ? "bg-primary text-primary-foreground font-bold" : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    Current Wk
                  </button>
                  <button
                    onClick={() => {
                      soundFx.playClick(750);
                      setTimePerspective('WEEK2');
                    }}
                    className={cn(
                      "px-2 py-0.5 rounded font-medium transition-all",
                      timePerspective === 'WEEK2' ? "bg-primary text-primary-foreground font-bold" : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    Prior Wk
                  </button>
                  <button
                    onClick={() => {
                      soundFx.playClick(750);
                      setTimePerspective('AVERAGE');
                    }}
                    className={cn(
                      "px-2 py-0.5 rounded font-medium transition-all",
                      timePerspective === 'AVERAGE' ? "bg-primary text-primary-foreground font-bold" : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    2-Wk Avg
                  </button>
                </div>

                {/* View Mode & Focus Region Selectors */}
                <div className="flex items-center gap-1.5 flex-wrap">
                  {/* View Angle */}
                  <div className="flex items-center rounded-lg bg-background/80 p-0.5 border border-border/60 text-[11px] shadow-xs backdrop-blur-xs">
                    <button
                      onClick={() => {
                        soundFx.playClick(850);
                        setViewMode('FRONT');
                      }}
                      className={cn(
                        "px-2 py-0.5 rounded font-medium transition-all",
                        viewMode === 'FRONT' ? "bg-primary text-primary-foreground font-bold" : "text-muted-foreground hover:text-foreground"
                      )}
                    >
                      Front
                    </button>
                    <button
                      onClick={() => {
                        soundFx.playClick(850);
                        setViewMode('BACK');
                      }}
                      className={cn(
                        "px-2 py-0.5 rounded font-medium transition-all",
                        viewMode === 'BACK' ? "bg-primary text-primary-foreground font-bold" : "text-muted-foreground hover:text-foreground"
                      )}
                    >
                      Back
                    </button>
                    <button
                      onClick={() => {
                        soundFx.playClick(850);
                        setViewMode('BOTH');
                      }}
                      className={cn(
                        "px-2 py-0.5 rounded font-medium transition-all hidden sm:inline-block",
                        viewMode === 'BOTH' ? "bg-primary text-primary-foreground font-bold" : "text-muted-foreground hover:text-foreground"
                      )}
                    >
                      Both
                    </button>
                  </div>

                  {/* 180° Turntable Flip Quick-Toggle for Single View */}
                  {viewMode !== 'BOTH' && (
                    <button
                      onClick={() => {
                        soundFx.playClick(950);
                        setViewMode(viewMode === 'FRONT' ? 'BACK' : 'FRONT');
                      }}
                      className="px-2 py-0.5 rounded-lg bg-background/80 hover:bg-secondary text-[11px] font-mono flex items-center gap-1 text-muted-foreground hover:text-foreground border border-border/60 shadow-xs transition-colors backdrop-blur-xs"
                      title="180° Turntable Flip"
                    >
                      <RotateCcw size={11} className="text-cyan-400" />
                      <span>180° Flip</span>
                    </button>
                  )}

                  {/* Body Zoom / Focus */}
                  <div className="flex items-center rounded-lg bg-background/80 p-0.5 border border-border/60 text-[11px] shadow-xs backdrop-blur-xs">
                    <button
                      onClick={() => {
                        soundFx.playClick(700);
                        setFocusRegion('ALL');
                      }}
                      className={cn(
                        "px-2 py-0.5 rounded font-medium transition-all",
                        focusRegion === 'ALL' ? "bg-secondary text-foreground font-bold" : "text-muted-foreground"
                      )}
                      title="Full Body View"
                    >
                      Full
                    </button>
                    <button
                      onClick={() => {
                        soundFx.playClick(700);
                        setFocusRegion('UPPER');
                      }}
                      className={cn(
                        "px-2 py-0.5 rounded font-medium transition-all",
                        focusRegion === 'UPPER' ? "bg-secondary text-foreground font-bold" : "text-muted-foreground"
                      )}
                      title="Zoom into Upper Body"
                    >
                      Upper
                    </button>
                    <button
                      onClick={() => {
                        soundFx.playClick(700);
                        setFocusRegion('LOWER');
                      }}
                      className={cn(
                        "px-2 py-0.5 rounded font-medium transition-all",
                        focusRegion === 'LOWER' ? "bg-secondary text-foreground font-bold" : "text-muted-foreground"
                      )}
                      title="Zoom into Lower Body"
                    >
                      Lower
                    </button>
                  </div>
                </div>
              </div>

              {/* DYNAMIC LEGEND BAR */}
              <div className="w-full flex items-center justify-between text-[11px] text-muted-foreground font-mono bg-background/70 px-3 py-1.5 rounded-lg border border-border/40 backdrop-blur-xs mb-4 relative z-10">
                {metricMode === 'HYPERTROPHY_PCT' && (
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <span className="font-semibold text-foreground">Stimulus:</span>
                    <span className="inline-flex items-center gap-1 font-semibold text-emerald-500">
                      <span className="w-2 h-2 rounded-full bg-emerald-500 shadow-xs" /> Optimal (100%+)
                    </span>
                    <span className="inline-flex items-center gap-1 font-semibold text-cyan-500">
                      <span className="w-2 h-2 rounded-full bg-cyan-500" /> High (75-99%)
                    </span>
                    <span className="inline-flex items-center gap-1 font-semibold text-amber-500">
                      <span className="w-2 h-2 rounded-full bg-amber-500" /> Maintenance
                    </span>
                    <span className="inline-flex items-center gap-1 font-semibold text-rose-500">
                      <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping" /> 2-Wk Deficit
                    </span>
                    <span className="inline-flex items-center gap-1 font-medium text-muted-foreground">
                      <span className="w-2 h-2 rounded-full bg-[#f1e4e8] dark:bg-rose-950/40 border border-muted-foreground/30" /> Untargeted (Base)
                    </span>
                  </div>
                )}

                {metricMode === 'RAW_VOLUME' && (
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <span className="font-semibold text-foreground">Weekly Sets:</span>
                    <span className="inline-flex items-center gap-1 text-purple-400 font-semibold">
                      <span className="w-2 h-2 rounded-full bg-purple-500" /> 15+ sets
                    </span>
                    <span className="inline-flex items-center gap-1 text-emerald-400 font-semibold">
                      <span className="w-2 h-2 rounded-full bg-emerald-500" /> 10–14 sets
                    </span>
                    <span className="inline-flex items-center gap-1 text-cyan-400 font-semibold">
                      <span className="w-2 h-2 rounded-full bg-cyan-500" /> 6–9 sets
                    </span>
                    <span className="inline-flex items-center gap-1 text-blue-400 font-semibold">
                      <span className="w-2 h-2 rounded-full bg-blue-500" /> 1–5 sets
                    </span>
                  </div>
                )}

                {metricMode === 'RECOVERY_READINESS' && (
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <span className="font-semibold text-foreground">Readiness:</span>
                    <span className="inline-flex items-center gap-1 text-rose-400 font-semibold">
                      <span className="w-2 h-2 rounded-full bg-rose-500" /> Fatigued (&lt;24h)
                    </span>
                    <span className="inline-flex items-center gap-1 text-amber-400 font-semibold">
                      <span className="w-2 h-2 rounded-full bg-amber-500" /> Rebuilding (24-48h)
                    </span>
                    <span className="inline-flex items-center gap-1 text-emerald-400 font-semibold">
                      <span className="w-2 h-2 rounded-full bg-emerald-500 shadow-xs" /> Primed (48-120h)
                    </span>
                    <span className="inline-flex items-center gap-1 text-sky-400 font-semibold">
                      <span className="w-2 h-2 rounded-full bg-sky-500" /> Rested (&gt;5d)
                    </span>
                  </div>
                )}

                {hasTwoWeekDeficit && (
                  <button 
                    onClick={() => {
                      soundFx.playClick();
                      setFocusDeficitsOnly(!focusDeficitsOnly);
                    }}
                    className="px-2 py-0.5 rounded-md bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 font-bold border border-rose-500/30 text-[10px] transition-colors shrink-0"
                  >
                    {focusDeficitsOnly ? 'Show All' : 'Filter Deficits'}
                  </button>
                )}
              </div>

              {/* DYNAMIC HOVER HUD TOOLTIP (Appears as user points at any muscle) */}
              <div className="min-h-[32px] w-full flex items-center justify-center relative z-10">
                {hoveredMuscleData ? (
                  <motion.div
                    initial={{ opacity: 0, y: 3 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="px-3 py-1 rounded-full bg-background border border-primary/40 shadow-sm flex items-center gap-2.5 text-xs"
                  >
                    <span className="font-bold text-foreground">{hoveredMuscleData.muscleLabel}</span>
                    <span className="text-muted-foreground">•</span>
                    <span className="font-mono text-primary font-bold">
                      {hoveredMuscleData.week1Sets} / {hoveredMuscleData.targetThreshold} sets ({hoveredMuscleData.week1Percentage}%)
                    </span>
                    {hoveredMuscleData.isTwoWeekDeficit && (
                      <span className="px-1.5 py-0.2 rounded bg-rose-500 text-white font-extrabold text-[9px]">
                        2-Wk Deficit
                      </span>
                    )}
                    {hoveredMuscleData.recoveryStatus && (
                      <span className="text-[10px] text-muted-foreground font-mono">
                        ({hoveredMuscleData.recoveryStatus})
                      </span>
                    )}
                  </motion.div>
                ) : (
                  <span className="text-[11px] text-muted-foreground/80 font-mono">
                    Hover over or click any muscle to inspect volume, stimulus, and recovery targets
                  </span>
                )}
              </div>

              {/* SVG Silhouettes Display with 3D Tactile Turntable Tilt */}
              <div 
                className="flex items-center justify-center gap-6 sm:gap-12 mt-2 w-full max-w-lg transition-transform duration-150 ease-out relative z-10"
                style={{
                  transform: `perspective(900px) rotateY(${mouseTilt.x}deg) rotateX(${mouseTilt.y}deg)`
                }}
              >
                {/* ANTERIOR VIEW */}
                {(viewMode === 'FRONT' || viewMode === 'BOTH') && (
                  <div className="flex flex-col items-center flex-1 max-w-[220px]">
                    <span className="text-[11px] font-bold text-muted-foreground tracking-wider uppercase mb-1">
                      Anterior (Front)
                    </span>
                    <AnteriorPhysiqueSvg
                      getMuscleStyle={getMuscleStyle}
                      selectedMuscle={selectedMuscle}
                      hoveredMuscle={hoveredMuscle}
                      onSelectMuscle={(m) => {
                        const next = selectedMuscle === m ? null : m;
                        if (next) soundFx.playTargetLock();
                        else soundFx.playClick(600);
                        setSelectedMuscle(next);
                      }}
                      onHoverMuscle={(m) => {
                        if (m && m !== hoveredMuscle) soundFx.playHoverTick();
                        setHoveredMuscle(m);
                      }}
                      focusRegion={focusRegion}
                      isDark={isDark}
                    />
                  </div>
                )}

                {/* POSTERIOR VIEW */}
                {(viewMode === 'BACK' || viewMode === 'BOTH') && (
                  <div className="flex flex-col items-center flex-1 max-w-[220px]">
                    <span className="text-[11px] font-bold text-muted-foreground tracking-wider uppercase mb-1">
                      Posterior (Back)
                    </span>
                    <PosteriorPhysiqueSvg
                      getMuscleStyle={getMuscleStyle}
                      selectedMuscle={selectedMuscle}
                      hoveredMuscle={hoveredMuscle}
                      onSelectMuscle={(m) => {
                        const next = selectedMuscle === m ? null : m;
                        if (next) soundFx.playTargetLock();
                        else soundFx.playClick(600);
                        setSelectedMuscle(next);
                      }}
                      onHoverMuscle={(m) => {
                        if (m && m !== hoveredMuscle) soundFx.playHoverTick();
                        setHoveredMuscle(m);
                      }}
                      focusRegion={focusRegion}
                      isDark={isDark}
                    />
                  </div>
                )}
              </div>
            </div>

            {/* MUSCLE INSPECTOR & AUDIT BREAKDOWN PANEL (Col 8-12) */}
            <div className="lg:col-span-5 flex flex-col space-y-3">
              {activeMuscleData ? (
                /* Selected Muscle Focus Card */
                <motion.div 
                  initial={{ opacity: 0, scale: 0.98 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className={cn(
                    "p-4 sm:p-5 rounded-2xl border transition-all space-y-4 shadow-sm",
                    activeMuscleData.isTwoWeekDeficit
                      ? "bg-rose-500/10 border-rose-500/40"
                      : "bg-secondary/30 border-border/80"
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <h4 className="font-bold text-base text-foreground">
                          {activeMuscleData.muscleLabel}
                        </h4>
                        {activeMuscleData.isTwoWeekDeficit ? (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-rose-500 text-white flex items-center gap-1 shadow-xs">
                            <AlertTriangle size={11} /> 2-Week Deficit
                          </span>
                        ) : activeMuscleData.week1Percentage >= 100 ? (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-500 border border-emerald-500/30">
                            Optimal Stimulus
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/15 text-amber-500 border border-amber-500/30">
                            Maintenance
                          </span>
                        )}
                      </div>
                      <span className="text-xs text-muted-foreground font-mono mt-0.5 block">
                        Target: <strong>{activeMuscleData.targetThreshold} sets/week</strong> • {auditResult.week1RangeStr}
                      </span>
                    </div>

                    <button
                      onClick={() => setSelectedMuscle(null)}
                      className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                      title="Close Inspector"
                    >
                      <X size={16} />
                    </button>
                  </div>

                  {/* 3-Week Progression Sparkline & Comparison */}
                  <div className="space-y-2.5 text-xs font-mono bg-background/70 p-3.5 rounded-xl border border-border/50">
                    <div className="flex items-center justify-between text-[11px] text-muted-foreground font-sans border-b border-border/40 pb-1.5">
                      <span className="font-semibold">3-Week Volume Progression</span>
                      <span>Target: {activeMuscleData.targetThreshold} sets</span>
                    </div>

                    {/* Current Week (W1) */}
                    <div>
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-muted-foreground font-sans flex items-center gap-1">
                          <span>Current Week (Past 7d)</span>
                          {activeMuscleData.week1Sets >= activeMuscleData.targetThreshold && (
                            <CheckCircle2 size={12} className="text-emerald-500" />
                          )}
                        </span>
                        <span className={cn(
                          "font-bold",
                          activeMuscleData.isWeek1Below ? "text-rose-400" : "text-emerald-400"
                        )}>
                          {activeMuscleData.week1Sets}s ({activeMuscleData.week1Percentage}%)
                        </span>
                      </div>
                      <div className="w-full h-2.5 rounded-full bg-secondary overflow-hidden">
                        <div 
                          className={cn(
                            "h-full rounded-full transition-all duration-500",
                            activeMuscleData.isWeek1Below ? "bg-rose-500" : "bg-emerald-500"
                          )}
                          style={{ width: `${Math.min(100, activeMuscleData.week1Percentage)}%` }}
                        />
                      </div>
                    </div>

                    {/* Prior Week (W2) */}
                    <div>
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-muted-foreground font-sans">Prior Week (8–14d ago)</span>
                        <span className={cn(
                          "font-bold",
                          activeMuscleData.isWeek2Below ? "text-rose-400" : "text-emerald-400"
                        )}>
                          {activeMuscleData.week2Sets}s ({activeMuscleData.week2Percentage}%)
                        </span>
                      </div>
                      <div className="w-full h-2 rounded-full bg-secondary overflow-hidden">
                        <div 
                          className={cn(
                            "h-full rounded-full transition-all duration-500",
                            activeMuscleData.isWeek2Below ? "bg-rose-500/70" : "bg-emerald-500/70"
                          )}
                          style={{ width: `${Math.min(100, activeMuscleData.week2Percentage)}%` }}
                        />
                      </div>
                    </div>

                    {/* 2 Weeks Prior (W3) */}
                    <div>
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-muted-foreground font-sans">Week 3 (15–21d ago)</span>
                        <span className="font-bold text-muted-foreground">
                          {activeMuscleData.week3Sets}s
                        </span>
                      </div>
                      <div className="w-full h-1.5 rounded-full bg-secondary overflow-hidden">
                        <div 
                          className="h-full rounded-full bg-muted-foreground/40 transition-all duration-500"
                          style={{ width: `${Math.min(100, (activeMuscleData.week3Sets / activeMuscleData.targetThreshold) * 100)}%` }}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Recovery & Freshness HUD */}
                  {activeMuscleData.recoveryStatus && (
                    <div className="flex items-center justify-between p-2.5 rounded-xl bg-background/50 border border-border/40 text-xs">
                      <div className="flex items-center gap-2">
                        <Clock size={14} className="text-primary" />
                        <div>
                          <span className="font-semibold text-foreground">Readiness Status: </span>
                          <span className={cn(
                            "font-bold",
                            activeMuscleData.recoveryStatus === 'PRIMED' ? "text-emerald-500" :
                            activeMuscleData.recoveryStatus === 'FATIGUED' ? "text-rose-500" :
                            activeMuscleData.recoveryStatus === 'RECOVERING' ? "text-amber-500" : "text-sky-500"
                          )}>
                            {activeMuscleData.recoveryStatus}
                          </span>
                        </div>
                      </div>
                      {activeMuscleData.daysSinceLastTrained !== undefined && (
                        <span className="text-[11px] text-muted-foreground font-mono">
                          {activeMuscleData.daysSinceLastTrained === 0 
                            ? 'Trained today' 
                            : `${activeMuscleData.daysSinceLastTrained} day${activeMuscleData.daysSinceLastTrained > 1 ? 's' : ''} ago`}
                        </span>
                      )}
                    </div>
                  )}

                  {/* Prescription / Actionable Callout */}
                  {activeMuscleData.isTwoWeekDeficit ? (
                    <div className="p-3 rounded-xl bg-rose-500/15 border border-rose-500/30 text-xs space-y-1.5">
                      <div className="flex items-center gap-1.5 font-bold text-rose-400">
                        <Flame size={14} />
                        <span>Prescription to Break 2-Week Deficit:</span>
                      </div>
                      <p className="text-muted-foreground leading-relaxed text-[11px] sm:text-xs">
                        Add <strong>+{activeMuscleData.deficitSetsWeek1} hard sets</strong> targeting {activeMuscleData.muscle} in your upcoming session to break the deficit cycle and restore hypertrophy adaptation.
                      </p>
                    </div>
                  ) : (
                    <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-xs flex items-center gap-2 text-emerald-400">
                      <CheckCircle2 size={16} className="shrink-0" />
                      <span className="text-[11px] sm:text-xs">
                        Progressive stimulus maintained within optimal hypertrophy volume range.
                      </span>
                    </div>
                  )}

                  {/* Quick Inline Target Threshold Slider */}
                  <div className="p-3 rounded-xl bg-background/50 border border-border/40 space-y-2">
                    <div className="flex justify-between items-center text-xs">
                      <span className="font-semibold text-foreground">Target Threshold for {activeMuscleData.muscle}:</span>
                      <span className="font-mono font-bold text-primary">{thresholds[activeMuscleData.muscle]} sets/week</span>
                    </div>
                    <input
                      type="range"
                      min="4"
                      max="24"
                      step="1"
                      value={thresholds[activeMuscleData.muscle]}
                      onChange={(e) => handleUpdateThreshold(activeMuscleData.muscle, parseInt(e.target.value) || 10)}
                      className="w-full accent-primary h-1.5 bg-secondary rounded-lg cursor-pointer"
                    />
                    <div className="flex justify-between text-[10px] text-muted-foreground">
                      <span>4 sets (Min)</span>
                      <span>10-12 sets (Optimal)</span>
                      <span>24 sets (Max MRV)</span>
                    </div>
                  </div>

                  {/* Kinetic Synergies & Biomechanical Co-Activation Badge */}
                  <KineticSynergyBadge muscle={activeMuscleData.muscle} />

                  {/* Recent Movements Logged */}
                  {activeMuscleData.recentExercises.length > 0 && (
                    <div className="text-xs space-y-1.5">
                      <span className="text-muted-foreground font-semibold block">Recently Logged Exercises:</span>
                      <div className="flex flex-wrap gap-1">
                        {activeMuscleData.recentExercises.map(exName => (
                          <span key={exName} className="px-2 py-0.5 rounded-md bg-secondary text-foreground text-[11px]">
                            {exName}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Recommended Exercises from Database */}
                  {recommendedExercises.length > 0 && (
                    <div className="text-xs space-y-2 pt-1 border-t border-border/40">
                      <span className="text-muted-foreground font-semibold flex items-center gap-1.5">
                        <Dumbbell size={13} className="text-primary" />
                        Recommended Hypertrophy Exercises:
                      </span>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                        {recommendedExercises.map(recEx => (
                          <div 
                            key={recEx.id}
                            className="p-2 rounded-lg bg-background/60 border border-border/40 flex items-center justify-between text-[11px]"
                          >
                            <span className="font-medium text-foreground truncate">{recEx.name}</span>
                            <span className="text-[10px] text-muted-foreground uppercase font-mono px-1 rounded bg-secondary">
                              {recEx.equipment}
                            </span>
                          </div>
                        ))}
                      </div>

                      {onNavigateToWorkout && (
                        <Button
                          size="sm"
                          onClick={onNavigateToWorkout}
                          className="w-full mt-2 text-xs font-semibold gap-1.5"
                        >
                          <Zap size={13} />
                          <span>Start Workout for {activeMuscleData.muscle}</span>
                        </Button>
                      )}
                    </div>
                  )}
                </motion.div>
              ) : (
                /* Overview Card of All Muscle Groups & Spider Radar */
                <div className="space-y-3">
                  {/* View Mode Toggle: List vs Radar */}
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                      Muscular Volume Audit ({timePerspective === 'WEEK2' ? 'Prior Week' : 'Current Week'})
                    </span>
                    <div className="flex items-center gap-1 rounded-lg bg-secondary/50 p-0.5 border border-border/50 text-[11px]">
                      <button
                        onClick={() => {
                          soundFx.playClick(700);
                          setShowRadarChart(false);
                        }}
                        className={cn(
                          "px-2 py-0.5 rounded font-medium transition-all",
                          !showRadarChart ? "bg-background text-foreground font-bold shadow-xs" : "text-muted-foreground hover:text-foreground"
                        )}
                      >
                        List
                      </button>
                      <button
                        onClick={() => {
                          soundFx.playClick(700);
                          setShowRadarChart(true);
                        }}
                        className={cn(
                          "px-2 py-0.5 rounded font-medium transition-all flex items-center gap-1",
                          showRadarChart ? "bg-background text-foreground font-bold shadow-xs text-primary" : "text-muted-foreground hover:text-foreground"
                        )}
                      >
                        <Radar size={11} />
                        <span>Radar</span>
                      </button>
                    </div>
                  </div>

                  {showRadarChart ? (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                    >
                      <RadarChart
                        audit={auditResult}
                        timePerspective={timePerspective}
                        onSelectMuscle={(m) => {
                          soundFx.playTargetLock();
                          setSelectedMuscle(m);
                        }}
                      />
                    </motion.div>
                  ) : (
                    <div className="space-y-2 max-h-[380px] overflow-y-auto pr-1">
                      {(['CHEST', 'BACK', 'SHOULDERS', 'LEGS', 'ARMS', 'CORE'] as MuscleGroup[]).map(muscleKey => {
                        const item = muscles[muscleKey];
                        const isDeficit = item.isTwoWeekDeficit;
                        const currentSets = timePerspective === 'WEEK2' ? item.week2Sets : item.week1Sets;
                        const currentPct = timePerspective === 'WEEK2' ? item.week2Percentage : item.week1Percentage;

                        return (
                          <div
                            key={muscleKey}
                            onClick={() => {
                              soundFx.playTargetLock();
                              setSelectedMuscle(muscleKey);
                            }}
                            className={cn(
                              "p-3 rounded-xl border transition-all cursor-pointer flex items-center justify-between group",
                              isDeficit 
                                ? "bg-rose-500/15 hover:bg-rose-500/25 border-rose-500/40 shadow-xs" 
                                : "bg-secondary/20 hover:bg-secondary/40 border-border/50"
                            )}
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              <div className={cn(
                                "w-3 h-3 rounded-full shrink-0 shadow-xs",
                                isDeficit ? "bg-rose-500 animate-ping" : currentPct >= 100 ? "bg-emerald-500" : currentPct >= 50 ? "bg-amber-500" : "bg-muted-foreground/50"
                              )} />
                              <div className="truncate">
                                <div className="flex items-center gap-1.5">
                                  <span className="font-bold text-xs text-foreground group-hover:text-primary transition-colors">
                                    {item.muscleLabel}
                                  </span>
                                  {isDeficit && (
                                    <span className="px-1.5 py-0.2 rounded text-[9px] font-black bg-rose-500 text-white shrink-0">
                                      2-Wk Deficit
                                    </span>
                                  )}
                                </div>
                                <div className="flex items-center gap-2 text-[11px] text-muted-foreground font-mono mt-0.5">
                                  <span>{currentSets} / {item.targetThreshold} sets</span>
                                  {item.recoveryStatus && (
                                    <span>• Status: {item.recoveryStatus}</span>
                                  )}
                                </div>
                              </div>
                            </div>

                            <div className="flex items-center gap-2.5 shrink-0">
                              <div className="text-right">
                                <span className={cn(
                                  "text-xs font-mono font-bold block",
                                  isDeficit ? "text-rose-400" : currentPct >= 100 ? "text-emerald-400" : "text-amber-400"
                                )}>
                                  {currentPct}%
                                </span>
                                <span className="text-[10px] text-muted-foreground font-sans">
                                  {currentPct >= 100 ? 'Optimal' : currentPct >= 50 ? 'Maint' : 'Lagging'}
                                </span>
                              </div>
                              <ChevronRight size={15} className="text-muted-foreground group-hover:translate-x-0.5 transition-transform" />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Symmetry Summary Footer */}
                  <div className="p-2.5 rounded-xl bg-secondary/15 border border-border/50 flex items-center justify-between text-xs">
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      <Scale size={13} className="text-primary" />
                      <span>Push/Pull Ratio: <strong className="text-foreground font-mono">{symmetry.pushPullRatio}x</strong></span>
                    </div>
                    <button
                      onClick={() => {
                        soundFx.playClick(600);
                        setShowSymmetryPanel(!showSymmetryPanel);
                      }}
                      className="text-primary hover:underline text-[11px] font-semibold"
                    >
                      {showSymmetryPanel ? 'Hide Symmetry' : 'View Symmetry Report'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* TARGET THRESHOLDS CONFIGURATION MODAL */}
      <AnimatePresence>
        {isThresholdModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-lg rounded-2xl bg-card border border-border p-6 shadow-2xl space-y-5"
            >
              <div className="flex items-center justify-between border-b border-border/50 pb-3">
                <div className="flex items-center gap-2">
                  <Sliders className="text-primary w-5 h-5" />
                  <h3 className="text-base font-bold text-foreground">Optimal Hypertrophy Thresholds</h3>
                </div>
                <button 
                  onClick={() => setIsThresholdModalOpen(false)}
                  className="p-1 rounded-md text-muted-foreground hover:text-foreground"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="space-y-4">
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Evidence-based hypertrophy guidelines (Schoenfeld, Israetel) recommend <strong>10 to 20 weekly hard sets</strong> per muscle group for maximum muscle growth. Define your targets below. Muscle groups falling below these thresholds for 2 consecutive weeks trigger active deficit alerts.
                </p>

                {/* Quick Target Presets */}
                <div className="space-y-1.5">
                  <span className="text-xs font-bold text-foreground">Quick Target Presets:</span>
                  <div className="grid grid-cols-3 gap-2">
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="text-xs h-8 flex flex-col py-0.5 justify-center"
                      onClick={() => handleSetGlobalThreshold(6)}
                    >
                      <span className="font-bold">Maintenance</span>
                      <span className="text-[10px] text-muted-foreground">6 sets / wk</span>
                    </Button>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="text-xs h-8 flex flex-col py-0.5 justify-center border-primary/40 bg-primary/5"
                      onClick={() => handleSetGlobalThreshold(10)}
                    >
                      <span className="font-bold text-primary">Hypertrophy</span>
                      <span className="text-[10px] text-muted-foreground">10 sets / wk</span>
                    </Button>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="text-xs h-8 flex flex-col py-0.5 justify-center"
                      onClick={() => handleSetGlobalThreshold(14)}
                    >
                      <span className="font-bold">High Volume</span>
                      <span className="text-[10px] text-muted-foreground">14 sets / wk</span>
                    </Button>
                  </div>
                </div>

                {/* Muscle by Muscle Sliders */}
                <div className="space-y-3 pt-2">
                  <span className="text-xs font-bold text-foreground">Fine-Tune Individual Muscles:</span>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {(['CHEST', 'BACK', 'SHOULDERS', 'LEGS', 'ARMS', 'CORE'] as MuscleGroup[]).map(muscleKey => (
                      <div key={muscleKey} className="p-2.5 rounded-lg bg-secondary/30 border border-border/50 space-y-1">
                        <div className="flex justify-between items-center text-xs">
                          <span className="font-bold">{muscleKey}</span>
                          <span className="font-mono text-primary font-bold">{thresholds[muscleKey]} sets</span>
                        </div>
                        <input
                          type="range"
                          min="4"
                          max="24"
                          step="1"
                          value={thresholds[muscleKey]}
                          onChange={(e) => handleUpdateThreshold(muscleKey, parseInt(e.target.value) || 10)}
                          className="w-full accent-primary h-1.5 bg-secondary rounded-lg cursor-pointer"
                        />
                      </div>
                    ))}
                  </div>
                </div>

                {/* Fractional Secondary Muscle Toggle */}
                <div className="flex items-center justify-between pt-2 border-t border-border/40 text-xs">
                  <div>
                    <span className="font-medium text-foreground block">Fractional Secondary Stimulus</span>
                    <span className="text-muted-foreground text-[11px]">Counts secondary muscles at 0.5 set value (e.g. Triceps on Bench Press)</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={includeSecondary}
                    onChange={(e) => setIncludeSecondary(e.target.checked)}
                    className="w-4 h-4 rounded accent-primary cursor-pointer"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between border-t border-border/50 pt-3">
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={handleResetDefaults}
                  className="text-xs text-muted-foreground hover:text-foreground gap-1"
                >
                  <RotateCcw size={12} />
                  Reset Defaults
                </Button>

                <Button 
                  size="sm" 
                  onClick={() => setIsThresholdModalOpen(false)}
                  className="text-xs font-bold"
                >
                  Save & Apply
                </Button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
