import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/useAuthStore';
import { saveUserProfile, seedForgeData, saveWorkout } from '../lib/api';
import { UserProfile, ExperienceLevel, PrimaryGoal, EquipmentAccess, Workout } from '../types';
import { Button } from '../components/ui/Button';
import { Card, CardContent } from '../components/ui/Card';
import { 
  Dumbbell, 
  Target, 
  Calendar, 
  Zap, 
  ArrowRight, 
  ArrowLeft,
  Check,
  Flame,
  TrendingUp,
  Home,
  Building2,
  User
} from 'lucide-react';
import { cn } from '../lib/utils';

type Step = 1 | 2 | 3 | 4;

const GOALS: { id: PrimaryGoal; label: string; desc: string; icon: React.ReactNode }[] = [
  { id: 'strength', label: 'Get Stronger', desc: 'Progressive overload & heavier lifts', icon: <TrendingUp size={22} /> },
  { id: 'hypertrophy', label: 'Build Muscle', desc: 'Volume-focused hypertrophy', icon: <Dumbbell size={22} /> },
  { id: 'recomp', label: 'Recomp', desc: 'Lose fat while keeping muscle', icon: <Flame size={22} /> },
  { id: 'general', label: 'Stay Fit', desc: 'Consistent training & health', icon: <Zap size={22} /> },
];

const EXPERIENCE: { id: ExperienceLevel; label: string; desc: string }[] = [
  { id: 'beginner', label: 'Beginner', desc: '< 1 year consistent training' },
  { id: 'intermediate', label: 'Intermediate', desc: '1–4 years, solid form' },
  { id: 'advanced', label: 'Advanced', desc: '4+ years, chasing PRs' },
];

const DAYS = [2, 3, 4, 5, 6];

const EQUIPMENT: { id: EquipmentAccess; label: string; desc: string; icon: React.ReactNode }[] = [
  { id: 'full_gym', label: 'Full Gym', desc: 'Barbells, racks, machines', icon: <Building2 size={20} /> },
  { id: 'home_basic', label: 'Home / Basic', desc: 'Dumbbells, bands, bench', icon: <Home size={20} /> },
  { id: 'bodyweight', label: 'Bodyweight', desc: 'Mostly calisthenics', icon: <User size={20} /> },
];

function buildStarterWorkout(
  userId: string,
  goal: PrimaryGoal,
  experience: ExperienceLevel,
  equipment: EquipmentAccess
): Workout {
  const today = new Date().toISOString().split('T')[0];
  const isBeginner = experience === 'beginner';
  const baseWeight = isBeginner ? 40 : experience === 'intermediate' ? 60 : 80;

  // Simple but real starter session based on goal + equipment
  let sets: Workout['sets'] = [];
  let title = 'Day 1 – Full Body Foundation';

  if (equipment === 'bodyweight') {
    title = 'Day 1 – Bodyweight Strength';
    sets = [
      { id: crypto.randomUUID(), exercise: 'Push-Up', reps: isBeginner ? 8 : 12, weight: 0, rir: 2 },
      { id: crypto.randomUUID(), exercise: 'Push-Up', reps: isBeginner ? 8 : 12, weight: 0, rir: 2 },
      { id: crypto.randomUUID(), exercise: 'Push-Up', reps: isBeginner ? 8 : 10, weight: 0, rir: 1 },
      { id: crypto.randomUUID(), exercise: 'Bodyweight Squat', reps: 12, weight: 0, rir: 2 },
      { id: crypto.randomUUID(), exercise: 'Bodyweight Squat', reps: 12, weight: 0, rir: 2 },
      { id: crypto.randomUUID(), exercise: 'Bodyweight Squat', reps: 10, weight: 0, rir: 1 },
      { id: crypto.randomUUID(), exercise: 'Inverted Row', reps: 8, weight: 0, rir: 2 },
      { id: crypto.randomUUID(), exercise: 'Inverted Row', reps: 8, weight: 0, rir: 2 },
      { id: crypto.randomUUID(), exercise: 'Plank', reps: 30, weight: 0, rir: 1, notes: 'seconds' },
    ];
  } else if (equipment === 'home_basic') {
    title = goal === 'hypertrophy' ? 'Day 1 – Upper Hypertrophy' : 'Day 1 – Full Body Power';
    sets = [
      { id: crypto.randomUUID(), exercise: 'Dumbbell Bench Press', reps: 8, weight: baseWeight * 0.4, rir: 2 },
      { id: crypto.randomUUID(), exercise: 'Dumbbell Bench Press', reps: 8, weight: baseWeight * 0.4, rir: 2 },
      { id: crypto.randomUUID(), exercise: 'Dumbbell Bench Press', reps: 8, weight: baseWeight * 0.4, rir: 1 },
      { id: crypto.randomUUID(), exercise: 'Goblet Squat', reps: 10, weight: baseWeight * 0.35, rir: 2 },
      { id: crypto.randomUUID(), exercise: 'Goblet Squat', reps: 10, weight: baseWeight * 0.35, rir: 2 },
      { id: crypto.randomUUID(), exercise: 'Dumbbell Row', reps: 10, weight: baseWeight * 0.3, rir: 2 },
      { id: crypto.randomUUID(), exercise: 'Dumbbell Row', reps: 10, weight: baseWeight * 0.3, rir: 2 },
      { id: crypto.randomUUID(), exercise: 'Overhead Press', reps: 8, weight: baseWeight * 0.25, rir: 2 },
      { id: crypto.randomUUID(), exercise: 'Overhead Press', reps: 8, weight: baseWeight * 0.25, rir: 1 },
    ];
  } else {
    // Full gym
    if (goal === 'strength') {
      title = 'Day 1 – Strength Focus (Squat + Press)';
      sets = [
        { id: crypto.randomUUID(), exercise: 'Back Squat', reps: 5, weight: baseWeight, rir: 2 },
        { id: crypto.randomUUID(), exercise: 'Back Squat', reps: 5, weight: baseWeight, rir: 2 },
        { id: crypto.randomUUID(), exercise: 'Back Squat', reps: 5, weight: baseWeight, rir: 1 },
        { id: crypto.randomUUID(), exercise: 'Barbell Bench Press', reps: 5, weight: baseWeight * 0.8, rir: 2 },
        { id: crypto.randomUUID(), exercise: 'Barbell Bench Press', reps: 5, weight: baseWeight * 0.8, rir: 2 },
        { id: crypto.randomUUID(), exercise: 'Barbell Bench Press', reps: 5, weight: baseWeight * 0.8, rir: 1 },
        { id: crypto.randomUUID(), exercise: 'Barbell Row', reps: 6, weight: baseWeight * 0.7, rir: 2 },
        { id: crypto.randomUUID(), exercise: 'Barbell Row', reps: 6, weight: baseWeight * 0.7, rir: 1 },
        { id: crypto.randomUUID(), exercise: 'Romanian Deadlift', reps: 6, weight: baseWeight * 0.75, rir: 2 },
        { id: crypto.randomUUID(), exercise: 'Romanian Deadlift', reps: 6, weight: baseWeight * 0.75, rir: 1 },
      ];
    } else {
      title = 'Day 1 – Hypertrophy Upper';
      sets = [
        { id: crypto.randomUUID(), exercise: 'Barbell Bench Press', reps: 8, weight: baseWeight * 0.75, rir: 2 },
        { id: crypto.randomUUID(), exercise: 'Barbell Bench Press', reps: 8, weight: baseWeight * 0.75, rir: 2 },
        { id: crypto.randomUUID(), exercise: 'Barbell Bench Press', reps: 8, weight: baseWeight * 0.75, rir: 1 },
        { id: crypto.randomUUID(), exercise: 'Barbell Row', reps: 10, weight: baseWeight * 0.65, rir: 2 },
        { id: crypto.randomUUID(), exercise: 'Barbell Row', reps: 10, weight: baseWeight * 0.65, rir: 2 },
        { id: crypto.randomUUID(), exercise: 'Overhead Press', reps: 8, weight: baseWeight * 0.5, rir: 2 },
        { id: crypto.randomUUID(), exercise: 'Overhead Press', reps: 8, weight: baseWeight * 0.5, rir: 1 },
        { id: crypto.randomUUID(), exercise: 'Lat Pulldown', reps: 10, weight: baseWeight * 0.55, rir: 2 },
        { id: crypto.randomUUID(), exercise: 'Lat Pulldown', reps: 10, weight: baseWeight * 0.55, rir: 1 },
        { id: crypto.randomUUID(), exercise: 'Lateral Raise', reps: 12, weight: 10, rir: 1 },
        { id: crypto.randomUUID(), exercise: 'Lateral Raise', reps: 12, weight: 10, rir: 1 },
      ];
    }
  }

  return {
    id: crypto.randomUUID(),
    userId,
    title,
    scheduledDate: today,
    status: 'PLANNED',
    version: 1,
    sets,
    updatedAt: new Date().toISOString(),
  };
}

export default function Onboarding() {
  const { user } = useAuthStore();
  const navigate = useNavigate();

  const [step, setStep] = useState<Step>(1);
  const [goal, setGoal] = useState<PrimaryGoal | null>(null);
  const [experience, setExperience] = useState<ExperienceLevel | null>(null);
  const [daysPerWeek, setDaysPerWeek] = useState<number | null>(null);
  const [equipment, setEquipment] = useState<EquipmentAccess | null>(null);
  const [saving, setSaving] = useState(false);

  const canNext =
    (step === 1 && goal) ||
    (step === 2 && experience) ||
    (step === 3 && daysPerWeek) ||
    (step === 4 && equipment);

  const handleFinish = async () => {
    if (!user || !goal || !experience || !daysPerWeek || !equipment) return;
    setSaving(true);

    try {
      const profile: UserProfile = {
        userId: user.uid,
        name: user.displayName || 'Athlete',
        experience,
        primaryGoal: goal,
        goals: [goal],
        daysPerWeek,
        equipment,
        onboardingCompleted: true,
        onboardingCompletedAt: Date.now(),
        createdAt: Date.now(),
      };

      await saveUserProfile(profile);

      // Mark as seeded so Home doesn't overwrite with demo data
      localStorage.setItem(`forge_seeded_${user.uid}`, 'true');
      localStorage.setItem(`forge_onboarded_${user.uid}`, 'true');

      // Create a real first workout tailored to answers
      const firstWorkout = buildStarterWorkout(user.uid, goal, experience, equipment);
      await saveWorkout(firstWorkout, 'SYSTEM_AUTONOMOUS', 'Onboarding starter session');

      // Optional: still seed some history if empty (non-destructive)
      await seedForgeData(user.uid);

      // Land on Home with a strong first Brain prompt ready
      navigate('/', { 
        replace: true,
        state: { 
          justOnboarded: true,
          firstWorkoutId: firstWorkout.id,
          autoBrainPrompt: `I just finished onboarding. Goal: ${goal}. Experience: ${experience}. ${daysPerWeek} days/week. Equipment: ${equipment}. Analyze my starter session and give me the single best progressive overload tip for my first real workout.`
        }
      });
    } catch (e) {
      console.error('Onboarding save failed:', e);
      // Still proceed so user is not stuck
      localStorage.setItem(`forge_onboarded_${user.uid}`, 'true');
      navigate('/', { replace: true });
    } finally {
      setSaving(false);
    }
  };

  const progress = (step / 4) * 100;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Progress bar */}
      <div className="h-1 w-full bg-secondary">
        <div 
          className="h-full bg-primary transition-all duration-300 ease-out"
          style={{ width: `${progress}%` }}
        />
      </div>

      <div className="flex-1 flex flex-col items-center justify-center px-4 py-8 max-w-lg mx-auto w-full">
        {/* Step header */}
        <div className="text-center mb-8 space-y-2">
          <p className="text-xs font-bold uppercase tracking-widest text-primary">
            Step {step} of 4
          </p>
          <h1 className="text-2xl sm:text-3xl font-display font-bold leading-tight">
            {step === 1 && "What's your main goal?"}
            {step === 2 && "How experienced are you?"}
            {step === 3 && "How many days per week?"}
            {step === 4 && "What equipment do you have?"}
          </h1>
          <p className="text-sm text-muted-foreground">
            {step === 1 && "This shapes every proposal FORGE makes."}
            {step === 2 && "We adjust volume, intensity and progression speed."}
            {step === 3 && "We'll build a realistic schedule around your life."}
            {step === 4 && "Exercises will match what you can actually do."}
          </p>
        </div>

        {/* Step content */}
        <div className="w-full space-y-3 mb-10">
          {step === 1 && GOALS.map((g) => (
            <button
              key={g.id}
              onClick={() => setGoal(g.id)}
              className={cn(
                "w-full flex items-center gap-4 p-4 rounded-xl border text-left transition-all",
                goal === g.id
                  ? "border-primary bg-primary/10 shadow-[0_0_20px_rgba(6,182,212,0.15)]"
                  : "border-border/70 bg-card hover:border-primary/40 hover:bg-secondary/30"
              )}
            >
              <div className={cn(
                "p-2.5 rounded-xl shrink-0",
                goal === g.id ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"
              )}>
                {g.icon}
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-bold text-sm">{g.label}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{g.desc}</p>
              </div>
              {goal === g.id && (
                <div className="p-1 rounded-full bg-primary text-primary-foreground shrink-0">
                  <Check size={14} strokeWidth={3} />
                </div>
              )}
            </button>
          ))}

          {step === 2 && EXPERIENCE.map((e) => (
            <button
              key={e.id}
              onClick={() => setExperience(e.id)}
              className={cn(
                "w-full flex items-center gap-4 p-4 rounded-xl border text-left transition-all",
                experience === e.id
                  ? "border-primary bg-primary/10 shadow-[0_0_20px_rgba(6,182,212,0.15)]"
                  : "border-border/70 bg-card hover:border-primary/40 hover:bg-secondary/30"
              )}
            >
              <div className="min-w-0 flex-1">
                <p className="font-bold text-sm">{e.label}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{e.desc}</p>
              </div>
              {experience === e.id && (
                <div className="p-1 rounded-full bg-primary text-primary-foreground shrink-0">
                  <Check size={14} strokeWidth={3} />
                </div>
              )}
            </button>
          ))}

          {step === 3 && (
            <div className="grid grid-cols-5 gap-2">
              {DAYS.map((d) => (
                <button
                  key={d}
                  onClick={() => setDaysPerWeek(d)}
                  className={cn(
                    "aspect-square rounded-xl border flex flex-col items-center justify-center transition-all font-bold",
                    daysPerWeek === d
                      ? "border-primary bg-primary text-primary-foreground shadow-[0_0_20px_rgba(6,182,212,0.2)]"
                      : "border-border/70 bg-card hover:border-primary/40 text-foreground"
                  )}
                >
                  <span className="text-xl">{d}</span>
                  <span className="text-[10px] opacity-70 font-medium">days</span>
                </button>
              ))}
            </div>
          )}

          {step === 4 && EQUIPMENT.map((eq) => (
            <button
              key={eq.id}
              onClick={() => setEquipment(eq.id)}
              className={cn(
                "w-full flex items-center gap-4 p-4 rounded-xl border text-left transition-all",
                equipment === eq.id
                  ? "border-primary bg-primary/10 shadow-[0_0_20px_rgba(6,182,212,0.15)]"
                  : "border-border/70 bg-card hover:border-primary/40 hover:bg-secondary/30"
              )}
            >
              <div className={cn(
                "p-2.5 rounded-xl shrink-0",
                equipment === eq.id ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"
              )}>
                {eq.icon}
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-bold text-sm">{eq.label}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{eq.desc}</p>
              </div>
              {equipment === eq.id && (
                <div className="p-1 rounded-full bg-primary text-primary-foreground shrink-0">
                  <Check size={14} strokeWidth={3} />
                </div>
              )}
            </button>
          ))}
        </div>

        {/* Navigation */}
        <div className="w-full flex items-center gap-3">
          {step > 1 ? (
            <Button
              variant="outline"
              className="h-12 px-4 gap-1.5"
              onClick={() => setStep((s) => (s - 1) as Step)}
              disabled={saving}
            >
              <ArrowLeft size={16} />
              Back
            </Button>
          ) : (
            <div className="w-[88px]" />
          )}

          <Button
            className="flex-1 h-12 font-bold gap-2 text-sm"
            disabled={!canNext || saving}
            onClick={() => {
              if (step < 4) {
                setStep((s) => (s + 1) as Step);
              } else {
                handleFinish();
              }
            }}
          >
            {saving ? (
              <>Building your plan…</>
            ) : step === 4 ? (
              <>
                Start Training <Check size={16} strokeWidth={3} />
              </>
            ) : (
              <>
                Continue <ArrowRight size={16} />
              </>
            )}
          </Button>
        </div>

        {/* Tiny trust line */}
        <p className="text-[11px] text-muted-foreground text-center mt-6 max-w-xs">
          FORGE never changes your program without your approval. Every suggestion is a versioned proposal.
        </p>
      </div>
    </div>
  );
}
