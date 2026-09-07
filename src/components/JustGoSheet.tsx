import React, { useMemo, useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Workout, WorkoutSetItem } from '../types';
import { analyzeExerciseProgression } from '../lib/progression';
import {
  scoreReadiness,
  applyReadinessToSets,
  ReadinessInput,
  ReadinessResult,
  ReadinessScore,
} from '../lib/readiness';
import { Button } from './ui/Button';
import {
  Zap,
  X,
  Dumbbell,
  Clock,
  ArrowRight,
  Sparkles,
  Check,
  Moon,
  Activity,
  Flame,
  Brain,
} from 'lucide-react';
import { cn } from '../lib/utils';
import { useWorkoutStore } from '../store/useWorkoutStore';

interface JustGoSheetProps {
  workouts: Workout[];
  open: boolean;
  onClose: () => void;
}

interface PreparedSession {
  base: Workout;
  sets: WorkoutSetItem[];
  changes: { exercise: string; from: string; to: string; reason: string }[];
  estimateMinutes: number;
  exerciseCount: number;
  rationale: string;
}

function isPlanned(w: Workout) {
  return w.status === 'PLANNED' || w.status === 'planned';
}

function isCompleted(w: Workout) {
  return w.status === 'COMPLETED' || w.status === 'completed';
}

function prepareJustGoSession(
  workouts: Workout[],
  readiness: ReadinessResult | null
): PreparedSession | null {
  const today = new Date().toISOString().split('T')[0];
  const planned = workouts
    .filter(isPlanned)
    .sort((a, b) => (a.scheduledDate || '').localeCompare(b.scheduledDate || ''));

  let base =
    planned.find((w) => w.scheduledDate === today) ||
    planned[0] ||
    null;

  if (!base) {
    const completed = workouts
      .filter(isCompleted)
      .sort((a, b) => (b.scheduledDate || '').localeCompare(a.scheduledDate || ''));
    if (!completed[0]) return null;
    base = {
      ...completed[0],
      id: crypto.randomUUID(),
      status: 'PLANNED',
      scheduledDate: today,
      version: 1,
      title: completed[0].title || 'Just Go Session',
    };
  }

  const rawSets: WorkoutSetItem[] = (base.sets || []).map((s) => ({ ...s }));
  if (!rawSets.length && base.exercises?.length) {
    for (const ex of base.exercises) {
      for (const s of ex.sets || []) {
        rawSets.push({
          id: s.id || crypto.randomUUID(),
          exercise: ex.exerciseId,
          weight: s.weight,
          reps: s.reps,
          rir: s.rir,
          completed: false,
        });
      }
    }
  }

  const changes: PreparedSession['changes'] = [];
  let adjusted = rawSets.map((s) => {
    if (!s.exercise) return { ...s, completed: false };
    try {
      const report = analyzeExerciseProgression(workouts, s.exercise);
      const target = report.nextTarget;
      if (
        target &&
        target.targetWeight > 0 &&
        s.weight > 0 &&
        target.targetWeight !== s.weight
      ) {
        const from = `${s.weight}×${s.reps}`;
        const newWeight = target.targetWeight;
        const newReps = target.targetRepsMin || s.reps;
        changes.push({
          exercise: s.exercise,
          from,
          to: `${newWeight}×${newReps}`,
          reason:
            report.state === 'PROGRESSING'
              ? 'Progressing — overload applied'
              : report.state === 'STALLING'
              ? 'Stalling — hold or slight nudge'
              : 'Target from progression engine',
        });
        return {
          ...s,
          weight: newWeight,
          reps: newReps,
          rir: target.suggestedRIR ?? s.rir,
          completed: false,
        };
      }
    } catch {
      // keep
    }
    return { ...s, completed: false };
  });

  if (readiness && readiness.level === 'low') {
    const { sets: trimmed, changed } = applyReadinessToSets(adjusted, readiness);
    adjusted = trimmed;
    if (changed > 0) {
      changes.unshift({
        exercise: 'Session load',
        from: 'Planned',
        to: `−${Math.round((1 - readiness.loadModifier) * 100)}% load · −${Math.round((1 - readiness.volumeModifier) * 100)}% volume`,
        reason: readiness.prescription,
      });
    }
  }

  const seen = new Set<string>();
  const uniqueChanges = changes.filter((c) => {
    if (seen.has(c.exercise)) return false;
    seen.add(c.exercise);
    return true;
  });

  const exerciseCount = new Set(adjusted.map((s) => s.exercise).filter(Boolean)).size;
  const estimateMinutes = Math.max(25, exerciseCount * 12 + adjusted.length * 2);

  let rationale = 'Based on your current plan and recent performance.';
  if (readiness) {
    rationale = readiness.summary + ' ' + readiness.prescription;
  } else if (uniqueChanges.length) {
    rationale = `FORGE adjusted ${uniqueChanges.length} lift${uniqueChanges.length > 1 ? 's' : ''} from progression data.`;
  }

  return {
    base,
    sets: adjusted,
    changes: uniqueChanges.slice(0, 5),
    estimateMinutes,
    exerciseCount,
    rationale,
  };
}

const DEFAULT_READINESS: ReadinessInput = {
  sleep: 3,
  soreness: 3,
  motivation: 3,
  stress: 3,
};

function ScoreRow({
  label,
  icon: Icon,
  value,
  lowLabel,
  highLabel,
  onChange,
}: {
  label: string;
  icon: React.ElementType;
  value: ReadinessScore;
  lowLabel: string;
  highLabel: string;
  onChange: (v: ReadinessScore) => void;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs">
        <span className="font-semibold flex items-center gap-1.5">
          <Icon size={13} className="text-primary" />
          {label}
        </span>
        <span className="text-muted-foreground font-mono">{value}/5</span>
      </div>
      <div className="flex gap-1.5">
        {([1, 2, 3, 4, 5] as ReadinessScore[]).map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => onChange(n)}
            className={cn(
              'flex-1 h-10 rounded-xl text-xs font-bold border touch-manipulation active:scale-95 transition-all',
              value === n
                ? 'bg-primary text-primary-foreground border-primary'
                : 'bg-secondary/40 border-border/60 text-muted-foreground hover:bg-secondary'
            )}
          >
            {n}
          </button>
        ))}
      </div>
      <div className="flex justify-between text-[10px] text-muted-foreground px-0.5">
        <span>{lowLabel}</span>
        <span>{highLabel}</span>
      </div>
    </div>
  );
}

export function JustGoSheet({ workouts, open, onClose }: JustGoSheetProps) {
  const startWorkout = useWorkoutStore((s) => s.startWorkout);
  const [step, setStep] = useState<'readiness' | 'session'>('readiness');
  const [readinessInput, setReadinessInput] = useState<ReadinessInput>(DEFAULT_READINESS);
  const [readiness, setReadiness] = useState<ReadinessResult | null>(null);
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    if (open) {
      setStep('readiness');
      setReadinessInput(DEFAULT_READINESS);
      setReadiness(null);
    }
  }, [open]);

  const prepared = useMemo(
    () => (open && step === 'session' ? prepareJustGoSession(workouts, readiness) : null),
    [open, step, workouts, readiness]
  );

  const handleReadinessContinue = () => {
    const result = scoreReadiness(readinessInput);
    setReadiness(result);
    setStep('session');
  };

  const handleAccept = () => {
    if (!prepared) return;
    setStarting(true);
    const session: Workout = {
      ...prepared.base,
      status: 'IN_PROGRESS',
      scheduledDate: new Date().toISOString().split('T')[0],
      sets: prepared.sets,
      startedAt: Date.now(),
    };
    startWorkout(session);
    setStarting(false);
    onClose();
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center bg-background/80 backdrop-blur-sm p-0 sm:p-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ y: 40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 40, opacity: 0 }}
            transition={{ type: 'spring', damping: 28, stiffness: 320 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md bg-card border border-border rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden max-h-[92vh] overflow-y-auto"
          >
            <div className="p-5 space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-2xl bg-primary/15 text-primary">
                    <Zap size={22} />
                  </div>
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-wider text-primary">
                      Just Go
                    </p>
                    <h2 className="font-display font-bold text-lg leading-tight">
                      {step === 'readiness' ? 'How do you feel?' : prepared?.base.title || 'Today’s session'}
                    </h2>
                  </div>
                </div>
                <button
                  onClick={onClose}
                  className="p-2 rounded-xl text-muted-foreground hover:bg-secondary"
                >
                  <X size={18} />
                </button>
              </div>

              {step === 'readiness' && (
                <>
                  <p className="text-sm text-muted-foreground">
                    Four quick taps. FORGE uses this to protect bad days and push good ones — still as a suggestion you accept.
                  </p>
                  <div className="space-y-4">
                    <ScoreRow
                      label="Sleep"
                      icon={Moon}
                      value={readinessInput.sleep}
                      lowLabel="Rough"
                      highLabel="Great"
                      onChange={(v) => setReadinessInput((r) => ({ ...r, sleep: v }))}
                    />
                    <ScoreRow
                      label="Muscle freshness"
                      icon={Activity}
                      value={readinessInput.soreness}
                      lowLabel="Sore"
                      highLabel="Fresh"
                      onChange={(v) => setReadinessInput((r) => ({ ...r, soreness: v }))}
                    />
                    <ScoreRow
                      label="Motivation"
                      icon={Flame}
                      value={readinessInput.motivation}
                      lowLabel="Low"
                      highLabel="Fired up"
                      onChange={(v) => setReadinessInput((r) => ({ ...r, motivation: v }))}
                    />
                    <ScoreRow
                      label="Stress"
                      icon={Brain}
                      value={readinessInput.stress}
                      lowLabel="Maxed"
                      highLabel="Calm"
                      onChange={(v) => setReadinessInput((r) => ({ ...r, stress: v }))}
                    />
                  </div>
                  <Button className="w-full h-12 font-bold gap-2" onClick={handleReadinessContinue}>
                    Build today’s session <ArrowRight size={16} />
                  </Button>
                  <button
                    type="button"
                    className="w-full text-xs text-muted-foreground hover:text-foreground py-1"
                    onClick={() => {
                      setReadiness(scoreReadiness({ sleep: 3, soreness: 3, motivation: 3, stress: 3 }));
                      setStep('session');
                    }}
                  >
                    Skip readiness — use planned loads
                  </button>
                </>
              )}

              {step === 'session' && !prepared && (
                <p className="text-sm text-muted-foreground py-6 text-center">
                  No plan or history yet. Finish onboarding or add a workout first.
                </p>
              )}

              {step === 'session' && prepared && (
                <>
                  {readiness && (
                    <div
                      className={cn(
                        'rounded-2xl border p-3 text-sm',
                        readiness.level === 'high' && 'border-emerald-500/30 bg-emerald-500/10',
                        readiness.level === 'moderate' && 'border-primary/30 bg-primary/10',
                        readiness.level === 'low' && 'border-amber-500/30 bg-amber-500/10'
                      )}
                    >
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <span className="font-bold text-xs uppercase tracking-wider">
                          Readiness {readiness.score}
                        </span>
                        <span className="text-[11px] font-semibold capitalize">{readiness.level}</span>
                      </div>
                      <p className="text-xs leading-relaxed opacity-90">{readiness.prescription}</p>
                    </div>
                  )}

                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1.5 font-medium">
                      <Dumbbell size={13} className="text-primary" />
                      {prepared.exerciseCount} exercises
                    </span>
                    <span>·</span>
                    <span className="inline-flex items-center gap-1.5 font-medium">
                      <Clock size={13} className="text-primary" />~{prepared.estimateMinutes} min
                    </span>
                    <span>·</span>
                    <span className="font-mono">{prepared.sets.length} sets</span>
                  </div>

                  <p className="text-sm text-foreground/90 leading-relaxed">{prepared.rationale}</p>

                  {prepared.changes.length > 0 && (
                    <div className="rounded-2xl border border-border/60 bg-secondary/25 p-3 space-y-2">
                      <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                        <Sparkles size={12} className="text-primary" />
                        FORGE adjusted
                      </p>
                      {prepared.changes.map((c, i) => (
                        <div key={i} className="text-xs flex flex-col gap-0.5">
                          <span className="font-semibold">{c.exercise}</span>
                          <span className="font-mono text-muted-foreground">
                            {c.from}{' '}
                            <ArrowRight size={10} className="inline text-primary" />{' '}
                            <span className="text-primary font-bold">{c.to}</span>
                          </span>
                          <span className="text-[11px] text-muted-foreground">{c.reason}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="flex flex-col gap-2 pt-1">
                    <Button
                      className="h-12 font-bold gap-2"
                      onClick={handleAccept}
                      disabled={starting}
                    >
                      <Check size={18} strokeWidth={2.5} />
                      Accept & Start
                    </Button>
                    <Button
                      variant="ghost"
                      className="h-10 text-xs"
                      onClick={() => setStep('readiness')}
                    >
                      Back to readiness
                    </Button>
                  </div>
                </>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
