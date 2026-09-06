import React from 'react';
import { PhysiqueSymmetryAudit } from '../../lib/hypertrophy';
import { Scale, CheckCircle2, AlertCircle, ArrowRightLeft, ShieldCheck } from 'lucide-react';
import { cn } from '../../lib/utils';

interface SymmetryBalanceCardProps {
  symmetry: PhysiqueSymmetryAudit;
  className?: string;
}

export const SymmetryBalanceCard: React.FC<SymmetryBalanceCardProps> = ({ symmetry, className }) => {
  const {
    pushSets,
    pullSets,
    legSets,
    coreSets,
    pushPullRatio,
    upperLowerRatio,
    balanceScore,
    feedback
  } = symmetry;

  // Determine ratio health status
  const isPushPullBalanced = pushPullRatio >= 0.75 && pushPullRatio <= 1.35;
  const isUpperLowerBalanced = upperLowerRatio >= 0.8 && upperLowerRatio <= 2.0;

  return (
    <div className={cn("p-4 rounded-2xl bg-secondary/20 border border-border/70 space-y-4", className)}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-primary/10 text-primary">
            <Scale size={16} />
          </div>
          <div>
            <h4 className="text-sm font-bold text-foreground flex items-center gap-2">
              Physique Symmetry & Kinetic Balance
            </h4>
            <span className="text-[11px] text-muted-foreground font-mono">
              Volume ratios to prevent joint overuse & structural imbalances
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-background border border-border/80 shadow-xs">
          <ShieldCheck size={13} className={cn(balanceScore >= 80 ? "text-emerald-500" : "text-amber-500")} />
          <span className="text-xs font-bold font-mono">
            {balanceScore}
          </span>
          <span className="text-[10px] text-muted-foreground">/100</span>
        </div>
      </div>

      {/* Ratios Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* Push vs Pull Ratio */}
        <div className="p-3 rounded-xl bg-background/60 border border-border/50 space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-foreground flex items-center gap-1.5">
              <ArrowRightLeft size={13} className="text-primary" />
              Push : Pull Ratio
            </span>
            <span className={cn(
              "font-mono font-bold px-1.5 py-0.5 rounded text-[11px]",
              isPushPullBalanced ? "bg-emerald-500/15 text-emerald-500" : "bg-amber-500/15 text-amber-500"
            )}>
              {pushPullRatio}x {isPushPullBalanced ? '(Balanced)' : pushPullRatio > 1.35 ? '(Push Heavy)' : '(Pull Heavy)'}
            </span>
          </div>

          {/* Ratio bar visual */}
          <div className="space-y-1">
            <div className="flex justify-between text-[10px] text-muted-foreground font-mono">
              <span>Push: {pushSets} sets</span>
              <span>Pull: {pullSets} sets</span>
            </div>
            <div className="w-full h-2 rounded-full bg-secondary overflow-hidden flex">
              <div
                className="h-full bg-blue-500 transition-all duration-500"
                style={{ width: `${(pushSets / (pushSets + pullSets || 1)) * 100}%` }}
                title="Push Volume"
              />
              <div
                className="h-full bg-indigo-500 transition-all duration-500"
                style={{ width: `${(pullSets / (pushSets + pullSets || 1)) * 100}%` }}
                title="Pull Volume"
              />
            </div>
            <div className="flex justify-between text-[9px] text-muted-foreground">
              <span>Ideal Range: 0.8x – 1.2x</span>
              <span>Serratus & Rotator Cuff Safe</span>
            </div>
          </div>
        </div>

        {/* Upper vs Lower Ratio */}
        <div className="p-3 rounded-xl bg-background/60 border border-border/50 space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-foreground flex items-center gap-1.5">
              <Scale size={13} className="text-primary" />
              Upper : Lower Ratio
            </span>
            <span className={cn(
              "font-mono font-bold px-1.5 py-0.5 rounded text-[11px]",
              isUpperLowerBalanced ? "bg-emerald-500/15 text-emerald-500" : "bg-amber-500/15 text-amber-500"
            )}>
              {upperLowerRatio}x {isUpperLowerBalanced ? '(Proportional)' : upperLowerRatio > 2.0 ? '(Upper Heavy)' : '(Lower Heavy)'}
            </span>
          </div>

          <div className="space-y-1">
            <div className="flex justify-between text-[10px] text-muted-foreground font-mono">
              <span>Upper: {symmetry.upperSets} sets</span>
              <span>Lower: {legSets} sets</span>
            </div>
            <div className="w-full h-2 rounded-full bg-secondary overflow-hidden flex">
              <div
                className="h-full bg-emerald-500 transition-all duration-500"
                style={{ width: `${(symmetry.upperSets / ((symmetry.upperSets + legSets) || 1)) * 100}%` }}
              />
              <div
                className="h-full bg-teal-500 transition-all duration-500"
                style={{ width: `${(legSets / ((symmetry.upperSets + legSets) || 1)) * 100}%` }}
              />
            </div>
            <div className="flex justify-between text-[9px] text-muted-foreground">
              <span>Core: {coreSets} sets</span>
              <span>Total: {symmetry.upperSets + legSets} sets</span>
            </div>
          </div>
        </div>
      </div>

      {/* Actionable Balance Insight */}
      <div className="flex items-start gap-2 p-2.5 rounded-xl bg-background/80 border border-border/60 text-xs">
        {balanceScore >= 80 ? (
          <CheckCircle2 size={15} className="text-emerald-500 shrink-0 mt-0.5" />
        ) : (
          <AlertCircle size={15} className="text-amber-500 shrink-0 mt-0.5" />
        )}
        <p className="text-muted-foreground leading-relaxed text-[11px] sm:text-xs">
          <strong>Coach Observation:</strong> {feedback}
        </p>
      </div>
    </div>
  );
};
