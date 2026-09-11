import React, { useState } from 'react';
import { Check, Minus, Plus, TrendingUp, TrendingDown, Minus as EqualIcon } from 'lucide-react';
import { cn } from '../../lib/utils';
import { WorkoutSet } from '../../types';
import { soundFx } from '../../lib/soundFx';
import { ForgeSparkBurst } from '../ui/ForgeSparkBurst';

interface GymSetRowProps {
  key?: React.Key;
  setNumber: number;
  set: WorkoutSet;
  onChange: (updates: Partial<WorkoutSet>) => void;
  onComplete: () => void;
  weightStep?: number;
  /** e.g. "80×8" from last session same set index */
  previousLabel?: string | null;
  /** e.g. +6.2 or -3 or 0 */
  deltaPct?: number | null;
}

/**
 * One-thumb friendly set row for gym use:
 * big ± steppers, large complete target, previous session + live %.
 */
export function GymSetRow({
  setNumber,
  set,
  onChange,
  onComplete,
  weightStep = 2.5,
  previousLabel,
  deltaPct,
}: GymSetRowProps) {
  const done = Boolean(set.completed);
  const [showBurst, setShowBurst] = useState(false);

  const bumpWeight = (dir: 1 | -1) => {
    if (done) return;
    soundFx.playClick(dir > 0 ? 1200 : 900);
    const next = Math.max(0, Math.round(((set.weight || 0) + dir * weightStep) * 10) / 10);
    onChange({ weight: next });
  };

  const bumpReps = (dir: 1 | -1) => {
    if (done) return;
    soundFx.playClick(dir > 0 ? 1200 : 900);
    onChange({ reps: Math.max(0, (set.reps || 0) + dir) });
  };

  const handleCompleteWithBurst = () => {
    if (!done) {
      setShowBurst(true);
    }
    onComplete();
  };

  const hasDelta = typeof deltaPct === 'number';
  const deltaUp = hasDelta && deltaPct! > 0;
  const deltaDown = hasDelta && deltaPct! < 0;
  const deltaFlat = hasDelta && deltaPct === 0;

  return (
    <div
      className={cn(
        'rounded-2xl border p-3 space-y-2.5 transition-colors',
        done
          ? deltaUp
            ? 'bg-emerald-500/10 border-emerald-500/40'
            : 'bg-emerald-500/10 border-emerald-500/35'
          : 'bg-card border-border/70'
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-bold text-muted-foreground font-mono">
          Set {setNumber}
        </span>

        <div className="flex items-center gap-2">
          {previousLabel && previousLabel !== '—' && (
            <span className="text-[11px] font-mono text-muted-foreground">
              Prev <span className="text-foreground/80 font-semibold">{previousLabel}</span>
            </span>
          )}
          {hasDelta && (set.weight > 0 && set.reps > 0) && (
            <span
              className={cn(
                'inline-flex items-center gap-0.5 text-[11px] font-bold px-1.5 py-0.5 rounded-full border',
                deltaUp &&
                  'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30',
                deltaDown &&
                  'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30',
                deltaFlat && 'bg-secondary text-muted-foreground border-border'
              )}
            >
              {deltaUp && <TrendingUp size={11} />}
              {deltaDown && <TrendingDown size={11} />}
              {deltaFlat && <EqualIcon size={11} />}
              {deltaUp ? `+${deltaPct}%` : deltaDown ? `${deltaPct}%` : '='}
            </span>
          )}
          {done && (
            <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
              Logged
            </span>
          )}
        </div>
      </div>

      {/* Weight + Reps with big steppers */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground text-center">
            kg
          </p>
          <div className="flex items-center gap-1">
            <button
              type="button"
              disabled={done}
              onClick={() => bumpWeight(-1)}
              className={cn(
                'h-12 w-12 rounded-xl border flex items-center justify-center shrink-0 touch-manipulation',
                'active:scale-95 transition-transform',
                done
                  ? 'opacity-40 border-border bg-secondary/30'
                  : 'border-border bg-secondary/50 hover:bg-secondary text-foreground'
              )}
              aria-label="Decrease weight"
            >
              <Minus size={18} />
            </button>
            <input
              type="number"
              inputMode="decimal"
              step={weightStep}
              disabled={done}
              value={set.weight === 0 ? '' : set.weight}
              placeholder="0"
              onChange={(e) => onChange({ weight: parseFloat(e.target.value) || 0 })}
              className={cn(
                'flex-1 h-12 min-w-0 text-center font-mono font-bold text-base rounded-xl border bg-background focus:outline-none focus:ring-2 focus:ring-primary',
                done && 'border-transparent bg-transparent text-emerald-700 dark:text-emerald-400'
              )}
            />
            <button
              type="button"
              disabled={done}
              onClick={() => bumpWeight(1)}
              className={cn(
                'h-12 w-12 rounded-xl border flex items-center justify-center shrink-0 touch-manipulation',
                'active:scale-95 transition-transform',
                done
                  ? 'opacity-40 border-border bg-secondary/30'
                  : 'border-border bg-secondary/50 hover:bg-secondary text-foreground'
              )}
              aria-label="Increase weight"
            >
              <Plus size={18} />
            </button>
          </div>
        </div>

        <div className="space-y-1">
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground text-center">
            Reps
          </p>
          <div className="flex items-center gap-1">
            <button
              type="button"
              disabled={done}
              onClick={() => bumpReps(-1)}
              className={cn(
                'h-12 w-12 rounded-xl border flex items-center justify-center shrink-0 touch-manipulation',
                'active:scale-95 transition-transform',
                done
                  ? 'opacity-40 border-border bg-secondary/30'
                  : 'border-border bg-secondary/50 hover:bg-secondary text-foreground'
              )}
              aria-label="Decrease reps"
            >
              <Minus size={18} />
            </button>
            <input
              type="number"
              inputMode="numeric"
              disabled={done}
              value={set.reps === 0 ? '' : set.reps}
              placeholder="0"
              onChange={(e) => onChange({ reps: parseInt(e.target.value) || 0 })}
              className={cn(
                'flex-1 h-12 min-w-0 text-center font-mono font-bold text-base rounded-xl border bg-background focus:outline-none focus:ring-2 focus:ring-primary',
                done && 'border-transparent bg-transparent text-emerald-700 dark:text-emerald-400'
              )}
            />
            <button
              type="button"
              disabled={done}
              onClick={() => bumpReps(1)}
              className={cn(
                'h-12 w-12 rounded-xl border flex items-center justify-center shrink-0 touch-manipulation',
                'active:scale-95 transition-transform',
                done
                  ? 'opacity-40 border-border bg-secondary/30'
                  : 'border-border bg-secondary/50 hover:bg-secondary text-foreground'
              )}
              aria-label="Increase reps"
            >
              <Plus size={18} />
            </button>
          </div>
        </div>
      </div>

      {/* Complete — full width thumb target with tactile burst */}
      <div className="relative">
        <ForgeSparkBurst active={showBurst} onComplete={() => setShowBurst(false)} />
        <button
          type="button"
          onClick={handleCompleteWithBurst}
          className={cn(
            'w-full h-14 rounded-xl font-bold text-sm flex items-center justify-center gap-2 touch-manipulation active:scale-[0.98] transition-all relative z-10',
            done
              ? 'bg-emerald-600 text-white shadow-[0_0_16px_rgba(16,185,129,0.35)]'
              : 'bg-primary text-primary-foreground shadow-md'
          )}
        >
          <Check size={20} strokeWidth={2.5} />
          {done ? 'Completed — tap to undo' : 'Complete set'}
        </button>
      </div>
    </div>
  );
}
