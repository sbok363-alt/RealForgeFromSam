import React, { useMemo, useState } from 'react';
import { Proposal, Workout, WorkoutSetItem } from '../types';
import { Card, CardContent, CardHeader } from './ui/Card';
import { Button } from './ui/Button';
import { 
  Check, 
  X, 
  AlertTriangle, 
  CheckCircle2, 
  XCircle, 
  ArrowRight, 
  Calendar, 
  Sparkles,
  RefreshCw,
  TrendingUp,
  Minus,
  Plus,
  Dumbbell
} from 'lucide-react';
import { cn } from '../lib/utils';

interface ProposalDiffCardProps {
  key?: React.Key;
  proposal: Proposal;
  currentWorkout?: Workout | null;
  onApprove?: (proposalId: string) => Promise<void>;
  onDiscard?: (proposalId: string) => Promise<void>;
  onRebase?: (proposal: Proposal) => void;
  compact?: boolean;
}

interface SetChange {
  exercise: string;
  kind: 'added' | 'removed' | 'weight_up' | 'weight_down' | 'reps_up' | 'reps_down' | 'same' | 'swapped';
  before?: WorkoutSetItem;
  after?: WorkoutSetItem;
  weightDelta: number;
  repsDelta: number;
}

function analyzeChanges(beforeSets: WorkoutSetItem[], afterSets: WorkoutSetItem[]): {
  changes: SetChange[];
  impactChips: { label: string; tone: 'up' | 'down' | 'neutral' | 'new' }[];
  changedCount: number;
} {
  const changes: SetChange[] = [];
  const maxLen = Math.max(beforeSets.length, afterSets.length);

  for (let i = 0; i < maxLen; i++) {
    const before = beforeSets[i];
    const after = afterSets[i];

    if (!before && after) {
      changes.push({
        exercise: after.exercise,
        kind: 'added',
        after,
        weightDelta: after.weight,
        repsDelta: after.reps,
      });
      continue;
    }
    if (before && !after) {
      changes.push({
        exercise: before.exercise,
        kind: 'removed',
        before,
        weightDelta: -before.weight,
        repsDelta: -before.reps,
      });
      continue;
    }
    if (!before || !after) continue;

    const weightDelta = after.weight - before.weight;
    const repsDelta = after.reps - before.reps;
    const exerciseChanged = before.exercise !== after.exercise;

    let kind: SetChange['kind'] = 'same';
    if (exerciseChanged) kind = 'swapped';
    else if (weightDelta > 0) kind = 'weight_up';
    else if (weightDelta < 0) kind = 'weight_down';
    else if (repsDelta > 0) kind = 'reps_up';
    else if (repsDelta < 0) kind = 'reps_down';

    changes.push({
      exercise: after.exercise,
      kind,
      before,
      after,
      weightDelta,
      repsDelta,
    });
  }

  const meaningful = changes.filter(c => c.kind !== 'same');
  const chips: { label: string; tone: 'up' | 'down' | 'neutral' | 'new' }[] = [];

  const weightUps = meaningful.filter(c => c.kind === 'weight_up');
  const weightDowns = meaningful.filter(c => c.kind === 'weight_down');
  const repsUps = meaningful.filter(c => c.kind === 'reps_up');
  const added = meaningful.filter(c => c.kind === 'added');

  if (weightUps.length) {
    const total = weightUps.reduce((s, c) => s + c.weightDelta, 0);
    const unique = [...new Set(weightUps.map(c => c.exercise))];
    chips.push({
      label: unique.length === 1
        ? `+${weightUps[0].weightDelta}kg on ${unique[0]}`
        : `+${total}kg load across ${unique.length} lifts`,
      tone: 'up',
    });
  }
  if (repsUps.length && !weightUps.length) {
    chips.push({
      label: `+${repsUps.reduce((s, c) => s + c.repsDelta, 0)} total reps`,
      tone: 'up',
    });
  }
  if (added.length) {
    chips.push({
      label: `${added.length} new set${added.length > 1 ? 's' : ''}`,
      tone: 'new',
    });
  }
  if (weightDowns.length) {
    chips.push({
      label: 'Load reduced (deload / recovery)',
      tone: 'down',
    });
  }
  if (!chips.length && meaningful.length) {
    chips.push({ label: `${meaningful.length} adjustment${meaningful.length > 1 ? 's' : ''}`, tone: 'neutral' });
  }

  return { changes, impactChips: chips, changedCount: meaningful.length };
}

export function ProposalDiffCard({
  proposal,
  currentWorkout,
  onApprove,
  onDiscard,
  onRebase,
  compact = false,
}: ProposalDiffCardProps) {
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const isPending = proposal.status === 'PENDING_APPROVAL';
  const isExecuted = proposal.status === 'EXECUTED';
  const isDiscarded = proposal.status === 'DISCARDED';
  const isConflict = proposal.status === 'REJECTED_CONFLICT';

  const currentVersion = currentWorkout ? currentWorkout.version : proposal.baseVersion;
  const hasVersionConflict = isPending && currentWorkout && currentWorkout.version !== proposal.baseVersion;

  const beforeSets: WorkoutSetItem[] = proposal.beforeState?.sets || [];
  const afterSets: WorkoutSetItem[] = proposal.afterState?.sets || [];
  const beforeDate = proposal.beforeState?.scheduledDate;
  const afterDate = proposal.afterState?.scheduledDate;
  const dateChanged = Boolean(beforeDate && afterDate && beforeDate !== afterDate);
  const title = proposal.afterState?.title || proposal.beforeState?.title || 'Workout';

  const { changes, impactChips, changedCount } = useMemo(
    () => analyzeChanges(beforeSets, afterSets),
    [beforeSets, afterSets]
  );

  const visibleChanges = changes.filter(c => c.kind !== 'same');
  const displayRows = compact ? visibleChanges.slice(0, 4) : visibleChanges;

  const handleApprove = async () => {
    if (!onApprove) return;
    setLoading(true);
    setErrorMsg(null);
    try {
      await onApprove(proposal.id);
    } catch (err: any) {
      setErrorMsg(err.message || 'Could not apply — the workout may have changed. Try rebase.');
    } finally {
      setLoading(false);
    }
  };

  const handleDiscard = async () => {
    if (!onDiscard) return;
    setLoading(true);
    try {
      await onDiscard(proposal.id);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className={cn(
      "border overflow-hidden transition-all shadow-sm",
      isPending && !hasVersionConflict && "border-primary/40 bg-card shadow-[0_0_24px_rgba(6,182,212,0.06)]",
      hasVersionConflict && "border-amber-500/50 bg-amber-500/5",
      isConflict && "border-destructive/40 bg-destructive/5",
      isExecuted && "border-emerald-500/30 bg-emerald-500/5",
      isDiscarded && "border-border/60 bg-secondary/10 opacity-80"
    )}>
      {/* Header – coach tone */}
      <CardHeader className="p-4 border-b border-border/50 flex flex-row items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <div className={cn(
            "p-2 rounded-xl shrink-0",
            isExecuted ? "bg-emerald-500/15 text-emerald-500" :
            isConflict || hasVersionConflict ? "bg-amber-500/15 text-amber-500" :
            isDiscarded ? "bg-muted text-muted-foreground" :
            "bg-primary/15 text-primary"
          )}>
            <Sparkles size={18} />
          </div>
          <div className="min-w-0 space-y-1">
            <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              {isPending ? 'Coach recommendation' : isExecuted ? 'Applied' : isDiscarded ? 'Dismissed' : 'Proposal'}
            </p>
            <h3 className="font-bold text-sm leading-snug truncate">{title}</h3>
            {impactChips.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-0.5">
                {impactChips.map((chip, i) => (
                  <span
                    key={i}
                    className={cn(
                      "inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border",
                      chip.tone === 'up' && "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/25",
                      chip.tone === 'down' && "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/25",
                      chip.tone === 'new' && "bg-primary/10 text-primary border-primary/25",
                      chip.tone === 'neutral' && "bg-secondary text-muted-foreground border-border"
                    )}
                  >
                    {chip.tone === 'up' && <TrendingUp size={10} />}
                    {chip.tone === 'new' && <Plus size={10} />}
                    {chip.label}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="shrink-0">
          {isPending && !hasVersionConflict && (
            <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-full bg-primary/10 text-primary border border-primary/20">
              Needs you
            </span>
          )}
          {hasVersionConflict && (
            <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-full bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/30">
              <AlertTriangle size={11} /> Outdated
            </span>
          )}
          {isExecuted && (
            <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-full bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">
              <CheckCircle2 size={11} /> Applied
            </span>
          )}
          {isConflict && (
            <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-full bg-destructive/20 text-destructive border border-destructive/30">
              <XCircle size={11} /> Conflict
            </span>
          )}
          {isDiscarded && (
            <span className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-1 rounded-full bg-muted text-muted-foreground">
              Dismissed
            </span>
          )}
        </div>
      </CardHeader>

      <CardContent className="p-4 space-y-4 text-sm">
        {/* Coach rationale – primary emotional content */}
        <div className="rounded-xl bg-secondary/25 border border-border/40 p-3.5">
          <p className="text-foreground text-sm leading-relaxed font-medium">
            {proposal.summary || 'FORGE suggests a targeted adjustment based on your recent training.'}
          </p>
          <p className="text-[11px] text-muted-foreground mt-2 flex items-center gap-1.5">
            <Dumbbell size={11} />
            {changedCount === 0
              ? 'No set changes detected'
              : `${changedCount} concrete change${changedCount > 1 ? 's' : ''} ready for your approval`}
            {currentWorkout && (
              <span className="text-muted-foreground/70">· based on v{proposal.baseVersion}</span>
            )}
          </p>
        </div>

        {/* Conflict – plain language */}
        {(hasVersionConflict || isConflict) && (
          <div className="rounded-xl p-3.5 bg-amber-500/10 border border-amber-500/30 text-amber-800 dark:text-amber-200 text-xs space-y-1.5">
            <div className="font-bold flex items-center gap-1.5">
              <AlertTriangle size={14} />
              This recommendation is based on an older version
            </div>
            <p className="leading-relaxed opacity-90">
              You (or another update) changed the workout after FORGE prepared this. Applying it now could overwrite those edits. Rebase to refresh the suggestion against the current plan.
            </p>
          </div>
        )}

        {errorMsg && (
          <div className="rounded-xl p-3 bg-destructive/10 border border-destructive/30 text-destructive text-xs">
            {errorMsg}
          </div>
        )}

        {/* Schedule shift */}
        {dateChanged && (
          <div className="flex items-center justify-between text-xs p-3 rounded-xl bg-secondary/30 border border-border/50">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Calendar size={14} className="text-primary" />
              <span>Session moved</span>
            </div>
            <div className="flex items-center gap-2 font-medium">
              <span className="line-through text-muted-foreground">{beforeDate}</span>
              <ArrowRight size={12} className="text-primary" />
              <span className="text-primary font-bold">{afterDate}</span>
            </div>
          </div>
        )}

        {/* Human-readable set changes */}
        {displayRows.length > 0 && (
          <div className="space-y-2">
            <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground px-0.5">
              What changes
            </p>
            <div className="rounded-xl border border-border/50 overflow-hidden divide-y divide-border/40 bg-background/50">
              {displayRows.map((row, idx) => (
                <div
                  key={idx}
                  className={cn(
                    "px-3 py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 text-xs",
                    (row.kind === 'weight_up' || row.kind === 'reps_up' || row.kind === 'added') && "bg-emerald-500/[0.04]",
                    (row.kind === 'weight_down' || row.kind === 'reps_down' || row.kind === 'removed') && "bg-amber-500/[0.04]"
                  )}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={cn(
                      "w-5 h-5 rounded-md flex items-center justify-center shrink-0",
                      row.kind === 'added' && "bg-emerald-500/15 text-emerald-600",
                      row.kind === 'removed' && "bg-amber-500/15 text-amber-600",
                      (row.kind === 'weight_up' || row.kind === 'reps_up') && "bg-emerald-500/15 text-emerald-600",
                      (row.kind === 'weight_down' || row.kind === 'reps_down') && "bg-amber-500/15 text-amber-600",
                      row.kind === 'swapped' && "bg-primary/15 text-primary",
                      row.kind === 'same' && "bg-secondary text-muted-foreground"
                    )}>
                      {row.kind === 'added' ? <Plus size={12} /> :
                       row.kind === 'removed' ? <Minus size={12} /> :
                       row.kind === 'weight_up' || row.kind === 'reps_up' ? <TrendingUp size={12} /> :
                       <ArrowRight size={12} />}
                    </span>
                    <span className="font-semibold truncate">{row.exercise}</span>
                  </div>

                  <div className="flex items-center gap-2 self-end sm:self-auto font-mono text-[11px]">
                    {row.before && row.kind !== 'added' && (
                      <span className="text-muted-foreground line-through">
                        {row.before.weight}kg × {row.before.reps}
                      </span>
                    )}
                    {row.before && row.after && row.kind !== 'added' && row.kind !== 'removed' && (
                      <ArrowRight size={11} className="text-muted-foreground" />
                    )}
                    {row.after && row.kind !== 'removed' && (
                      <span className={cn(
                        "font-bold px-1.5 py-0.5 rounded",
                        row.weightDelta > 0 && "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
                        row.weightDelta < 0 && "bg-amber-500/15 text-amber-600 dark:text-amber-400",
                        row.weightDelta === 0 && row.repsDelta > 0 && "bg-primary/15 text-primary",
                        row.weightDelta === 0 && row.repsDelta <= 0 && "text-foreground"
                      )}>
                        {row.after.weight}kg × {row.after.reps}
                      </span>
                    )}
                    {row.weightDelta > 0 && (
                      <span className="text-emerald-600 dark:text-emerald-400 font-bold">+{row.weightDelta}kg</span>
                    )}
                    {row.weightDelta === 0 && row.repsDelta > 0 && (
                      <span className="text-primary font-bold">+{row.repsDelta} reps</span>
                    )}
                    {row.kind === 'added' && (
                      <span className="text-[10px] font-bold uppercase tracking-wide text-emerald-600">new</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
            {compact && visibleChanges.length > 4 && (
              <p className="text-[11px] text-muted-foreground text-center">
                +{visibleChanges.length - 4} more change{visibleChanges.length - 4 > 1 ? 's' : ''}
              </p>
            )}
          </div>
        )}

        {/* Actions – coach language */}
        {isPending && (
          <div className="pt-1 flex flex-col sm:flex-row gap-2">
            {!hasVersionConflict ? (
              <>
                <Button
                  className="flex-1 font-bold h-11"
                  size="sm"
                  onClick={handleApprove}
                  disabled={loading}
                >
                  <Check size={16} className="mr-1.5" strokeWidth={2.5} />
                  {loading ? 'Applying…' : 'Accept recommendation'}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleDiscard}
                  disabled={loading}
                  className="h-11 hover:bg-destructive/10 hover:text-destructive hover:border-destructive/30"
                >
                  <X size={16} className="mr-1.5" />
                  Not now
                </Button>
              </>
            ) : (
              <>
                {onRebase && (
                  <Button
                    className="flex-1 bg-amber-600 hover:bg-amber-700 text-white font-bold h-11"
                    size="sm"
                    onClick={() => onRebase(proposal)}
                  >
                    <RefreshCw size={14} className="mr-1.5" />
                    Refresh against current plan
                  </Button>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleDiscard}
                  disabled={loading}
                  className="h-11"
                >
                  <X size={14} className="mr-1.5" />
                  Dismiss
                </Button>
              </>
            )}
          </div>
        )}

        {isPending && !hasVersionConflict && (
          <p className="text-[10px] text-center text-muted-foreground">
            Nothing is written until you accept. Every change stays reversible in Audit Logs.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
