import React, { useState } from 'react';
import { Proposal, Workout, WorkoutSetItem } from '../types';
import { Card, CardContent, CardHeader, CardTitle } from './ui/Card';
import { Button } from './ui/Button';
import { 
  Brain, 
  Check, 
  X, 
  AlertTriangle, 
  CheckCircle2, 
  XCircle, 
  ArrowRight, 
  Calendar, 
  Dumbbell, 
  Sparkles,
  RefreshCw,
  Layers
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

export function ProposalDiffCard({
  proposal,
  currentWorkout,
  onApprove,
  onDiscard,
  onRebase,
  compact = false
}: ProposalDiffCardProps) {
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const isPending = proposal.status === 'PENDING_APPROVAL';
  const isExecuted = proposal.status === 'EXECUTED';
  const isDiscarded = proposal.status === 'DISCARDED';
  const isConflict = proposal.status === 'REJECTED_CONFLICT';

  const currentVersion = currentWorkout ? currentWorkout.version : proposal.baseVersion;
  const hasVersionConflict = isPending && currentWorkout && currentWorkout.version !== proposal.baseVersion;

  const handleApprove = async () => {
    if (!onApprove) return;
    setLoading(true);
    setErrorMsg(null);
    try {
      await onApprove(proposal.id);
    } catch (err: any) {
      setErrorMsg(err.message || 'Execution failed due to concurrency conflict');
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

  // Helper to diff sets
  const beforeSets: WorkoutSetItem[] = proposal.beforeState?.sets || [];
  const afterSets: WorkoutSetItem[] = proposal.afterState?.sets || [];

  const beforeDate = proposal.beforeState?.scheduledDate;
  const afterDate = proposal.afterState?.scheduledDate;
  const dateChanged = beforeDate && afterDate && beforeDate !== afterDate;

  return (
    <Card className={cn(
      "border overflow-hidden transition-all shadow-sm",
      isPending && !hasVersionConflict && "border-primary/40 bg-card",
      hasVersionConflict && "border-amber-500/50 bg-amber-500/5",
      isConflict && "border-destructive/40 bg-destructive/5",
      isExecuted && "border-emerald-500/30 bg-emerald-500/5",
      isDiscarded && "border-border/60 bg-secondary/10 opacity-80"
    )}>
      {/* Header */}
      <CardHeader className="p-4 bg-secondary/30 border-b border-border/50 flex flex-row items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className={cn(
            "p-1.5 rounded-md text-white shrink-0",
            isExecuted ? "bg-emerald-600" :
            isConflict || hasVersionConflict ? "bg-amber-600" :
            isDiscarded ? "bg-muted-foreground" : "bg-primary"
          )}>
            <Sparkles size={16} />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-sm truncate">
                {proposal.afterState?.title || proposal.beforeState?.title || 'Workout Proposal'}
              </span>
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
              <span>Target: Workout</span>
              <span>•</span>
              <span className="font-mono font-medium">Base v{proposal.baseVersion}</span>
              {currentWorkout && (
                <>
                  <span>•</span>
                  <span className={cn(
                    "font-mono font-medium",
                    hasVersionConflict ? "text-amber-500 font-bold" : "text-emerald-500"
                  )}>
                    Live v{currentWorkout.version}
                  </span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Status Badge */}
        <div className="shrink-0">
          {isPending && !hasVersionConflict && (
            <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full bg-primary/10 text-primary border border-primary/20">
              Pending Approval
            </span>
          )}
          {hasVersionConflict && (
            <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/30">
              <AlertTriangle size={12} /> OCC Conflict
            </span>
          )}
          {isExecuted && (
            <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">
              <CheckCircle2 size={12} /> Executed
            </span>
          )}
          {isConflict && (
            <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full bg-destructive/20 text-destructive border border-destructive/30">
              <XCircle size={12} /> Rejected Conflict
            </span>
          )}
          {isDiscarded && (
            <span className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full bg-muted text-muted-foreground">
              Discarded
            </span>
          )}
        </div>
      </CardHeader>

      <CardContent className="p-4 space-y-4 text-sm">
        {/* Proposal Summary / Rationale */}
        <div className="bg-secondary/20 rounded-lg p-3 border border-border/40">
          <div className="text-xs font-medium text-muted-foreground mb-1 uppercase tracking-wider">AI Rationale & Summary</div>
          <p className="text-foreground font-medium text-sm leading-relaxed">
            {proposal.summary}
          </p>
        </div>

        {/* OCC Conflict Alert if version mismatch */}
        {(hasVersionConflict || isConflict) && (
          <div className="rounded-lg p-3 bg-amber-500/10 border border-amber-500/30 text-amber-700 dark:text-amber-300 text-xs space-y-1">
            <div className="font-semibold flex items-center gap-1.5">
              <AlertTriangle size={14} /> Optimistic Concurrency Control (OCC) Alert
            </div>
            <p>
              This recommendation was formulated against <strong>v{proposal.baseVersion}</strong>, but the workout was modified and is now at <strong>v{currentVersion}</strong>. Executing without rebasing would overwrite interim edits.
            </p>
          </div>
        )}

        {/* Error message */}
        {errorMsg && (
          <div className="rounded-lg p-3 bg-destructive/10 border border-destructive/30 text-destructive text-xs">
            {errorMsg}
          </div>
        )}

        {/* Schedule Change Diff */}
        {dateChanged && (
          <div className="flex items-center justify-between text-xs p-2.5 rounded-md bg-secondary/30 border border-border/50">
            <div className="flex items-center gap-2">
              <Calendar size={14} className="text-primary" />
              <span className="text-muted-foreground">Scheduled Date:</span>
            </div>
            <div className="flex items-center gap-2 font-mono font-medium">
              <span className="line-through text-muted-foreground">{beforeDate}</span>
              <ArrowRight size={12} className="text-primary" />
              <span className="text-primary font-bold">{afterDate}</span>
            </div>
          </div>
        )}

        {/* Set-by-Set Visual Diff */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs font-semibold text-muted-foreground px-1">
            <span className="flex items-center gap-1.5">
              <Layers size={13} />
              Set Modifications Diff
            </span>
            <span>Before vs After</span>
          </div>

          <div className="divide-y divide-border/40 border border-border/50 rounded-lg overflow-hidden bg-background">
            {afterSets.map((afterSet, idx) => {
              const beforeSet = beforeSets[idx];
              const isNewSet = !beforeSet;
              const weightDiff = beforeSet ? afterSet.weight - beforeSet.weight : afterSet.weight;
              const repsDiff = beforeSet ? afterSet.reps - beforeSet.reps : afterSet.reps;
              const isChanged = !beforeSet || weightDiff !== 0 || repsDiff !== 0 || beforeSet.exercise !== afterSet.exercise;

              return (
                <div 
                  key={afterSet.id || idx} 
                  className={cn(
                    "p-2.5 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2 transition-colors",
                    isChanged && "bg-primary/5 font-medium"
                  )}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="w-5 h-5 rounded bg-secondary flex items-center justify-center font-mono text-[10px] text-muted-foreground shrink-0">
                      {idx + 1}
                    </span>
                    <span className="truncate text-foreground font-semibold">
                      {afterSet.exercise}
                    </span>
                    {isNewSet && (
                      <span className="px-1.5 py-0.5 rounded text-[10px] bg-emerald-500/20 text-emerald-600 font-bold uppercase tracking-wider">
                        +New Set
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2 self-end sm:self-auto font-mono">
                    {beforeSet && isChanged && (
                      <span className="text-muted-foreground line-through text-[11px]">
                        {beforeSet.weight}kg × {beforeSet.reps}
                      </span>
                    )}
                    {beforeSet && isChanged && <ArrowRight size={11} className="text-primary" />}
                    <span className={cn(
                      "font-bold px-2 py-0.5 rounded",
                      weightDiff > 0 ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" :
                      weightDiff < 0 ? "bg-amber-500/15 text-amber-600 dark:text-amber-400" :
                      repsDiff > 0 ? "bg-primary/15 text-primary" : "text-foreground"
                    )}>
                      {afterSet.weight}kg × {afterSet.reps} reps
                    </span>
                    {weightDiff > 0 && (
                      <span className="text-[10px] text-emerald-600 font-bold">
                        (+{weightDiff}kg)
                      </span>
                    )}
                    {repsDiff > 0 && weightDiff === 0 && (
                      <span className="text-[10px] text-primary font-bold">
                        (+{repsDiff} reps)
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Actions */}
        {isPending && (
          <div className="pt-2 flex flex-col sm:flex-row gap-2">
            {!hasVersionConflict ? (
              <>
                <Button 
                  className="flex-1 font-semibold" 
                  size="sm" 
                  onClick={handleApprove}
                  disabled={loading}
                >
                  <Check size={16} className="mr-1.5" />
                  {loading ? 'Executing with OCC...' : `Approve & Apply (v${proposal.baseVersion} → v${proposal.baseVersion + 1})`}
                </Button>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={handleDiscard}
                  disabled={loading}
                  className="hover:bg-destructive/10 hover:text-destructive hover:border-destructive/30"
                >
                  <X size={16} className="mr-1.5" /> Discard
                </Button>
              </>
            ) : (
              <>
                {onRebase && (
                  <Button 
                    className="flex-1 bg-amber-600 hover:bg-amber-700 text-white font-semibold" 
                    size="sm" 
                    onClick={() => onRebase(proposal)}
                  >
                    <RefreshCw size={14} className="mr-1.5" /> Rebase against v{currentVersion}
                  </Button>
                )}
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={handleDiscard}
                  disabled={loading}
                >
                  <X size={14} className="mr-1.5" /> Reject Conflict
                </Button>
              </>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
