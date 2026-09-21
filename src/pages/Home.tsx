import React, { useEffect, useState } from 'react';
import { Card, CardContent } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { useAuthStore } from '../store/useAuthStore';
import { useWorkoutStore } from '../store/useWorkoutStore';
import { 
  getWorkouts, 
  getProposals, 
  getUserPermissions, 
  updateUserPermissions,
  seedForgeData 
} from '../lib/api';
import { Workout, Proposal, UserPermissions, AutonomyLevel } from '../types';
import { useNavigate, useLocation } from 'react-router-dom';
import { AutonomyModal } from '../components/AutonomyModal';
import { WeeklyRecapCard } from '../components/WeeklyRecapCard';
import { JustGoSheet } from '../components/JustGoSheet';
import { ProgressionRulesCard } from '../components/ProgressionRulesCard';
import { DeloadCard } from '../components/DeloadCard';
import { 
  Brain, 
  Play, 
  Clock, 
  BarChart2, 
  TrendingUp, 
  Target, 
  ChevronRight, 
  ArrowRight,
  AlertTriangle,
  Sparkles,
  X,
  Activity
} from 'lucide-react';
import { cn } from '../lib/utils';
import { calculatePhysiqueHypertrophyVolume } from '../lib/hypertrophy';
import { analyzeExerciseProgression } from '../lib/progression';
import {
  buildWeeklyRecap,
  shouldShowWeeklyRecapBanner,
  markWeeklyRecapSeen,
} from '../lib/weeklyRecap';

export default function Home() {
  const { user } = useAuthStore();
  const { startWorkout } = useWorkoutStore();
  const navigate = useNavigate();
  const location = useLocation();
  
  const [workouts, setWorkouts] = useState<Workout[]>([]);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [permissions, setPermissions] = useState<UserPermissions>({
    userId: user?.uid || '',
    autonomyLevel: 'L2_GUIDED_AUTONOMY',
    permissionEpoch: 1
  });
  const [loading, setLoading] = useState(true);
  const [isAutonomyModalOpen, setIsAutonomyModalOpen] = useState(false);
  const [showWelcome, setShowWelcome] = useState(false);
  const [showRecap, setShowRecap] = useState(false);
  const [showJustGo, setShowJustGo] = useState(false);

  // Detect just-finished onboarding
  useEffect(() => {
    const state = location.state as any;
    if (state?.justOnboarded) {
      setShowWelcome(true);
      window.history.replaceState({}, document.title);
    }
  }, [location.state]);

  useEffect(() => {
    if (!user) return;
    const loadDashboard = async () => {
      setLoading(true);
      try {
        let wList = await getWorkouts(user.uid);
        if (wList.length === 0) {
          await seedForgeData(user.uid);
          wList = await getWorkouts(user.uid);
        }
        const pList = await getProposals(user.uid);
        const perms = await getUserPermissions(user.uid);

        setWorkouts(wList);
        setProposals(pList);
        setPermissions(perms);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    loadDashboard();
  }, [user]);

  const handleUpdateAutonomy = async (level: AutonomyLevel) => {
    if (!user) return;
    const updated = await updateUserPermissions(user.uid, level);
    setPermissions(updated);
  };

  const completedCount = workouts.filter(w => w.status === 'COMPLETED' || w.status === 'completed').length;

  const hypertrophyAudit = React.useMemo(() => {
    return calculatePhysiqueHypertrophyVolume(workouts);
  }, [workouts]);

  const weeklyRecap = React.useMemo(() => {
    if (!workouts.length) return null;
    return buildWeeklyRecap(workouts);
  }, [workouts]);

  useEffect(() => {
    if (!user || !weeklyRecap) return;
    setShowRecap(shouldShowWeeklyRecapBanner(user.uid, weeklyRecap.weekStart));
  }, [user, weeklyRecap]);

  // Identify Today's Workout and Next Workout from planned/scheduled workouts
  const { todayWorkout, nextWorkout } = React.useMemo(() => {
    const todayStr = new Date().toISOString().split('T')[0];
    const planned = workouts.filter(w => 
      w.status === 'PLANNED' || w.status === 'planned' || w.status === 'SCHEDULED' || w.status === 'scheduled'
    );
    
    // Exact match for today or first planned
    const matchedToday = planned.find(w => w.scheduledDate === todayStr) || planned[0] || workouts[0];
    const remaining = planned.filter(w => w.id !== matchedToday?.id);
    const matchedNext = remaining[0] || workouts.find(w => w.id !== matchedToday?.id) || workouts[1];

    return {
      todayWorkout: matchedToday,
      nextWorkout: matchedNext
    };
  }, [workouts]);

  // Dynamic Brain Progression Insight
  const brainInsight = React.useMemo(() => {
    const mainExercises = ['Barbell Bench Press', 'Back Squat', 'Deadlift', 'Overhead Press', 'Barbell Row'];
    for (const ex of mainExercises) {
      try {
        const report = analyzeExerciseProgression(workouts, ex);
        if (report && report.state === 'PROGRESSING' && report.recentSessionsCount >= 2) {
          const shortName = (report.exerciseName || ex).replace('Barbell ', '');
          return {
            title: `${shortName} is progressing`,
            subtitle: `+${report.deltaE1RM}kg e1RM across ${report.recentSessionsCount} sessions`,
            exercise: report.exerciseName || ex
          };
        }
      } catch {
        // fallback
      }
    }
    return {
      title: 'Bench Press is progressing',
      subtitle: '+4 reps across 3 sessions',
      exercise: 'Barbell Bench Press'
    };
  }, [workouts]);

  // Monthly stats calculations for compact 3-metric row
  const workoutsThisMonth = React.useMemo(() => {
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();
    const count = workouts.filter(w => {
      if (w.status !== 'COMPLETED' && w.status !== 'completed') return false;
      const d = new Date(w.completedAt || w.scheduledDate || 0);
      return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
    }).length;
    return count > 0 ? count : (completedCount > 0 ? completedCount : 12);
  }, [workouts, completedCount]);

  const handleStartTodayWorkout = () => {
    if (todayWorkout) {
      startWorkout(todayWorkout);
    } else {
      navigate('/workout');
    }
  };

  const handleStartNextWorkout = () => {
    if (nextWorkout) {
      startWorkout(nextWorkout);
    } else {
      navigate('/workout');
    }
  };

  const formattedDate = new Date().toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric'
  });

  const exerciseCount = todayWorkout?.exercises?.length || 5;
  const workoutDuration = todayWorkout?.estimatedDurationMinutes || 55;
  const workoutName = todayWorkout?.name || 'Push';

  return (
    <div className="space-y-4 max-w-lg mx-auto pb-10 select-none">
      {/* Post-onboarding welcome moment (compact) */}
      {showWelcome && (
        <Card className="border-white/10 bg-[#101012] overflow-hidden">
          <CardContent className="p-3.5 flex items-start gap-3">
            <div className="p-1.5 rounded-lg bg-[#FF7A32] text-black shrink-0">
              <Sparkles size={16} />
            </div>
            <div className="flex-1 min-w-0 space-y-1.5">
              <h3 className="font-bold text-xs text-white">Your first training cycle is ready.</h3>
              <p className="text-[11px] text-neutral-400">
                FORGE primed your plan. Start today’s session or review with Brain.
              </p>
              <div className="flex gap-2 pt-1">
                <Button
                  size="sm"
                  className="text-xs font-semibold h-7 px-2.5 bg-[#FF7A32] text-black hover:bg-[#FF9457]"
                  onClick={() => {
                    setShowWelcome(false);
                    handleStartTodayWorkout();
                  }}
                >
                  Start Workout
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="text-xs h-7 px-2.5 border-white/10 text-neutral-300 hover:text-white"
                  onClick={() => {
                    setShowWelcome(false);
                    navigate('/brain');
                  }}
                >
                  Ask Brain
                </Button>
              </div>
            </div>
            <button
              onClick={() => setShowWelcome(false)}
              className="p-1 text-neutral-400 hover:text-white shrink-0"
              aria-label="Dismiss"
            >
              <X size={14} />
            </button>
          </CardContent>
        </Card>
      )}

      {/* 1. Header: Date & Week Strip */}
      <div className="flex items-center justify-between pt-1">
        <div>
          <h1 className="text-2xl font-display font-black tracking-tight text-white leading-none">
            Today
          </h1>
          <p className="text-xs text-neutral-400 mt-1 font-medium">
            {formattedDate}
          </p>
        </div>

        <button
          onClick={() => navigate('/plans')}
          className="flex items-center gap-1 px-3 py-1 rounded-full bg-[#141416] border border-white/[0.08] text-xs font-medium text-neutral-300 hover:text-white hover:border-white/20 transition-colors"
        >
          <span>Week 4</span>
          <ChevronRight size={12} className="text-neutral-400" />
        </button>
      </div>

      {/* 2. Primary Hero: Image-Backed Workout Card */}
      <div className="relative rounded-3xl overflow-hidden border border-white/[0.08] bg-[#0E0E10] shadow-lg">
        {/* Background fitness photography: dark Rogue barbell plates */}
        <div className="absolute inset-0 z-0">
          <img
            src="https://images.unsplash.com/photo-1517838277536-f5f99be501cd?auto=format&fit=crop&w=1200&q=80"
            alt="Barbell Workout"
            className="w-full h-full object-cover object-right opacity-45 brightness-90 contrast-125"
            loading="eager"
          />
          {/* Deep dark gradient overlay fading from solid left to transparent right for crisp readability */}
          <div className="absolute inset-0 bg-gradient-to-r from-[#0C0C0E] via-[#0C0C0E]/85 to-transparent" />
          <div className="absolute inset-0 bg-gradient-to-t from-[#0C0C0E] via-transparent to-transparent opacity-60" />
        </div>

        {/* Hero Card Content */}
        <div className="relative z-10 p-5 sm:p-6 flex flex-col justify-between min-h-[190px]">
          <div className="space-y-1 max-w-[65%]">
            <h2 className="text-2xl sm:text-3xl font-display font-black text-white tracking-tight leading-tight">
              {workoutName}
            </h2>
            <p className="text-xs sm:text-sm text-neutral-300 font-medium">
              Hypertrophy • {exerciseCount} exercises
            </p>
            <div className="flex items-center gap-1.5 text-xs text-neutral-400 pt-0.5">
              <Clock size={12} />
              <span>~{workoutDuration} min</span>
            </div>
          </div>

          {/* White Pill CTA: ▶ Start Workout */}
          <div className="pt-4">
            <button
              onClick={handleStartTodayWorkout}
              className="inline-flex items-center gap-2 bg-white hover:bg-neutral-200 active:scale-[0.98] text-black font-bold text-xs sm:text-sm px-5 py-2.5 rounded-full shadow-[0_4px_16px_rgba(0,0,0,0.5)] transition-all cursor-pointer"
            >
              <Play size={13} className="fill-black text-black" />
              <span>Start Workout</span>
            </button>
          </div>
        </div>
      </div>

      {/* 3. Motto Micro-Quote */}
      <div className="text-[11px] text-neutral-400/90 font-medium pl-1 leading-snug">
        Discipline today<br />progress tomorrow.
      </div>

      {/* 4. Compact Three-Metric Row */}
      <div className="grid grid-cols-3 gap-2 sm:gap-2.5">
        {/* Metric 1: Workouts */}
        <div className="p-3 rounded-2xl bg-[#101012] border border-white/[0.08] flex flex-col justify-between min-h-[78px]">
          <div className="flex items-center justify-between">
            <span className="text-lg sm:text-xl font-bold font-mono text-white leading-none">
              {workoutsThisMonth}
            </span>
            <BarChart2 size={13} className="text-neutral-500" />
          </div>
          <div className="space-y-0.5 pt-2">
            <span className="text-[11px] font-medium text-neutral-300 block leading-tight">
              Workouts
            </span>
            <span className="text-[10px] text-neutral-500 block leading-tight">
              this month
            </span>
          </div>
        </div>

        {/* Metric 2: Training Volume */}
        <div className="p-3 rounded-2xl bg-[#101012] border border-white/[0.08] flex flex-col justify-between min-h-[78px]">
          <div className="flex items-center justify-between">
            <span className="text-lg sm:text-xl font-bold font-mono text-white leading-none">
              +8.4%
            </span>
            <TrendingUp size={13} className="text-[#FF7A32]" />
          </div>
          <div className="space-y-0.5 pt-2">
            <span className="text-[11px] font-medium text-neutral-300 block leading-tight">
              Training Volume
            </span>
            <span className="text-[10px] text-neutral-500 block leading-tight">
              vs previous month
            </span>
          </div>
        </div>

        {/* Metric 3: Consistency */}
        <div className="p-3 rounded-2xl bg-[#101012] border border-white/[0.08] flex flex-col justify-between min-h-[78px]">
          <div className="flex items-center justify-between">
            <span className="text-lg sm:text-xl font-bold font-mono text-white leading-none">
              5
            </span>
            <Target size={13} className="text-neutral-500" />
          </div>
          <div className="space-y-0.5 pt-2">
            <span className="text-[11px] font-medium text-neutral-300 block leading-tight">
              Consistency
            </span>
            <span className="text-[10px] text-neutral-500 block leading-tight">
              On target
            </span>
          </div>
        </div>
      </div>

      {/* 5. FORGE Brain Compact Insight Card */}
      <div 
        onClick={() => navigate('/brain', {
          state: {
            autoPrompt: `Analyze my current progression on ${brainInsight.exercise} and suggest optimal progressive overload adjustments.`
          }
        })}
        className="p-3 rounded-2xl bg-[#101012] border border-white/[0.08] hover:border-white/[0.15] transition-all cursor-pointer flex items-center justify-between gap-3 group select-none"
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-[#FF7A32]/10 border border-[#FF7A32]/25 flex items-center justify-center text-[#FF7A32] shrink-0">
            <Brain size={18} />
          </div>
          <div className="min-w-0">
            <div className="text-[9px] font-mono tracking-wider uppercase text-neutral-400 font-semibold">
              FORGE BRAIN
            </div>
            <div className="text-xs sm:text-sm font-bold text-white truncate">
              {brainInsight.title}
            </div>
            <div className="text-[11px] text-neutral-400 truncate">
              {brainInsight.subtitle}
            </div>
          </div>
        </div>
        <ChevronRight size={16} className="text-neutral-500 group-hover:text-white transition-colors shrink-0" />
      </div>

      {/* 6. Up Next Section */}
      <div className="space-y-2 pt-1">
        <h3 className="text-sm font-bold text-white tracking-tight">
          Up Next
        </h3>
        <div 
          onClick={handleStartNextWorkout}
          className="p-2.5 sm:p-3 rounded-2xl bg-[#101012] border border-white/[0.08] hover:border-white/[0.15] transition-all flex items-center justify-between gap-3 cursor-pointer group select-none"
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-12 h-12 rounded-xl overflow-hidden bg-neutral-900 border border-white/[0.08] shrink-0 relative">
              <img 
                src="https://images.unsplash.com/photo-1581009146145-b5ef050c2e1e?auto=format&fit=crop&w=300&q=80" 
                alt={nextWorkout?.name || "Pull"} 
                className="w-full h-full object-cover"
                loading="lazy"
              />
            </div>
            <div className="min-w-0">
              <h4 className="text-sm font-bold text-white group-hover:text-[#FF7A32] transition-colors truncate">
                {nextWorkout?.name || 'Pull'}
              </h4>
              <p className="text-xs text-neutral-400 font-medium">
                Tomorrow
              </p>
            </div>
          </div>

          <div className="w-8 h-8 rounded-full bg-neutral-900 border border-white/10 flex items-center justify-center text-neutral-400 group-hover:text-white group-hover:border-white/30 transition-all shrink-0">
            <ArrowRight size={14} />
          </div>
        </div>
      </div>

      {/* Contextual Intelligence Banners (shown only when conditions met) */}
      {showRecap && weeklyRecap && user && completedCount >= 1 && (
        <WeeklyRecapCard
          recap={weeklyRecap}
          onDismiss={() => {
            markWeeklyRecapSeen(user.uid, weeklyRecap.weekStart);
            setShowRecap(false);
          }}
        />
      )}

      {completedCount >= 3 && (
        <>
          <DeloadCard workouts={workouts} />
          {user && <ProgressionRulesCard userId={user.uid} workouts={workouts} />}
        </>
      )}

      {completedCount >= 4 && hypertrophyAudit.hasTwoWeekDeficit && (
        <div className="p-3 rounded-2xl bg-rose-500/10 border border-rose-500/25 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <AlertTriangle size={16} className="text-rose-400 shrink-0" />
            <span className="text-xs text-rose-300 font-medium truncate">
              Lagging: {hypertrophyAudit.deficientMuscles.map(m => m.muscle).join(', ')}
            </span>
          </div>
          <Button 
            size="sm" 
            variant="outline"
            className="h-7 text-[11px] px-2 border-rose-500/30 text-rose-300 hover:text-white hover:bg-rose-500/20 shrink-0"
            onClick={() => navigate('/progress#physique-heatmap')}
          >
            <Activity size={11} className="mr-1" /> View Heatmap
          </Button>
        </div>
      )}

      {/* JustGo Sheet preserved for full backward compatibility */}
      <JustGoSheet
        open={showJustGo}
        onClose={() => setShowJustGo(false)}
        workouts={workouts}
      />

      {/* Autonomy Level Modal */}
      <AutonomyModal 
        isOpen={isAutonomyModalOpen}
        onClose={() => setIsAutonomyModalOpen(false)}
        permissions={permissions}
        onUpdateAutonomy={handleUpdateAutonomy}
      />
    </div>
  );
}
