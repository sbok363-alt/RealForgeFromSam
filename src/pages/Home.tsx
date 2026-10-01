import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ArrowRight, BarChart2, CalendarDays, CheckCircle2, Dumbbell, Play, Sparkles, X } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { WeeklyRecapCard } from '../components/WeeklyRecapCard';
import { ProgressionRulesCard } from '../components/ProgressionRulesCard';
import { DeloadCard } from '../components/DeloadCard';
import { useAuthStore } from '../store/useAuthStore';
import { useWorkoutStore } from '../store/useWorkoutStore';
import { getWorkouts } from '../lib/api';
import { Workout } from '../types';
import {
  buildWeeklyRecap,
  markWeeklyRecapSeen,
  shouldShowWeeklyRecapBanner,
} from '../lib/weeklyRecap';

function isCompleted(workout: Workout) {
  return workout.status === 'COMPLETED' || workout.status === 'completed';
}

function isPlanned(workout: Workout) {
  return workout.status === 'PLANNED' || workout.status === 'planned';
}

function workoutSets(workout: Workout) {
  const nested = workout.exercises?.flatMap((exercise) => exercise.sets) || [];
  return nested.length > 0 ? nested : workout.sets || [];
}

function workoutVolume(workout: Workout) {
  if (typeof workout.totalVolume === 'number' && Number.isFinite(workout.totalVolume)) {
    return workout.totalVolume;
  }
  if (typeof workout.volume === 'number' && Number.isFinite(workout.volume)) {
    return workout.volume;
  }
  return workoutSets(workout)
    .filter((set) => set.completed && set.weight > 0 && set.reps > 0)
    .reduce((total, set) => total + set.weight * set.reps, 0);
}

function workoutDate(workout: Workout) {
  if (typeof workout.completedAt === 'number') return new Date(workout.completedAt);
  if (!workout.scheduledDate) return null;
  const parsed = new Date(`${workout.scheduledDate}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function isSameMonth(date: Date | null, reference: Date) {
  return Boolean(
    date &&
    date.getFullYear() === reference.getFullYear() &&
    date.getMonth() === reference.getMonth()
  );
}

function formatScheduledDate(value?: string) {
  if (!value) return 'Unscheduled';

  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return 'Scheduled';

  const now = new Date();
  const todayKey = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
  ].join('-');

  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  const tomorrowKey = [
    tomorrow.getFullYear(),
    String(tomorrow.getMonth() + 1).padStart(2, '0'),
    String(tomorrow.getDate()).padStart(2, '0'),
  ].join('-');

  if (value === todayKey) return 'Today';
  if (value === tomorrowKey) return 'Tomorrow';

  return date.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

export default function Home() {
  const { user } = useAuthStore();
  const startWorkout = useWorkoutStore((state) => state.startWorkout);
  const navigate = useNavigate();
  const location = useLocation();

  const [workouts, setWorkouts] = useState<Workout[]>([]);
  const [loading, setLoading] = useState(true);
  const [showWelcome, setShowWelcome] = useState(false);
  const [showRecap, setShowRecap] = useState(false);

  useEffect(() => {
    const state = location.state as { justOnboarded?: boolean } | null;
    if (state?.justOnboarded) {
      setShowWelcome(true);
      window.history.replaceState({}, document.title);
    }
  }, [location.state]);

  useEffect(() => {
    if (!user) return;

    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const next = await getWorkouts(user.uid);
        if (!cancelled) setWorkouts(next);
      } catch (error) {
        console.error(error);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [user]);

  const completedWorkouts = useMemo(() => workouts.filter(isCompleted), [workouts]);

  const plannedWorkouts = useMemo(
    () =>
      workouts
        .filter(isPlanned)
        .slice()
        .sort((a, b) => (a.scheduledDate || '').localeCompare(b.scheduledDate || '')),
    [workouts]
  );

  const { todayWorkout, nextWorkout } = useMemo(() => {
    const today = new Date();
    const todayKey = [
      today.getFullYear(),
      String(today.getMonth() + 1).padStart(2, '0'),
      String(today.getDate()).padStart(2, '0'),
    ].join('-');

    const exactToday = plannedWorkouts.find((workout) => workout.scheduledDate === todayKey);
    const first = exactToday || plannedWorkouts[0] || null;
    const next = plannedWorkouts.find((workout) => workout.id !== first?.id) || null;

    return { todayWorkout: first, nextWorkout: next };
  }, [plannedWorkouts]);

  const monthlyStats = useMemo(() => {
    const now = new Date();
    const completedThisMonth = completedWorkouts.filter((workout) =>
      isSameMonth(workoutDate(workout), now)
    );

    return {
      workouts: completedThisMonth.length,
      volume: Math.round(
        completedThisMonth.reduce((total, workout) => total + workoutVolume(workout), 0)
      ),
      sets: completedThisMonth.reduce(
        (total, workout) =>
          total + workoutSets(workout).filter((set) => set.completed).length,
        0
      ),
    };
  }, [completedWorkouts]);

  const weeklyRecap = useMemo(
    () => (workouts.length > 0 ? buildWeeklyRecap(workouts) : null),
    [workouts]
  );

  useEffect(() => {
    if (!user || !weeklyRecap) return;
    setShowRecap(shouldShowWeeklyRecapBanner(user.uid, weeklyRecap.weekStart));
  }, [user, weeklyRecap]);

  const formattedDate = new Date().toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });

  const startPrimaryWorkout = () => {
    if (!todayWorkout) {
      navigate('/workout');
      return;
    }
    startWorkout(todayWorkout);
  };

  return (
    <div className="mx-auto max-w-lg space-y-4 pb-10 select-none">
      {showWelcome && (
        <div className="rounded-2xl border border-white/10 bg-[#101012] p-3.5 flex items-start gap-3">
          <div className="rounded-lg bg-[#FF7A32] p-1.5 text-black shrink-0">
            <Sparkles size={16} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-bold text-white">Hardstate is ready for your first session.</p>
            <p className="mt-1 text-[11px] text-neutral-400">
              Your training data stays the source of truth. Start a planned workout or choose one manually.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowWelcome(false)}
            className="p-1 text-neutral-400 hover:text-white"
            aria-label="Dismiss"
          >
            <X size={14} />
          </button>
        </div>
      )}

      <header className="flex items-center justify-between pt-1">
        <div>
          <h1 className="text-2xl font-display font-black tracking-tight text-white leading-none">
            Today
          </h1>
          <p className="mt-1 text-xs font-medium text-neutral-400">{formattedDate}</p>
        </div>
        <button
          type="button"
          onClick={() => navigate('/plans')}
          className="inline-flex items-center gap-1.5 rounded-full border border-white/[0.08] bg-[#141416] px-3 py-1.5 text-xs font-semibold text-neutral-300 active:scale-[0.98]"
        >
          <CalendarDays size={13} />
          Plans
        </button>
      </header>

      <section className="rounded-3xl border border-white/[0.08] bg-[#101012] p-5 sm:p-6">
        {todayWorkout ? (
          <>
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#FF7A32]">
                  {formatScheduledDate(todayWorkout.scheduledDate)}
                </p>
                <h2 className="mt-1 truncate text-2xl sm:text-3xl font-display font-black text-white">
                  {todayWorkout.title || todayWorkout.name || 'Workout'}
                </h2>
                <p className="mt-1 text-xs text-neutral-400">
                  {todayWorkout.exercises?.length || 0} exercises
                </p>
              </div>
              <Dumbbell size={22} className="mt-1 shrink-0 text-neutral-500" />
            </div>

            <button
              type="button"
              onClick={startPrimaryWorkout}
              className="mt-6 inline-flex min-h-11 items-center gap-2 rounded-full bg-white px-5 py-2.5 text-sm font-bold text-black transition-transform active:scale-[0.98]"
            >
              <Play size={14} className="fill-black" />
              Start workout
            </button>
          </>
        ) : (
          <>
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-neutral-500">
              {loading ? 'Loading training' : 'No planned workout'}
            </p>
            <h2 className="mt-1 text-2xl font-display font-black text-white">
              {loading ? 'Checking your local training state…' : 'Choose what you want to train.'}
            </h2>
            <p className="mt-2 max-w-sm text-xs leading-relaxed text-neutral-400">
              {loading
                ? 'You can keep using the app while Hardstate checks saved workouts.'
                : 'Hardstate will not invent a workout or demo stats when your plan is empty.'}
            </p>
            {!loading && (
              <button
                type="button"
                onClick={() => navigate('/workout')}
                className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-full bg-white px-5 py-2.5 text-sm font-bold text-black transition-transform active:scale-[0.98]"
              >
                Choose workout
                <ArrowRight size={14} />
              </button>
            )}
          </>
        )}
      </section>

      <section className="grid grid-cols-3 gap-2 sm:gap-2.5" aria-label="Training this month">
        <div className="min-h-[82px] rounded-2xl border border-white/[0.08] bg-[#101012] p-3">
          <div className="flex items-center justify-between">
            <span className="font-mono text-xl font-bold text-white">{monthlyStats.workouts}</span>
            <BarChart2 size={13} className="text-neutral-500" />
          </div>
          <p className="mt-2 text-[11px] font-medium text-neutral-300">Workouts</p>
          <p className="text-[10px] text-neutral-500">this month</p>
        </div>

        <div className="min-h-[82px] rounded-2xl border border-white/[0.08] bg-[#101012] p-3">
          <div className="flex items-center justify-between">
            <span className="font-mono text-xl font-bold text-white">
              {monthlyStats.volume.toLocaleString()}
            </span>
            <Dumbbell size={13} className="text-neutral-500" />
          </div>
          <p className="mt-2 text-[11px] font-medium text-neutral-300">Volume</p>
          <p className="text-[10px] text-neutral-500">kg logged</p>
        </div>

        <div className="min-h-[82px] rounded-2xl border border-white/[0.08] bg-[#101012] p-3">
          <div className="flex items-center justify-between">
            <span className="font-mono text-xl font-bold text-white">{monthlyStats.sets}</span>
            <CheckCircle2 size={13} className="text-neutral-500" />
          </div>
          <p className="mt-2 text-[11px] font-medium text-neutral-300">Sets</p>
          <p className="text-[10px] text-neutral-500">completed</p>
        </div>
      </section>

      {nextWorkout && (
        <section className="space-y-2 pt-1">
          <h3 className="text-sm font-bold tracking-tight text-white">Up next</h3>
          <button
            type="button"
            onClick={() => startWorkout(nextWorkout)}
            className="flex w-full items-center justify-between gap-3 rounded-2xl border border-white/[0.08] bg-[#101012] p-3 text-left transition-transform active:scale-[0.99]"
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-bold text-white">
                {nextWorkout.title || nextWorkout.name || 'Workout'}
              </p>
              <p className="mt-0.5 text-xs text-neutral-400">
                {formatScheduledDate(nextWorkout.scheduledDate)}
              </p>
            </div>
            <ArrowRight size={15} className="shrink-0 text-neutral-500" />
          </button>
        </section>
      )}

      {showRecap && weeklyRecap && user && completedWorkouts.length >= 1 && (
        <WeeklyRecapCard
          recap={weeklyRecap}
          onDismiss={() => {
            markWeeklyRecapSeen(user.uid, weeklyRecap.weekStart);
            setShowRecap(false);
          }}
        />
      )}

      {completedWorkouts.length >= 3 && (
        <>
          <DeloadCard workouts={workouts} />
          {user && <ProgressionRulesCard userId={user.uid} workouts={workouts} />}
        </>
      )}
    </div>
  );
}
