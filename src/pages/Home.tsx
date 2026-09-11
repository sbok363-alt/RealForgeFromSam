import React, { useEffect, useState } from 'react';
import { Card, CardContent } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { useAuthStore } from '../store/useAuthStore';
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
import { TodayBriefing } from '../components/TodayBriefing';
import { WeeklyRecapCard } from '../components/WeeklyRecapCard';
import { JustGoSheet } from '../components/JustGoSheet';
import { ProgressionRulesCard } from '../components/ProgressionRulesCard';
import { DeloadCard } from '../components/DeloadCard';
import { DashboardMuscleHeatmap } from '../components/DashboardMuscleHeatmap';
import { 
  Brain, 
  Calendar, 
  Dumbbell, 
  TrendingUp,
  AlertTriangle,
  Flame,
  Activity,
  Sparkles,
  X,
  Zap
} from 'lucide-react';
import { cn } from '../lib/utils';
import { calculatePhysiqueHypertrophyVolume } from '../lib/hypertrophy';
import {
  buildWeeklyRecap,
  shouldShowWeeklyRecapBanner,
  markWeeklyRecapSeen,
} from '../lib/weeklyRecap';

export default function Home() {
  const { user } = useAuthStore();
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
      // Clear the state so refresh doesn't show it again
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

  // Real streak calculation (moved out of hard-coded values)
  const realStreak = React.useMemo(() => {
    const completed = workouts.filter(w => w.status === 'COMPLETED' || w.status === 'completed');
    const daySet = new Set(completed.map(w => w.scheduledDate));
    let streak = 0;
    const checkDate = new Date();
    if (!daySet.has(checkDate.toISOString().split('T')[0])) {
      checkDate.setDate(checkDate.getDate() - 1);
    }
    for (let i = 0; i < 60; i++) {
      const d = checkDate.toISOString().split('T')[0];
      if (daySet.has(d)) {
        streak++;
        checkDate.setDate(checkDate.getDate() - 1);
      } else break;
    }
    return streak;
  }, [workouts]);

  // Simple weekly volume (last 7 days)
  const weeklyVolume = React.useMemo(() => {
    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    let vol = 0;
    workouts.forEach(w => {
      if (w.status !== 'COMPLETED' && w.status !== 'completed') return;
      const ts = w.completedAt || (w.scheduledDate ? new Date(w.scheduledDate).getTime() : 0);
      if (ts < sevenDaysAgo) return;
      (w.sets || []).forEach(s => {
        if (s.weight > 0 && s.reps > 0) vol += s.weight * s.reps;
      });
    });
    return Math.round(vol);
  }, [workouts]);

  const todayWorkout = React.useMemo(() => {
    const planned = workouts.filter(w => w.status === 'PLANNED' || w.status === 'planned');
    const todayStr = new Date().toISOString().split('T')[0];
    return planned.find(w => w.scheduledDate === todayStr) || planned[0] || null;
  }, [workouts]);

  const volumeTarget = 30000; // can later come from user profile
  const volumePct = Math.min(100, Math.round((weeklyVolume / volumeTarget) * 100));

  return (
    <div className="space-y-5 max-w-4xl mx-auto pb-12">
      {/* Post-onboarding welcome moment */}
      {showWelcome && (
        <Card className="border-primary/40 bg-gradient-to-r from-primary/15 via-primary/5 to-transparent overflow-hidden animate-in fade-in">
          <CardContent className="p-4 flex items-start gap-3">
            <div className="p-2 rounded-xl bg-primary text-primary-foreground shrink-0 shadow-[0_0_12px_rgba(6,182,212,0.35)]">
              <Sparkles size={18} />
            </div>
            <div className="flex-1 min-w-0 space-y-2">
              <div>
                <h3 className="font-bold text-sm">You&apos;re in. Your first session is ready.</h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  FORGE built a starter workout from your answers. Open it, train, then let the Brain propose the next overload.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  className="text-xs font-semibold gap-1.5 h-8"
                  onClick={() => {
                    setShowWelcome(false);
                    setShowJustGo(true);
                  }}
                >
                  <Zap size={13} /> Just Go — first session
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="text-xs font-semibold gap-1.5 h-8"
                  onClick={() => {
                    setShowWelcome(false);
                    navigate('/brain', {
                      state: {
                        autoPrompt: (location.state as any)?.autoBrainPrompt ||
                          'I just finished onboarding. Analyze my starter session and give me the single best progressive overload tip for my first real workout.'
                      }
                    });
                  }}
                >
                  <Brain size={13} /> Ask Brain first
                </Button>
              </div>
            </div>
            <button
              onClick={() => setShowWelcome(false)}
              className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary shrink-0"
              aria-label="Dismiss"
            >
              <X size={16} />
            </button>
          </CardContent>
        </Card>
      )}

      {/* Primary action — always first after welcome */}
      <Button
        onClick={() => setShowJustGo(true)}
        className="w-full h-14 text-base font-bold gap-2 shadow-[0_0_24px_rgba(6,182,212,0.25)]"
      >
        <Zap size={20} className="fill-current" />
        Just Go
      </Button>
      <p className="text-[11px] text-center text-muted-foreground -mt-3">
        Readiness → today’s session → accept & train
      </p>

      {/* Daily context */}
      <TodayBriefing 
        workouts={workouts} 
        proposals={proposals}
        userName={user?.displayName || undefined}
        onJustGo={() => setShowJustGo(true)}
      />

      {/* Kinetic Muscle Heatmap — live workout targeting & anatomical stress */}
      <DashboardMuscleHeatmap
        workouts={workouts}
        todayWorkout={todayWorkout}
      />

      {/* Weekly recap — only until dismissed */}
      {showRecap && weeklyRecap && user && completedCount >= 1 && (
        <WeeklyRecapCard
          recap={weeklyRecap}
          onDismiss={() => {
            markWeeklyRecapSeen(user.uid, weeklyRecap.weekStart);
            setShowRecap(false);
          }}
        />
      )}

      {/* Intelligence cards — only with enough history; deload outranks progression */}
      {completedCount >= 3 && (
        <>
          <DeloadCard workouts={workouts} />
          {user && <ProgressionRulesCard userId={user.uid} workouts={workouts} />}
        </>
      )}

      <JustGoSheet
        open={showJustGo}
        onClose={() => setShowJustGo(false)}
        workouts={workouts}
      />

      {/* Hypertrophy Deficit Banner — only with real training history */}
      {completedCount >= 4 && hypertrophyAudit.hasTwoWeekDeficit && (
        <Card className="border-rose-500/40 bg-gradient-to-r from-rose-500/15 via-rose-500/10 to-transparent shadow-[0_0_15px_rgba(244,63,94,0.12)] overflow-hidden animate-in fade-in">
          <CardContent className="p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="p-2.5 rounded-xl bg-rose-500/20 text-rose-500 border border-rose-500/30 shrink-0 shadow-inner">
                <AlertTriangle size={20} className="animate-pulse" />
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[10px] font-black tracking-wider uppercase px-2 py-0.5 rounded-md bg-rose-500 text-white">
                    2-Week Deficit
                  </span>
                  <h3 className="font-bold text-sm text-foreground">
                    {hypertrophyAudit.totalDeficientMusclesCount} Muscle Group{hypertrophyAudit.totalDeficientMusclesCount > 1 ? 's' : ''} Lagging
                  </h3>
                </div>
                <p className="text-xs text-muted-foreground max-w-xl">
                  {hypertrophyAudit.deficientMuscles.map(m => m.muscle).join(', ')} {hypertrophyAudit.totalDeficientMusclesCount > 1 ? 'have' : 'has'} fallen below your Optimal Hypertrophy threshold for 2 consecutive weeks.
                </p>
              </div>
            </div>

            <Button 
              size="sm" 
              className="text-xs font-semibold gap-1.5 shrink-0 self-end sm:self-auto bg-rose-600 hover:bg-rose-500 text-white shadow-xs"
              onClick={() => navigate('/progress#physique-heatmap')}
            >
              <Activity size={13} /> View Physique Heatmap
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Compact real metrics with dark glassmorphism */}
      <section className="grid grid-cols-3 gap-3">
        <Card className="border border-border/70 dark:border-cyan-500/20 bg-card/80 dark:bg-black/60 backdrop-blur-xl hover:border-cyan-500/40 hover:shadow-[0_0_15px_rgba(6,182,212,0.1)] transition-all duration-300">
          <CardContent className="p-3.5 flex flex-col justify-between h-full space-y-1">
            <div className="flex items-center gap-1.5 text-muted-foreground text-[10px] font-semibold uppercase tracking-wider">
              <Flame size={12} className="text-warning" />
              <span>Streak</span>
            </div>
            <div className="text-xl font-bold font-mono">
              {realStreak} <span className="text-xs font-sans text-muted-foreground">days</span>
            </div>
          </CardContent>
        </Card>

        <Card className="border border-border/70 dark:border-cyan-500/20 bg-card/80 dark:bg-black/60 backdrop-blur-xl hover:border-cyan-500/40 hover:shadow-[0_0_15px_rgba(6,182,212,0.1)] transition-all duration-300">
          <CardContent className="p-3.5 flex flex-col justify-between h-full space-y-1">
            <div className="flex items-center gap-1.5 text-muted-foreground text-[10px] font-semibold uppercase tracking-wider">
              <Dumbbell size={12} className="text-primary" />
              <span>Logged</span>
            </div>
            <div className="text-xl font-bold font-mono">
              {completedCount} <span className="text-xs font-sans text-muted-foreground">total</span>
            </div>
          </CardContent>
        </Card>

        <Card className="border border-border/70 dark:border-cyan-500/20 bg-card/80 dark:bg-black/60 backdrop-blur-xl hover:border-cyan-500/40 hover:shadow-[0_0_15px_rgba(6,182,212,0.1)] transition-all duration-300">
          <CardContent className="p-3.5 flex flex-col justify-between h-full space-y-1">
            <div className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-wider">
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <TrendingUp size={12} className="text-emerald-500" />
                <span>7d Vol</span>
              </div>
              <span className={volumePct >= 80 ? "text-emerald-500" : "text-muted-foreground"}>
                {volumePct}%
              </span>
            </div>
            <div className="space-y-1">
              <div className="text-sm font-bold font-mono leading-none">
                {weeklyVolume.toLocaleString()} <span className="text-[10px] font-sans text-muted-foreground">kg</span>
              </div>
              <div className="h-1 w-full bg-secondary rounded-full overflow-hidden">
                <div 
                  className={cn("h-full rounded-full transition-all", volumePct >= 80 ? "bg-emerald-500" : "bg-primary")} 
                  style={{ width: `${volumePct}%` }} 
                />
              </div>
            </div>
          </CardContent>
        </Card>
      </section>

      {/* Quick actions */}
      <section className="flex gap-2">
        <Button 
          variant="outline"
          className="flex-1 h-11 text-xs font-semibold gap-1.5"
          onClick={() => navigate('/workout')}
        >
          <Calendar size={14} /> All Workouts
        </Button>
        <Button 
          variant="outline"
          className="flex-1 h-11 text-xs font-semibold gap-1.5"
          onClick={() => navigate('/brain')}
        >
          <Brain size={14} /> Open Brain
        </Button>
        <Button 
          variant="outline"
          className="flex-1 h-11 text-xs font-semibold gap-1.5"
          onClick={() => navigate('/progress')}
        >
          <Activity size={14} /> Progress
        </Button>
      </section>

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
