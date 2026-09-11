import React, { useMemo } from 'react';
import { Card, CardContent } from './ui/Card';
import { Button } from './ui/Button';
import { AnimatedNumber } from './ui/AnimatedNumber';
import { Workout, Proposal } from '../types';
import { useNavigate } from 'react-router-dom';
import { 
  Brain, 
  Sparkles, 
  ArrowRight, 
  Play, 
  Flame, 
  Target,
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  Zap
} from 'lucide-react';
import { cn } from '../lib/utils';
import { analyzeExerciseProgression } from '../lib/progression';

interface TodayBriefingProps {
  workouts: Workout[];
  proposals: Proposal[];
  userName?: string;
  /** Prefer Just Go over generic /workout navigation */
  onJustGo?: () => void;
}

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 5) return 'Late night session?';
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  if (hour < 21) return 'Good evening';
  return 'Night owl mode';
}

function getDayLabel(): string {
  return new Date().toLocaleDateString('en-US', { 
    weekday: 'long', 
    month: 'short', 
    day: 'numeric' 
  });
}

export function TodayBriefing({ workouts, proposals, userName, onJustGo }: TodayBriefingProps) {
  const navigate = useNavigate();

  const briefing = useMemo(() => {
    const completed = workouts.filter(w => 
      w.status === 'COMPLETED' || w.status === 'completed'
    );
    const planned = workouts.filter(w => 
      w.status === 'PLANNED' || w.status === 'planned'
    );
    const pending = proposals.filter(p => p.status === 'PENDING_APPROVAL');
    
    // Find next workout (prefer today, then earliest planned)
    const todayStr = new Date().toISOString().split('T')[0];
    const todayWorkout = planned.find(w => w.scheduledDate === todayStr);
    const nextWorkout = todayWorkout || planned[0];

    // Simple streak calculation (consecutive completed days looking backward)
    let streak = 0;
    const sortedCompleted = [...completed].sort(
      (a, b) => new Date(b.scheduledDate || 0).getTime() - new Date(a.scheduledDate || 0).getTime()
    );
    const daySet = new Set(sortedCompleted.map(w => w.scheduledDate));
    let checkDate = new Date();
    // If nothing completed today, start from yesterday
    if (!daySet.has(checkDate.toISOString().split('T')[0])) {
      checkDate.setDate(checkDate.getDate() - 1);
    }
    for (let i = 0; i < 60; i++) {
      const d = checkDate.toISOString().split('T')[0];
      if (daySet.has(d)) {
        streak++;
        checkDate.setDate(checkDate.getDate() - 1);
      } else {
        break;
      }
    }

    // Prefer a PROGRESSING lift; otherwise keep the first STALLING/REGRESSING found.
    // Never overwrite an earlier stall/regress with a later one (previous dead-code bug).
    const mainExercises = ['Barbell Bench Press', 'Back Squat', 'Deadlift', 'Overhead Press', 'Barbell Row'];
    let insight: { exercise: string; state: string; message: string } | null = null;
    let stallInsight: { exercise: string; state: string; message: string } | null = null;

    for (const ex of mainExercises) {
      try {
        const report = analyzeExerciseProgression(workouts, ex);
        if (!report || report.state === 'INSUFFICIENT_DATA' || report.recentSessionsCount < 2) {
          continue;
        }
        if (report.state === 'PROGRESSING') {
          insight = {
            exercise: report.exerciseName || ex,
            state: 'PROGRESSING',
            message: `+${report.deltaE1RM}kg e1RM recently. Keep the pressure on.`
          };
          break; // Progressing wins immediately
        }
        if (
          (report.state === 'STALLING' || report.state === 'REGRESSING') &&
          !stallInsight
        ) {
          stallInsight = {
            exercise: report.exerciseName || ex,
            state: report.state,
            message: report.summary
          };
          // Keep scanning in case a later main lift is PROGRESSING
        }
      } catch {
        // ignore single-exercise analysis failures
      }
    }

    if (!insight) {
      insight = stallInsight;
    }

    return {
      nextWorkout,
      pendingCount: pending.length,
      streak,
      completedCount: completed.length,
      insight,
      hasTodaySession: !!todayWorkout
    };
  }, [workouts, proposals]);

  const greeting = getGreeting();
  const dayLabel = getDayLabel();

  return (
    <Card className="relative overflow-hidden border-0 bg-gradient-to-br from-primary/15 via-card to-card shadow-[0_0_40px_rgba(6,182,212,0.08)]">
      {/* Subtle glow accent */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-primary/10 via-transparent to-transparent pointer-events-none" />
      
      <CardContent className="relative p-5 sm:p-6 space-y-5">
        {/* Header row */}
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-primary/80 mb-1">
              {dayLabel}
            </p>
            <h2 className="text-xl sm:text-2xl font-display font-bold leading-tight">
              {greeting}{userName ? `, ${userName.split(' ')[0]}` : ''}.
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              Your FORGE briefing is ready.
            </p>
          </div>
          
          {briefing.streak > 0 && (
            <div className="flex flex-col items-center justify-center px-3 py-2 rounded-xl bg-warning/10 border border-warning/20 shrink-0">
              <div className="flex items-center gap-1 text-warning">
                <Flame size={16} className="fill-current" />
                <AnimatedNumber value={briefing.streak} className="text-lg font-bold font-mono leading-none" />
              </div>
              <span className="text-[10px] font-semibold uppercase tracking-wider text-warning/80 mt-0.5">
                day streak
              </span>
            </div>
          )}
        </div>

        {/* Main action card – Next Session */}
        {briefing.nextWorkout ? (
          <div className="rounded-xl border border-border/60 bg-background/60 backdrop-blur-sm p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-primary/15 text-primary">
                  <Target size={16} />
                </div>
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                    {briefing.hasTodaySession ? "Today's Session" : "Next Session"}
                  </p>
                  <p className="font-bold text-base leading-tight">{briefing.nextWorkout.title}</p>
                </div>
              </div>
              <span className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-primary/10 text-primary border border-primary/20">
                {briefing.nextWorkout.sets?.length || 0} sets
              </span>
            </div>

            {/* Exercise preview */}
            <div className="flex flex-wrap gap-1.5">
              {Array.from(new Set((briefing.nextWorkout.sets || []).map(s => s.exercise)))
                .slice(0, 4)
                .map((ex, i) => (
                  <span 
                    key={i}
                    className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-secondary text-secondary-foreground"
                  >
                    {ex}
                  </span>
                ))}
            </div>

            <div className="flex gap-2 pt-1">
              <Button 
                className="flex-1 font-bold h-11 gap-2"
                onClick={() => (onJustGo ? onJustGo() : navigate('/workout'))}
              >
                <Play size={15} fill="currentColor" />
                {briefing.hasTodaySession ? 'Start Today' : 'Just Go'}
              </Button>
              <Button 
                variant="outline"
                className="h-11 px-3 gap-1.5 border-primary/30 hover:bg-primary/10"
                onClick={() => navigate('/brain', { 
                  state: { 
                    targetWorkoutId: briefing.nextWorkout!.id,
                    autoPrompt: `Analyze my next workout "${briefing.nextWorkout!.title}" and give me the single best progressive overload adjustment for today.`
                  } 
                })}
              >
                <Brain size={15} />
                <span className="hidden sm:inline text-xs font-semibold">Ask Brain</span>
              </Button>
            </div>
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-border/60 bg-background/40 p-5 text-center space-y-3">
            <p className="text-sm text-muted-foreground">
              No session scheduled yet. Let FORGE build one for you.
            </p>
            <Button 
              size="sm"
              className="gap-1.5"
              onClick={() => navigate('/brain', { 
                state: { autoPrompt: 'Build me an optimal workout for today based on my recent training history and recovery.' } 
              })}
            >
              <Sparkles size={14} /> Generate Today&apos;s Workout
            </Button>
          </div>
        )}

        {/* Insight + Pending row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* Key Insight */}
          {briefing.insight ? (
            <div className={cn(
              "rounded-xl border p-3.5 flex items-start gap-3",
              briefing.insight.state === 'PROGRESSING' 
                ? "border-emerald-500/30 bg-emerald-500/5" 
                : "border-amber-500/30 bg-amber-500/5"
            )}>
              <div className={cn(
                "p-1.5 rounded-lg shrink-0",
                briefing.insight.state === 'PROGRESSING' 
                  ? "bg-emerald-500/15 text-emerald-500" 
                  : "bg-amber-500/15 text-amber-500"
              )}>
                {briefing.insight.state === 'PROGRESSING' 
                  ? <TrendingUp size={16} /> 
                  : <AlertTriangle size={16} />}
              </div>
              <div className="min-w-0">
                <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                  {briefing.insight.state === 'PROGRESSING' ? 'Progressing' : 'Attention'}
                </p>
                <p className="text-sm font-semibold truncate">{briefing.insight.exercise}</p>
                <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                  {briefing.insight.message}
                </p>
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-border/50 bg-background/40 p-3.5 flex items-start gap-3">
              <div className="p-1.5 rounded-lg bg-primary/10 text-primary shrink-0">
                <Zap size={16} />
              </div>
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                  Ready
                </p>
                <p className="text-sm font-semibold">Keep logging</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  More sessions unlock precise progression insights.
                </p>
              </div>
            </div>
          )}

          {/* Pending Proposals or Quick Brain */}
          {briefing.pendingCount > 0 ? (
            <button
              onClick={() => navigate('/proposals')}
              className="rounded-xl border border-accent/40 bg-accent/10 p-3.5 flex items-start gap-3 text-left hover:bg-accent/15 transition-colors"
            >
              <div className="p-1.5 rounded-lg bg-accent text-accent-foreground shrink-0 shadow-[0_0_10px_rgba(6,182,212,0.3)]">
                <Sparkles size={16} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-bold uppercase tracking-wider text-accent">
                  {briefing.pendingCount} Proposal{briefing.pendingCount > 1 ? 's' : ''}
                </p>
                <p className="text-sm font-semibold">Ready for review</p>
                <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                  Review & approve <ArrowRight size={11} />
                </p>
              </div>
            </button>
          ) : (
            <button
              onClick={() => navigate('/brain')}
              className="rounded-xl border border-border/50 bg-background/40 p-3.5 flex items-start gap-3 text-left hover:bg-secondary/50 transition-colors"
            >
              <div className="p-1.5 rounded-lg bg-primary/10 text-primary shrink-0">
                <Brain size={16} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                  FORGE Brain
                </p>
                <p className="text-sm font-semibold">Talk to your coach</p>
                <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                  Ask anything <ArrowRight size={11} />
                </p>
              </div>
            </button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
