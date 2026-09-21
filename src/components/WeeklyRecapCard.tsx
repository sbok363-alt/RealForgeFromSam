import React from 'react';
import { Card, CardContent } from './ui/Card';
import { Button } from './ui/Button';
import { WeeklyRecap } from '../lib/weeklyRecap';
import {
  Calendar,
  Flame,
  Dumbbell,
  TrendingUp,
  AlertTriangle,
  Target,
  X,
  Sparkles,
  CheckCircle2,
} from 'lucide-react';
import { cn } from '../lib/utils';
import { useNavigate } from 'react-router-dom';

interface WeeklyRecapCardProps {
  recap: WeeklyRecap;
  onDismiss?: () => void;
  compact?: boolean;
}

export function WeeklyRecapCard({ recap, onDismiss, compact = false }: WeeklyRecapCardProps) {
  const navigate = useNavigate();

  const weekLabel = `${recap.weekStart.slice(5)} → ${recap.weekEnd.slice(5)}`;

  return (
    <Card className="border-primary/30 bg-gradient-to-br from-primary/10 via-card to-card overflow-hidden shadow-[0_0_28px_rgba(255,122,50,0.1)]">
      <CardContent className={cn('p-4 sm:p-5 space-y-4', compact && 'p-4 space-y-3')}>
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            <div className="p-2 rounded-xl bg-primary/15 text-primary shrink-0">
              <Sparkles size={18} />
            </div>
            <div className="min-w-0">
              <p className="text-[11px] font-bold uppercase tracking-wider text-primary/80">
                Weekly Recap · {weekLabel}
              </p>
              <h3 className="font-display font-bold text-lg leading-tight mt-0.5">
                {recap.headline}
              </h3>
            </div>
          </div>
          {onDismiss && (
            <button
              onClick={onDismiss}
              className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary shrink-0"
              aria-label="Dismiss recap"
            >
              <X size={16} />
            </button>
          )}
        </div>

        {/* Metrics */}
        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-xl bg-background/60 border border-border/50 p-3 text-center">
            <div className="flex items-center justify-center gap-1 text-muted-foreground text-[10px] font-bold uppercase tracking-wider mb-1">
              <Calendar size={11} /> Sessions
            </div>
            <div className="text-xl font-bold font-mono">
              {recap.sessionsCompleted}
              <span className="text-xs text-muted-foreground font-sans font-medium">
                {' '}/ {Math.max(recap.sessionsPlanned, 3)}
              </span>
            </div>
          </div>
          <div className="rounded-xl bg-background/60 border border-border/50 p-3 text-center">
            <div className="flex items-center justify-center gap-1 text-muted-foreground text-[10px] font-bold uppercase tracking-wider mb-1">
              <Dumbbell size={11} /> Volume
            </div>
            <div className="text-xl font-bold font-mono">
              {recap.totalVolumeKg >= 1000
                ? `${(recap.totalVolumeKg / 1000).toFixed(1)}k`
                : recap.totalVolumeKg}
              <span className="text-xs text-muted-foreground font-sans font-medium"> kg</span>
            </div>
          </div>
          <div className="rounded-xl bg-background/60 border border-border/50 p-3 text-center">
            <div className="flex items-center justify-center gap-1 text-muted-foreground text-[10px] font-bold uppercase tracking-wider mb-1">
              <Flame size={11} /> Consistency
            </div>
            <div
              className={cn(
                'text-xl font-bold font-mono',
                recap.consistencyScore >= 100
                  ? 'text-emerald-500'
                  : recap.consistencyScore >= 66
                  ? 'text-primary'
                  : 'text-amber-500'
              )}
            >
              {recap.consistencyScore}
              <span className="text-xs font-sans font-medium">%</span>
            </div>
          </div>
        </div>

        {/* Coach note */}
        <div className="rounded-xl bg-secondary/30 border border-border/40 p-3.5 space-y-2">
          <p className="text-sm leading-relaxed text-foreground font-medium">{recap.coachNote}</p>
          {recap.prCount > 0 && (
            <p className="text-xs text-emerald-600 dark:text-emerald-400 font-semibold flex items-center gap-1.5">
              <CheckCircle2 size={13} />
              {recap.prCount} PR signal{recap.prCount > 1 ? 's' : ''} this week
            </p>
          )}
        </div>

        {/* Lift highlights */}
        {!compact && recap.topExercises.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              Main lifts
            </p>
            <div className="space-y-1.5">
              {recap.topExercises.map((ex) => (
                <div
                  key={ex.exercise}
                  className="flex items-center justify-between gap-2 text-xs rounded-lg border border-border/40 bg-background/40 px-3 py-2"
                >
                  <span className="font-semibold truncate">{ex.exercise}</span>
                  <span
                    className={cn(
                      'shrink-0 font-bold px-2 py-0.5 rounded-full text-[10px] uppercase tracking-wide',
                      ex.state === 'PROGRESSING' &&
                        'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
                      ex.state === 'STALLING' &&
                        'bg-amber-500/15 text-amber-600 dark:text-amber-400',
                      ex.state === 'REGRESSING' &&
                        'bg-rose-500/15 text-rose-600 dark:text-rose-400',
                      ex.state === 'INSUFFICIENT_DATA' && 'bg-secondary text-muted-foreground'
                    )}
                  >
                    {ex.state === 'PROGRESSING' && ex.deltaE1RM > 0
                      ? `+${ex.deltaE1RM}kg`
                      : ex.state.toLowerCase()}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Muscle deficit */}
        {recap.muscleNotes.length > 0 && (
          <div className="rounded-xl border border-rose-500/30 bg-rose-500/5 p-3 flex items-start gap-2 text-xs">
            <AlertTriangle size={14} className="text-rose-500 shrink-0 mt-0.5" />
            <p className="text-foreground/90 leading-relaxed">{recap.muscleNotes[0]}</p>
          </div>
        )}

        {/* Next focus */}
        <div className="flex items-start gap-2 rounded-xl border border-primary/25 bg-primary/5 p-3">
          <Target size={15} className="text-primary shrink-0 mt-0.5" />
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-primary mb-0.5">
              Next week focus
            </p>
            <p className="text-sm font-medium leading-snug">{recap.nextFocus}</p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-2 pt-0.5">
          <Button
            className="flex-1 h-10 text-xs font-bold gap-1.5"
            onClick={() =>
              navigate('/brain', {
                state: {
                  autoPrompt: `Here is my weekly recap (${recap.weekStart} to ${recap.weekEnd}): ${recap.sessionsCompleted} sessions, ${recap.totalVolumeKg}kg volume, consistency ${recap.consistencyScore}%. Headline: ${recap.headline}. ${recap.coachNote} Focus: ${recap.nextFocus}. Give me one concrete programming adjustment for this week.`,
                },
              })
            }
          >
            <TrendingUp size={14} /> Ask Brain about this week
          </Button>
          <Button
            variant="outline"
            className="h-10 text-xs font-semibold"
            onClick={() => navigate('/progress')}
          >
            Progress
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
