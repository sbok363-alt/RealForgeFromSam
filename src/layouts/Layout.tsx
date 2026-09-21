import React, { useEffect, useState } from 'react';
import { Outlet, NavLink, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Activity, 
  Dumbbell, 
  LineChart, 
  Brain, 
  User, 
  Calendar,
  Sparkles,
  History,
  Shield,
  Lock,
  Home,
  BarChart2
} from 'lucide-react';
import { useAuthStore } from '../store/useAuthStore';
import { getProposals, getUserPermissions, getWorkouts } from '../lib/api';
import { calculatePhysiqueHypertrophyVolume } from '../lib/hypertrophy';
import { AutonomyModal } from '../components/AutonomyModal';
import { UserPermissions, AutonomyLevel, Workout } from '../types';
import { updateUserPermissions } from '../lib/api';
import { cn } from '../lib/utils';
import { useGeminiStore } from '../store/useGeminiStore';
import { useWorkoutStore } from '../store/useWorkoutStore';
import { BYOKModal } from '../components/BYOKModal';
import ActiveWorkout from '../components/workout/ActiveWorkout';
import { LiftOffSummary } from '../components/workout/LiftOffSummary';
import { WorkoutDetailModal } from '../components/WorkoutDetailModal';
import { MutationAuditModal } from '../components/MutationAuditModal';
import { useNavigate } from 'react-router-dom';

import { AmbientBackground } from '../components/ui/AmbientBackground';
import { LiquidNav, LiquidNavItem } from '../components/ui/LiquidNav';
import { ForgeLogo } from '../components/ui/ForgeLogo';
import { soundFx } from '../lib/soundFx';
import { useWorkoutSessionSync } from '../hooks/useWorkoutSessionSync';

export function Layout() {
  const { user } = useAuthStore();
  const location = useLocation();
  const navigate = useNavigate();
  const [pendingProposalsCount, setPendingProposalsCount] = useState(0);
  const [hypertrophyDeficitCount, setHypertrophyDeficitCount] = useState(0);
  const [permissions, setPermissions] = useState<UserPermissions>({
    userId: user?.uid || '',
    autonomyLevel: 'L2_GUIDED_AUTONOMY',
    permissionEpoch: 1
  });
  const [isAutonomyModalOpen, setIsAutonomyModalOpen] = useState(false);
  const [auditTargetWorkout, setAuditTargetWorkout] = useState<Workout | null>(null);
  const [liftOffWorkout, setLiftOffWorkout] = useState<Workout | null>(null);
  const { status: geminiStatus, openModal: openBYOKModal } = useGeminiStore();
  const { activeWorkout, isModalOpen, closeWorkoutModal, updateActiveWorkout, finishWorkout } = useWorkoutStore();
  useWorkoutSessionSync();

  const isBrainPage = location.pathname === '/brain';

  useEffect(() => {
    if (!user) return;
    const fetchMeta = async () => {
      try {
        const proposals = await getProposals(user.uid);
        const pending = proposals.filter(p => p.status === 'PENDING_APPROVAL').length;
        setPendingProposalsCount(pending);

        const perms = await getUserPermissions(user.uid);
        setPermissions(perms);

        const workouts = await getWorkouts(user.uid);
        const audit = calculatePhysiqueHypertrophyVolume(workouts);
        setHypertrophyDeficitCount(audit.totalDeficientMusclesCount);
      } catch (e) {
        // quiet
      }
    };
    fetchMeta();
    const interval = setInterval(fetchMeta, 6000);
    return () => clearInterval(interval);
  }, [user]);

  const handleUpdateAutonomy = async (level: AutonomyLevel) => {
    if (!user) return;
    const updated = await updateUserPermissions(user.uid, level);
    setPermissions(updated);
  };

  const desktopNavItems = [
    { name: 'Dashboard', path: '/', icon: Activity },
    { name: 'Workouts', path: '/workout', icon: Dumbbell },
    { name: 'FORGE Brain', path: '/brain', icon: Brain, highlight: true, badge: pendingProposalsCount > 0 ? pendingProposalsCount : undefined },
    { 
      name: 'Progress', 
      path: '/progress', 
      icon: LineChart,
      badge: hypertrophyDeficitCount > 0 ? `${hypertrophyDeficitCount} Alert` : undefined,
      badgeColor: 'bg-rose-500 text-white animate-pulse'
    },
    { name: 'Plans', path: '/plans', icon: Calendar },
    { name: 'Proposals', path: '/proposals', icon: Sparkles },
    { name: 'Audit Trail', path: '/audit-logs', icon: History },
    { name: 'Profile', path: '/profile', icon: User },
  ];

  const mobileNavItems: LiquidNavItem[] = [
    { name: 'Home', path: '/', icon: Home },
    { name: 'Workouts', path: '/workout', icon: Dumbbell },
    { name: 'Brain', path: '/brain', icon: Brain, highlight: true, badge: pendingProposalsCount > 0 ? pendingProposalsCount : undefined },
    { 
      name: 'Stats', 
      path: '/progress', 
      icon: BarChart2,
      badge: hypertrophyDeficitCount > 0 ? `${hypertrophyDeficitCount}!` : undefined,
      badgeColor: 'bg-rose-500 text-white animate-pulse'
    },
    { name: 'Profile', path: '/profile', icon: User },
  ];

  if (activeWorkout) {
    return (
      <div className="flex h-[100dvh] max-h-[100dvh] bg-background text-foreground overflow-y-auto w-full relative">
        <div className="w-full">
          <ActiveWorkout onWorkoutFinished={(w) => setLiftOffWorkout(w)} />
        </div>
      </div>
    );
  }

  if (liftOffWorkout) {
    return (
      <div className="flex h-[100dvh] max-h-[100dvh] bg-background text-foreground overflow-hidden w-full relative">
        <LiftOffSummary workout={liftOffWorkout} onClose={() => setLiftOffWorkout(null)} />
      </div>
    );
  }

  return (
    <div className="flex h-[100dvh] max-h-[100dvh] bg-background/50 text-foreground flex-col md:flex-row pb-[74px] md:pb-0 overflow-hidden relative">
      <AmbientBackground />
      {/* Mobile Top Bar */}
      <header className="md:hidden flex items-center justify-between px-4 py-2.5 border-b border-white/[0.08] bg-[#09090b]/95 backdrop-blur-md z-10 shrink-0">
        <div className="flex items-center gap-2">
          <ForgeLogo className="h-3.5 w-auto" />
        </div>
        
        <div className="flex items-center gap-2">
          {/* Subtle BYOK indicator button */}
          <button 
            onClick={openBYOKModal}
            className={cn(
              "flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full border transition-colors",
              geminiStatus === 'CONNECTED' 
                ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20 hover:bg-emerald-500/20" 
                : "bg-neutral-800 text-neutral-400 border-white/10 hover:text-white"
            )}
            title={geminiStatus === 'CONNECTED' ? "Brain Copilot Active" : "BYOK Gemini Setup"}
          >
            {geminiStatus === 'CONNECTED' ? (
              <span className="relative flex h-1.5 w-1.5"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span><span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500"></span></span>
            ) : (
              <Lock size={10} className="shrink-0 text-amber-500" />
            )}
            <span className="text-[9px] font-mono">{geminiStatus === 'CONNECTED' ? 'OCC' : 'BYOK'}</span>
          </button>

          {/* User Profile Avatar Thumbnail */}
          <button
            onClick={() => navigate('/profile')}
            aria-label="Profile"
            className="w-7 h-7 rounded-full border border-white/15 overflow-hidden bg-neutral-800 flex items-center justify-center text-xs font-bold text-white hover:border-[#FF7A32]/60 transition-all focus:outline-none"
          >
            {user?.photoURL ? (
              <img src={user.photoURL} alt={user.displayName || "User"} className="w-full h-full object-cover" />
            ) : (
              <span className="text-[10px] font-mono font-bold text-neutral-300">
                {(user?.displayName || 'Samuel').slice(0, 1).toUpperCase()}
              </span>
            )}
          </button>
        </div>
      </header>

      {/* Desktop Sidebar */}
      <aside className="hidden md:flex flex-col w-64 border-r border-border bg-card/40 p-4 h-full justify-between shrink-0">
        <div>
          {/* Logo & System Badge */}
          <div className="mb-6 px-3">
            <div className="flex items-center justify-between">
              <ForgeLogo className="h-4 w-auto" />
              <button 
                onClick={openBYOKModal}
                className={cn(
                  "flex items-center gap-1.5 text-[10px] font-bold px-2 py-0.5 rounded border transition-colors",
                  geminiStatus === 'CONNECTED' 
                    ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20 hover:bg-emerald-500/20" 
                    : "bg-destructive/10 text-destructive border-destructive/20 hover:bg-destructive/20"
                )}
              >
                {geminiStatus === 'CONNECTED' ? (
                  <><span className="relative flex h-1.5 w-1.5"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span><span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500"></span></span> Copilot Active</>
                ) : (
                  <><Lock size={10} className="shrink-0" /> BYOK Required</>
                )}
              </button>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Optimistic Concurrency Control
            </p>
          </div>

          {/* Autonomy Level Trigger */}
          <div className="mb-4 px-2">
            <button
              onClick={() => setIsAutonomyModalOpen(true)}
              className="w-full text-left p-2.5 rounded-xl bg-secondary/60 hover:bg-secondary border border-border/50 transition-all group"
            >
              <div className="flex items-center justify-between text-xs font-semibold text-muted-foreground mb-1">
                <span className="flex items-center gap-1.5 text-foreground">
                  <Shield size={13} className="text-primary" />
                  AI Autonomy
                </span>
                <span className="text-[10px] text-primary group-hover:underline">Edit</span>
              </div>
              <div className="text-xs font-medium text-foreground truncate">
                {permissions.autonomyLevel.replace('_', ' ')}
              </div>
            </button>
          </div>

          {/* Navigation Links */}
          <nav className="space-y-1">
            {desktopNavItems.map((item) => {
              const Icon = item.icon;
              return (
                <NavLink
                  key={item.path}
                  to={item.path}
                  onClick={() => soundFx.playClick(1200)}
                  className={({ isActive }) =>
                    cn(
                      "relative flex items-center justify-between rounded-xl px-3.5 py-2.5 text-sm font-medium transition-colors overflow-hidden",
                      isActive 
                        ? "text-primary-foreground font-semibold shadow-xs" 
                        : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground",
                      item.highlight && !isActive && "text-accent hover:text-accent font-bold"
                    )
                  }
                >
                  {({ isActive }) => (
                    <>
                      {isActive && (
                        <motion.div
                          layoutId="desktopNavActivePill"
                          className="absolute inset-0 bg-primary rounded-xl -z-10 shadow-[0_0_15px_rgba(255,122,50,0.35)]"
                          transition={{ type: "spring", stiffness: 400, damping: 25 }}
                        />
                      )}
                      <div className="flex items-center gap-3 relative z-10">
                        <Icon className="h-4 w-4" />
                        <span>{item.name}</span>
                      </div>

                      {item.badge !== undefined && (
                        <span className={cn(
                          "px-2 py-0.5 rounded-full text-[10px] font-bold relative z-10",
                          item.badgeColor ? item.badgeColor : "bg-primary-foreground text-primary"
                        )}>
                          {item.badge}
                        </span>
                      )}
                    </>
                  )}
                </NavLink>
              );
            })}
          </nav>
        </div>

        {/* Footer Info */}
        <div className="px-3 py-2 border-t border-border/50 text-[11px] text-muted-foreground flex items-center justify-between">
          <span>FORGE Engine</span>
          <span className="font-mono">v2.5.0 OCC</span>
        </div>
      </aside>

      {/* Main Content Viewport */}
      <main className={cn(
        "flex-1 min-h-0 flex flex-col",
        isBrainPage ? "overflow-hidden" : "overflow-y-auto"
      )}>
        <div className={cn(
          "mx-auto w-full",
          isBrainPage 
            ? "h-full flex-1 flex flex-col p-2 sm:p-4 md:p-6 max-w-5xl min-h-0 overflow-hidden" 
            : "max-w-5xl p-4 md:p-6 lg:p-8"
        )}>
          <AnimatePresence mode="wait">
            <motion.div
              key={location.pathname}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.16, ease: "easeOut" }}
              className={cn("w-full", isBrainPage ? "h-full flex-1 flex flex-col min-h-0" : "flex-1")}
            >
              <Outlet />
            </motion.div>
          </AnimatePresence>
        </div>
      </main>

      {/* Liquid Navigation in Action (Mobile) */}
      <LiquidNav items={mobileNavItems} />

      {/* Global Workout Detail & Set Editor Modal for Active Session */}
      {activeWorkout && isModalOpen && (
        <WorkoutDetailModal
          workout={activeWorkout}
          isOpen={isModalOpen}
          onClose={() => closeWorkoutModal()}
          onSave={(updated) => {
            updateActiveWorkout(updated);
            if (updated.status === 'COMPLETED') {
              finishWorkout();
            }
          }}
          onOpenBrain={(w) => {
            closeWorkoutModal();
            navigate('/brain', {
              state: {
                targetWorkoutId: w.id,
                autoPrompt: `Please analyze and optimize this workout: "${w.title}". Suggest progressive overload adjustments, set volume, and exercise sequence.`
              }
            });
          }}
          onOpenAudit={(w) => setAuditTargetWorkout(w)}
        />
      )}

      {/* Mutation Audit & Undo Modal */}
      {auditTargetWorkout && user && (
        <MutationAuditModal 
          isOpen={!!auditTargetWorkout}
          onClose={() => setAuditTargetWorkout(null)}
          userId={user.uid}
          targetWorkout={auditTargetWorkout}
          onWorkoutRestored={(restored) => {
            if (activeWorkout?.id === restored.id) {
              updateActiveWorkout(restored);
            }
            setAuditTargetWorkout(null);
          }}
        />
      )}

      {/* Autonomy Level Modal */}
      <AutonomyModal 
        isOpen={isAutonomyModalOpen}
        onClose={() => setIsAutonomyModalOpen(false)}
        permissions={permissions}
        onUpdateAutonomy={handleUpdateAutonomy}
      />
      <BYOKModal />
    </div>
  );
}
