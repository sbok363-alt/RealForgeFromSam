import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card';
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
import { useNavigate } from 'react-router-dom';
import { OCCVersionBadge } from '../components/OCCVersionBadge';
import { AutonomyBadge } from '../components/AutonomyBadge';
import { AutonomyModal } from '../components/AutonomyModal';
import { 
  Brain, 
  Sparkles, 
  Calendar, 
  ArrowRight, 
  CheckCircle2, 
  History, 
  Layers, 
  Dumbbell, 
  TrendingUp,
  AlertCircle,
  AlertTriangle,
  Play,
  Flame,
  Activity
} from 'lucide-react';
import { cn } from '../lib/utils';
import { calculatePhysiqueHypertrophyVolume } from '../lib/hypertrophy';

export default function Home() {
  const { user } = useAuthStore();
  const navigate = useNavigate();
  
  const [workouts, setWorkouts] = useState<Workout[]>([]);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [permissions, setPermissions] = useState<UserPermissions>({
    userId: user?.uid || '',
    autonomyLevel: 'L2_GUIDED_AUTONOMY',
    permissionEpoch: 1
  });
  const [loading, setLoading] = useState(true);
  const [isAutonomyModalOpen, setIsAutonomyModalOpen] = useState(false);

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

  const pendingProposals = proposals.filter(p => p.status === 'PENDING_APPROVAL');
  const plannedWorkouts = workouts.filter(w => w.status === 'PLANNED');
  const nextWorkout = plannedWorkouts[0] || workouts[0];
  const completedCount = workouts.filter(w => w.status === 'COMPLETED').length;

  const hypertrophyAudit = React.useMemo(() => {
    return calculatePhysiqueHypertrophyVolume(workouts);
  }, [workouts]);

  return (
    <div className="space-y-6 max-w-4xl mx-auto pb-12">
      {/* Header */}
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-display font-bold">Dashboard</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Welcome back to FORGE. Let's get after it.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button 
            size="sm" 
            className="text-xs font-semibold gap-1.5"
            onClick={() => navigate('/brain')}
          >
            <Brain size={14} /> Open Brain
          </Button>
        </div>
      </header>

      {/* Pending Proposals Callout Banner */}
      {pendingProposals.length > 0 && (
        <Card className="border-accent/40 bg-accent/10 shadow-[0_0_15px_rgba(6,182,212,0.1)] overflow-hidden animate-in fade-in">
          <CardContent className="p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-accent text-accent-foreground shrink-0 shadow-[0_0_10px_rgba(6,182,212,0.4)]">
                <Sparkles size={20} />
              </div>
              <div>
                <h3 className="font-bold text-sm text-foreground">
                  {pendingProposals.length} AI Proposal{pendingProposals.length > 1 ? 's' : ''} Ready
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  FORGE Brain has optimized your upcoming sets.
                </p>
              </div>
            </div>

            <Button 
              size="sm" 
              variant="outline"
              className="text-xs font-semibold gap-1.5 shrink-0 self-end sm:self-auto border-accent/40 hover:bg-accent/20"
              onClick={() => navigate('/proposals')}
            >
              Review Updates <ArrowRight size={13} />
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Hypertrophy 2-Consecutive-Week Deficit Notification Banner */}
      {hypertrophyAudit.hasTwoWeekDeficit && (
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
                    {hypertrophyAudit.totalDeficientMusclesCount} Muscle Group{hypertrophyAudit.totalDeficientMusclesCount > 1 ? 's' : ''} Lagging in Hypertrophy
                  </h3>
                </div>
                <p className="text-xs text-muted-foreground max-w-xl">
                  {hypertrophyAudit.deficientMuscles.map(m => m.muscle).join(', ')} {hypertrophyAudit.totalDeficientMusclesCount > 1 ? 'have' : 'has'} fallen below your defined Optimal Hypertrophy threshold for 2 consecutive weeks.
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

      {/* Metrics Grid */}
      <section className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card className="border border-border/70 bg-card">
          <CardContent className="p-4 flex flex-col justify-between h-full space-y-2">
             <div className="flex items-center gap-2 text-muted-foreground text-xs font-semibold uppercase tracking-wider">
               <Flame size={14} className="text-warning" />
               <span>Streak</span>
             </div>
             <div>
               <div className="text-2xl font-bold font-mono">12 <span className="text-sm font-sans text-muted-foreground">days</span></div>
             </div>
          </CardContent>
        </Card>

        <Card className="border border-border/70 bg-card">
          <CardContent className="p-4 flex flex-col justify-between h-full space-y-2">
             <div className="flex items-center gap-2 text-muted-foreground text-xs font-semibold uppercase tracking-wider">
               <Dumbbell size={14} className="text-primary" />
               <span>Workouts</span>
             </div>
             <div>
               <div className="text-2xl font-bold font-mono">{completedCount} <span className="text-sm font-sans text-muted-foreground">total</span></div>
             </div>
          </CardContent>
        </Card>

        <Card className="border border-border/70 bg-card col-span-2">
          <CardContent className="p-4 flex flex-col justify-between h-full space-y-2">
             <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wider">
               <div className="flex items-center gap-2 text-muted-foreground">
                 <TrendingUp size={14} className="text-emerald-500" />
                 <span>Weekly Volume Target</span>
               </div>
               <span className="text-emerald-500">82%</span>
             </div>
             <div className="space-y-1.5">
                <div className="text-2xl font-bold font-mono">24,500 <span className="text-sm font-sans text-muted-foreground">/ 30,000 kg</span></div>
                <div className="h-1.5 w-full bg-secondary rounded-full overflow-hidden">
                  <div className="h-full bg-emerald-500 rounded-full" style={{ width: '82%' }} />
                </div>
             </div>
          </CardContent>
        </Card>
      </section>

      {/* Next Scheduled Session */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
            Up Next
          </h2>
          <button 
            onClick={() => navigate('/workout')}
            className="text-xs text-primary font-semibold hover:underline flex items-center gap-1"
          >
            View Workouts <ArrowRight size={12} />
          </button>
        </div>

        {nextWorkout ? (
          <Card className="border border-border/70 bg-card overflow-hidden">
            <CardHeader className="p-4 border-b border-border/40 pb-3 flex flex-row items-start justify-between gap-2">
              <div className="min-w-0">
                <CardTitle className="text-lg font-bold truncate">{nextWorkout.title}</CardTitle>
                <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1.5 font-medium">
                  <Calendar size={12} className="text-primary" />
                  <span>{nextWorkout.scheduledDate}</span>
                  <span>•</span>
                  <span>{nextWorkout.sets?.length || 0} sets</span>
                </div>
              </div>
              <span className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-primary/10 text-primary border border-primary/20 shrink-0">
                {nextWorkout.status}
              </span>
            </CardHeader>

            <CardContent className="p-4 space-y-3">
              <div className="space-y-1">
                 {Array.from(new Set((nextWorkout.sets || []).map(s => s.exercise))).slice(0, 3).map((ex, i) => {
                    const count = nextWorkout.sets.filter(s => s.exercise === ex).length;
                    return (
                      <div key={i} className="text-sm text-foreground/90 font-medium flex justify-between items-center py-0.5">
                        <span className="truncate pr-4">{ex}</span>
                        <span className="text-muted-foreground text-xs whitespace-nowrap">{count} sets</span>
                      </div>
                    );
                 })}
              </div>
            </CardContent>
            
            <div className="p-3 bg-card border-t border-border/40">
               <Button 
                 className="w-full font-bold h-12 text-sm gap-2"
                 onClick={() => navigate('/workout')}
               >
                 <Play size={16} fill="currentColor" /> Start Workout
               </Button>
            </div>
          </Card>
        ) : (
          <Card className="p-6 text-center text-muted-foreground text-sm border-dashed">
            No workouts scheduled. Head to Workouts to create one.
          </Card>
        )}
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
