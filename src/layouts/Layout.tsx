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
  Lock
} from 'lucide-react';
import { useAuthStore } from '../store/useAuthStore';
import { getProposals, getUserPermissions, getWorkouts } from '../lib/api';
import { calculatePhysiqueHypertrophyVolume } from '../lib/hypertrophy';
import { AutonomyBadge } from '../components/AutonomyBadge';
import { AutonomyModal } from '../components/AutonomyModal';
import { UserPermissions, AutonomyLevel, Workout } from '../types';
import { updateUserPermissions } from '../lib/api';
import { cn } from '../lib/utils';
import { useGeminiStore } from '../store/useGeminiStore';
import { useWorkoutStore } from '../store/useWorkoutStore';
import { BYOKModal } from '../components/BYOKModal';
import { ActiveWorkoutBottomBar } from '../components/workout/ActiveWorkoutBottomBar';
import { WorkoutDetailModal } from '../components/WorkoutDetailModal';
import { MutationAuditModal } from '../components/MutationAuditModal';
import { useNavigate } from 'react-router-dom';

import { AmbientBackground } from '../components/ui/AmbientBackground';
import { soundFx } from '../lib/soundFx';

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
  const { status: geminiStatus, openModal: openBYOKModal } = useGeminiStore();
  const { activeWorkout, isModalOpen, closeWorkoutModal, updateActiveWorkout, finishWorkout } = useWorkoutStore();

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

  const mobileNavItems = [
    { name: 'Dashboard', path: '/', icon: Activity },
    { name: 'Workouts', path: '/workout', icon: Dumbbell },
    { name: 'Brain', path: '/brain', icon: Brain, highlight: true, badge: pendingProposalsCount > 0 ? pendingProposalsCount : undefined },
    { 
      name: 'Stats', 
      path: '/progress', 
      icon: LineChart,
      badge: hypertrophyDeficitCount > 0 ? `${hypertrophyDeficitCount}!` : undefined,
      badgeColor: 'bg-rose-500 text-white animate-pulse'
    },
    { name: 'Profile', path: '/profile', icon: User },
  ];

  return (
    <div className="flex h-[100dvh] max-h-[100dvh] bg-background/50 text-foreground flex-col md:flex-row pb-16 md:pb-0 overflow-hidden relative">
      <AmbientBackground />
      {/* Mobile Top Bar */}
      <header className="md:hidden flex items-center justify-between px-3 py-2 border-b border-border bg-background/95 backdrop-blur-md z-10 shrink-0">
        <div className="flex items-center gap-2">
          <span className="font-display font-black tracking-tight text-lg text-primary">FORGE</span>
          <button 
            onClick={openBYOKModal}
            className={cn(
              "flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded border transition-colors",
              geminiStatus === 'CONNECTED' 
                ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20 hover:bg-emerald-500/20" 
                : "bg-destructive/10 text-destructive border-destructive/20 hover:bg-destructive/20"
            )}
          >
            {geminiStatus === 'CONNECTED' ? (
              <><span className="relative flex h-1.5 w-1.5"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span><span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500"></span></span> <span className="hidden sm:inline">Brain OCC</span> Active</>
            ) : (
              <><Lock size={10} className="shrink-0" /> BYOK</>
            )}
          </button>
        </div>
        {!isBrainPage && (
          <AutonomyBadge 
            level={permissions.autonomyLevel}
            onClick={() => setIsAutonomyModalOpen(true)}
          />
        )}
      </header>

      {/* Desktop Sidebar */}
      <aside className="hidden md:flex flex-col w-64 border-r border-border bg-card/40 p-4 sticky top-0 h-screen justify-between shrink-0">
        <div>
          {/* Logo & System Badge */}
          <div className="mb-6 px-3">
            <div className="flex items-center gap-2">
              <span className="text-2xl font-display font-black tracking-tight text-primary">FORGE</span>
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
                          className="absolute inset-0 bg-primary rounded-xl -z-10 shadow-[0_0_15px_rgba(6,182,212,0.25)]"
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
              initial={{ opacity: 0, y: 8, scale: 0.99 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.99 }}
              transition={{ type: "spring", stiffness: 400, damping: 25 }}
              className="h-full flex-1 flex flex-col min-h-0"
            >
              <Outlet />
            </motion.div>
          </AnimatePresence>
        </div>
      </main>

      {/* Mobile Bottom Navigation */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 border-t border-border bg-background/95 backdrop-blur-md pb-safe z-50">
        <div className="grid grid-cols-5 p-1 h-16 items-center">
          {mobileNavItems.map((item) => {
            const Icon = item.icon;
            const isBrain = item.highlight;
            return (
              <NavLink
                key={item.path}
                to={item.path}
                onClick={() => soundFx.playClick(1200)}
                className={({ isActive }) =>
                  cn(
                    "flex flex-col items-center justify-center py-1 px-1 text-[11px] font-medium transition-all relative h-full",
                    isActive && !isBrain ? "text-primary font-bold" : "text-muted-foreground",
                    isBrain && isActive ? "text-accent font-bold" : "",
                    isBrain && !isActive ? "text-accent/80" : ""
                  )
                }
              >
                {isBrain ? (
                  <div className="relative flex flex-col items-center justify-center -mt-4">
                    <div className="absolute inset-0 bg-accent/20 blur-xl rounded-full scale-150" />
                    <div className="relative bg-card border border-border/50 rounded-2xl p-3 shadow-[0_0_15px_rgba(6,182,212,0.3)] flex items-center justify-center overflow-hidden">
                       <div className="absolute inset-0 bg-gradient-to-tr from-accent/10 to-transparent pointer-events-none" />
                       <Icon className="h-6 w-6 text-accent" />
                    </div>
                    {item.badge !== undefined && (
                      <span className="absolute -top-1 -right-2 w-4 h-4 rounded-full bg-accent text-accent-foreground text-[9px] font-bold flex items-center justify-center z-10 border border-background">
                        {item.badge}
                      </span>
                    )}
                  </div>
                ) : (
                  <div className="relative flex flex-col items-center">
                    <Icon className={cn("h-5 w-5 mb-1 transition-transform", isBrain ? "h-6 w-6" : "")} />
                    <span className="truncate max-w-[55px] text-[10px]">{item.name}</span>
                    {item.badge !== undefined && (
                      <span className={cn(
                        "absolute -top-1 -right-2 min-w-4 h-4 px-1 rounded-full text-[9px] font-bold flex items-center justify-center shadow-xs",
                        item.badgeColor ? item.badgeColor : "bg-primary text-primary-foreground"
                      )}>
                        {item.badge}
                      </span>
                    )}
                  </div>
                )}
              </NavLink>
            );
          })}
        </div>
      </nav>

      {/* Active Workout Persistent Mini Bottom Bar */}
      <ActiveWorkoutBottomBar />

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
