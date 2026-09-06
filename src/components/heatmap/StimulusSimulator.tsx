import React, { useState } from 'react';
import { MuscleGroup } from '../../lib/exercises';
import { Button } from '../ui/Button';
import { soundFx } from '../../lib/soundFx';
import { Zap, RotateCcw, Sparkles, CheckCircle2, ChevronDown, ChevronUp, Plus } from 'lucide-react';
import { cn } from '../../lib/utils';

export interface SimulatedVolumeDelta {
  [muscle: string]: number;
}

interface StimulusSimulatorProps {
  onSimulateDelta: (delta: SimulatedVolumeDelta | null) => void;
  activeDelta: SimulatedVolumeDelta | null;
  onApplyToWorkout?: () => void;
}

const PRESET_PROTOCOLS: {
  id: string;
  name: string;
  badge: string;
  description: string;
  sets: Record<string, number>;
}[] = [
  {
    id: 'PUSH',
    name: 'Chest & Push Protocol',
    badge: '+10 Sets',
    description: 'Incline Dumbbell Press (4s), Overhead Press (3s), Tricep Pushdowns (3s)',
    sets: { CHEST: 4, SHOULDERS: 3, ARMS: 3 }
  },
  {
    id: 'PULL',
    name: 'Back & Lat Hypertrophy',
    badge: '+11 Sets',
    description: 'Barbell Rows (4s), Weighted Pull-ups (4s), Hammer Curls (3s)',
    sets: { BACK: 5, SHOULDERS: 2, ARMS: 4 }
  },
  {
    id: 'LEGS',
    name: 'Quad & Hamstring Annihilation',
    badge: '+12 Sets',
    description: 'Barbell Squat (4s), Romanian Deadlift (4s), Leg Extensions (4s)',
    sets: { LEGS: 10, CORE: 2 }
  },
  {
    id: 'ARMS_DELTS',
    name: 'Upper Arm & Deltoid Focus',
    badge: '+10 Sets',
    description: 'Lateral Raises (4s), Incline Curls (3s), Skull Crushers (3s)',
    sets: { SHOULDERS: 4, ARMS: 6 }
  }
];

export const StimulusSimulator: React.FC<StimulusSimulatorProps> = ({
  onSimulateDelta,
  activeDelta,
  onApplyToWorkout
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [activeProtocolId, setActiveProtocolId] = useState<string | null>(null);

  const totalSimulatedSets: number = activeDelta 
    ? (Object.values(activeDelta) as (number | undefined)[]).reduce<number>((a, b) => a + (typeof b === 'number' ? b : 0), 0)
    : 0;

  const handleApplyPreset = (preset: typeof PRESET_PROTOCOLS[0]) => {
    soundFx.playSimulateBoost();
    setActiveProtocolId(preset.id);
    onSimulateDelta(preset.sets);
  };

  const handleAddSet = (muscle: MuscleGroup) => {
    soundFx.playClick(1000);
    const updated = { ...(activeDelta || {}) };
    updated[muscle] = (updated[muscle] || 0) + 1;
    setActiveProtocolId('CUSTOM');
    onSimulateDelta(updated);
  };

  const handleReset = () => {
    soundFx.playClick(600);
    setActiveProtocolId(null);
    onSimulateDelta(null);
  };

  return (
    <div className="rounded-2xl border border-cyan-500/40 bg-gradient-to-r from-cyan-500/10 via-background to-secondary/30 p-3 sm:p-4 shadow-sm relative overflow-hidden">
      {/* Active simulation luminous highlight */}
      {totalSimulatedSets > 0 && (
        <div className="absolute top-0 right-0 left-0 h-0.5 bg-gradient-to-r from-cyan-400 via-emerald-400 to-cyan-400 animate-pulse" />
      )}

      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-cyan-500/20 text-cyan-400 border border-cyan-500/40 shadow-inner">
            <Zap size={16} className={totalSimulatedSets > 0 ? "animate-bounce" : ""} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h4 className="font-bold text-xs sm:text-sm text-foreground flex items-center gap-1.5">
                Hypertrophy "What-If" Simulator
              </h4>
              {totalSimulatedSets > 0 && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-cyan-500 text-black shadow-xs animate-pulse">
                  +{totalSimulatedSets} Sets Simulated
                </span>
              )}
            </div>
            <p className="text-[11px] text-muted-foreground">
              Preview how upcoming sessions immediately illuminate your physique and break deficits in real time.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          {totalSimulatedSets > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleReset}
              className="h-7 text-xs px-2 gap-1 border-border/70 hover:bg-secondary text-muted-foreground hover:text-foreground"
            >
              <RotateCcw size={11} /> Reset
            </Button>
          )}

          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              soundFx.playClick();
              setIsOpen(!isOpen);
            }}
            className="h-7 text-xs px-2.5 gap-1 border-cyan-500/40 hover:bg-cyan-500/15 text-cyan-400 font-semibold"
          >
            <Sparkles size={12} />
            <span>{isOpen ? 'Close Simulator' : 'Simulate Session'}</span>
            {isOpen ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          </Button>
        </div>
      </div>

      {/* Simulator Drawer */}
      {isOpen && (
        <div className="mt-3 pt-3 border-t border-cyan-500/20 space-y-3">
          <div className="text-xs font-bold text-foreground flex items-center justify-between">
            <span>Quick-Load Workout Protocols:</span>
            <span className="text-[10px] font-mono text-muted-foreground">Instant Mannequin Illumination</span>
          </div>

          {/* Presets Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
            {PRESET_PROTOCOLS.map(preset => {
              const isSelected = activeProtocolId === preset.id;
              return (
                <button
                  key={preset.id}
                  onClick={() => handleApplyPreset(preset)}
                  className={cn(
                    "p-2.5 rounded-xl border text-left transition-all relative overflow-hidden group",
                    isSelected 
                      ? "bg-cyan-500/20 border-cyan-400 shadow-[0_0_12px_rgba(6,182,212,0.3)]" 
                      : "bg-background/80 hover:bg-cyan-500/10 border-border/60 hover:border-cyan-500/40"
                  )}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-bold text-xs text-foreground group-hover:text-cyan-400 transition-colors truncate">
                      {preset.name}
                    </span>
                    <span className="text-[10px] font-mono font-bold px-1.5 py-0.2 rounded bg-cyan-500/20 text-cyan-400">
                      {preset.badge}
                    </span>
                  </div>
                  <p className="text-[10px] text-muted-foreground line-clamp-1">
                    {preset.description}
                  </p>
                </button>
              );
            })}
          </div>

          {/* Custom +1 Set Buttons for specific muscles */}
          <div className="space-y-1.5 pt-1">
            <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider block">
              Inject Individual Sets:
            </span>
            <div className="flex flex-wrap gap-1.5">
              {(['CHEST', 'BACK', 'SHOULDERS', 'LEGS', 'ARMS', 'CORE'] as MuscleGroup[]).map(m => {
                const count = activeDelta?.[m] || 0;
                return (
                  <button
                    key={m}
                    onClick={() => handleAddSet(m)}
                    className={cn(
                      "px-2.5 py-1 rounded-lg border text-xs font-mono font-semibold flex items-center gap-1.5 transition-all",
                      count > 0 
                        ? "bg-cyan-500/25 border-cyan-400 text-cyan-300 shadow-xs" 
                        : "bg-background/70 hover:bg-secondary border-border/60 text-foreground"
                    )}
                  >
                    <Plus size={11} className="text-cyan-400" />
                    <span>{m}</span>
                    {count > 0 && (
                      <span className="text-cyan-400 font-bold">+{count}s</span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
