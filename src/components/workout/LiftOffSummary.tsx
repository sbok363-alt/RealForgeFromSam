import React, { useMemo } from 'react';
import { motion } from 'motion/react';
import { Button } from '../ui/Button';
import { CheckCircle2, TrendingUp, Zap, Brain, Target, ArrowRight } from 'lucide-react';
import { Workout } from '../../types';
import { analyzeExerciseProgression } from '../../lib/progression';
import { AnimatedNumber } from '../ui/AnimatedNumber';
import {
  getPreviousExerciseSession,
  currentExerciseVolume,
  volumeDeltaPct,
} from '../../lib/sessionCompare';
import { cn } from '../../lib/utils';
import { useNavigate } from 'react-router-dom';

interface LiftOffSummaryProps {
  workout: Workout;
  allWorkouts?: Workout[];
  onClose: () => void;
}

export function LiftOffSummary({ workout, allWorkouts = [], onClose }: LiftOffSummaryProps) {
  const navigate = useNavigate();

  const stats = useMemo(() => {
    const sets = (workout.sets || []).filter((s) => s.weight > 0 && s.reps > 0);
    const completed = sets.filter((s) => s.completed !== false);
    const totalVolume = completed.reduce((sum, s) => sum + s.weight * s.reps, 0);
    const totalSets = completed.length;

    // Unique exercises
    const byEx = new Map<string, typeof completed>();
    for (const s of completed) {
      const key = s.exercise || 'Unknown';
      if (!byEx.has(key)) byEx.set(key, []);
      byEx.get(key)!.push(s);
    }

    const learnings: { exercise: string; text: string; tone: 'up' | 'warn' | 'neutral' }[] = [];
    let prSignals = 0;

    for (const [ex, exSets] of byEx) {
      const curVol = currentExerciseVolume(exSets);
      const prev = getPreviousExerciseSession(allWorkouts, ex, workout.id);
      if (prev) {
        const d = volumeDeltaPct(curVol, prev.sessionVolume);
        if (d !== null && d >= 5) {
          learnings.push({
            exercise: ex,
            text: `Volume +${d}% vs last session`,
            tone: 'up',
          });
          prSignals++;
        } else if (d !== null && d <= -10) {
          learnings.push({
            exercise: ex,
            text: `Volume ${d}% vs last — recovery or deload signal`,
            tone: 'warn',
          });
        }
      }

      try {
        const report = analyzeExerciseProgression(
          [...allWorkouts.filter((w) => w.id !== workout.id), { ...workout, status: 'COMPLETED' }],
          ex
        );
        if (report.state === 'PROGRESSING' && report.deltaE1RM > 0) {
          const exists = learnings.some((l) => l.exercise === ex && l.tone === 'up');
          if (!exists) {
            learnings.push({
              exercise: ex,
              text: `e1RM trending +${report.deltaE1RM}kg`,
              tone: 'up',
            });
          }
        }
      } catch {
        // ignore
      }
    }

    // Next session expectation (simple)
    let nextExpectation =
      'Next session: match or beat today’s top sets where RIR stayed ≥ 1.';
    if (learnings.some((l) => l.tone === 'up')) {
      nextExpectation =
        'Next session: hold the new loads. Only add weight if you clear the top of the rep range again.';
    } else if (learnings.some((l) => l.tone === 'warn')) {
      nextExpectation =
        'Next session: protect recovery. Same loads or a light technical day is fine.';
    }

    const forgeLearned =
      learnings.length > 0
        ? learnings.slice(0, 3)
        : [
            {
              exercise: 'Session',
              text: 'Logged and versioned. Progression engine updated.',
              tone: 'neutral' as const,
            },
          ];

    return {
      totalVolume: Math.round(totalVolume),
      totalSets,
      exerciseCount: byEx.size,
      prSignals,
      forgeLearned,
      nextExpectation,
    };
  }, [workout, allWorkouts]);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-background/90 backdrop-blur-md transition-opacity" onClick={onClose} />
      
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.9 }}
        transition={{ type: 'spring', damping: 25, stiffness: 400 }}
        className="relative z-10 bg-card w-full max-w-md p-6 sm:p-8 rounded-3xl border border-border shadow-[0_0_50px_-12px_rgba(255,122,50,0.2)] flex flex-col overflow-hidden max-h-[90vh] overflow-y-auto"
      >
        <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-[#FF7A32]/10 blur-3xl rounded-full pointer-events-none" />

        <div className="flex flex-col items-center text-center relative">
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', delay: 0.1, bounce: 0.5 }}
            className="w-16 h-16 bg-emerald-500 rounded-full flex items-center justify-center text-white mb-4 shadow-xl shadow-emerald-500/30"
          >
            <CheckCircle2 size={32} />
          </motion.div>

          <h2 className="text-2xl sm:text-3xl font-display font-black mb-1 text-foreground">
            Session logged
          </h2>
          <p className="text-muted-foreground text-sm mb-5 font-medium">
            {workout.title || 'Workout'} · FORGE updated your history
          </p>
        </div>

        {/* Metrics */}
        <div className="grid grid-cols-3 gap-2 mb-5 relative">
          {[
            { label: 'Volume', value: stats.totalVolume, unit: 'kg' },
            { label: 'Sets', value: stats.totalSets, unit: '' },
            { label: 'Lifts', value: stats.exerciseCount, unit: '' },
          ].map((m) => (
            <div
              key={m.label}
              className="bg-secondary/50 p-3 rounded-2xl border border-border/50 text-center"
            >
              <span className="text-muted-foreground text-[10px] font-bold uppercase tracking-wider block mb-0.5">
                {m.label}
              </span>
              <span className="text-lg font-mono font-black text-foreground">
                <AnimatedNumber value={m.value} format={(v) => Math.round(v).toLocaleString()} />
                {m.unit && (
                  <span className="text-xs font-sans font-medium text-muted-foreground"> {m.unit}</span>
                )}
              </span>
            </div>
          ))}
        </div>

        {/* FORGE learned */}
        <div className="rounded-2xl border border-primary/25 bg-primary/5 p-4 mb-4 space-y-2.5 relative">
          <div className="flex items-center gap-2 text-primary">
            <Brain size={16} />
            <span className="text-xs font-bold uppercase tracking-wider">FORGE learned</span>
          </div>
          <ul className="space-y-2">
            {stats.forgeLearned.map((l, i) => (
              <li key={i} className="flex items-start gap-2 text-sm">
                {l.tone === 'up' ? (
                  <TrendingUp size={14} className="text-emerald-500 shrink-0 mt-0.5" />
                ) : l.tone === 'warn' ? (
                  <Zap size={14} className="text-amber-500 shrink-0 mt-0.5" />
                ) : (
                  <CheckCircle2 size={14} className="text-muted-foreground shrink-0 mt-0.5" />
                )}
                <span>
                  <span className="font-semibold">{l.exercise}:</span>{' '}
                  <span className="text-muted-foreground">{l.text}</span>
                </span>
              </li>
            ))}
          </ul>
          {stats.prSignals > 0 && (
            <p className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1 pt-1">
              <Zap size={12} /> {stats.prSignals} volume PR signal{stats.prSignals > 1 ? 's' : ''} this session
            </p>
          )}
        </div>

        {/* Next expectation */}
        <div className="rounded-2xl border border-border/60 bg-secondary/30 p-4 mb-5 flex items-start gap-2.5 relative">
          <Target size={16} className="text-primary shrink-0 mt-0.5" />
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-0.5">
              Next session expectation
            </p>
            <p className="text-sm font-medium leading-snug">{stats.nextExpectation}</p>
          </div>
        </div>

        <div className="flex flex-col gap-2 relative">
          <Button
            size="lg"
            className="w-full font-bold h-12 gap-2"
            onClick={onClose}
          >
            Zurück zu FORGE <ArrowRight size={16} />
          </Button>
        </div>
      </motion.div>
    </div>
  );
}
