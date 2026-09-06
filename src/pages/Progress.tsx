import React, { useEffect, useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card';
import { Input } from '../components/ui/Input';
import { Button } from '../components/ui/Button';
import { useAuthStore } from '../store/useAuthStore';
import { getRecentWorkouts, getBodyweight, saveBodyweight, getTarget1RMs, saveTarget1RM, deleteTarget1RM } from '../lib/api';
import { Workout, BodyweightEntry, ProgressionReport, Target1RM } from '../types';
import { formatDistanceToNow } from 'date-fns';
import { getExerciseById } from '../lib/exercises';
import { analyzeExerciseProgression } from '../lib/progression';
import { TrendingUp, Minus, TrendingDown, HelpCircle, Target, Sparkles, Dumbbell } from 'lucide-react';
import { cn } from '../lib/utils';
import { D3PerformanceCharts } from '../components/D3PerformanceCharts';
import { Target1RMGoals } from '../components/Target1RMGoals';
import { PhysiqueHeatmap } from '../components/PhysiqueHeatmap';

export default function Progress() {
  const { user } = useAuthStore();
  const [workouts, setWorkouts] = useState<Workout[]>([]);
  const [bodyweightData, setBodyweightData] = useState<BodyweightEntry[]>([]);
  const [targets, setTargets] = useState<Target1RM[]>([]);
  const [newWeight, setNewWeight] = useState('');
  const [savingWeight, setSavingWeight] = useState(false);
  const [loading, setLoading] = useState(true);
  const [selectedExercise, setSelectedExercise] = useState<string>('all');

  useEffect(() => {
    if (user) {
      Promise.all([
        getRecentWorkouts(user.uid, 50),
        getBodyweight(user.uid),
        getTarget1RMs(user.uid)
      ]).then(([wData, bwData, targetData]) => {
        setWorkouts(wData);
        setBodyweightData(bwData);
        setTargets(targetData);
        setLoading(false);
      });
    }
  }, [user]);

  const handleSaveTarget = async (newOrUpdated: Target1RM) => {
    await saveTarget1RM(newOrUpdated);
    setTargets(prev => {
      const exists = prev.some(t => t.id === newOrUpdated.id);
      return exists ? prev.map(t => t.id === newOrUpdated.id ? newOrUpdated : t) : [newOrUpdated, ...prev];
    });
  };

  const handleDeleteTarget = async (targetId: string) => {
    if (!user) return;
    await deleteTarget1RM(targetId, user.uid);
    setTargets(prev => prev.filter(t => t.id !== targetId));
  };

  // Compute deterministic progression reports for all logged exercises
  const progressionReports = useMemo(() => {
    if (!workouts || workouts.length === 0) return [];
    
    // Find all distinct exercise IDs from completed workouts
    const exerciseIds = new Set<string>();
    for (const w of workouts) {
      if (Array.isArray(w.sets)) {
        w.sets.forEach(s => { if (s.exercise) exerciseIds.add(s.exercise); });
      }
      if (Array.isArray(w.exercises)) {
        w.exercises.forEach(e => { if (e.exerciseId) exerciseIds.add(e.exerciseId); });
      }
    }

    const reports: ProgressionReport[] = [];
    for (const exId of exerciseIds) {
      const def = getExerciseById(exId);
      const rep = analyzeExerciseProgression(workouts, exId, def?.name);
      if (rep.recentSessionsCount > 0) {
        reports.push(rep);
      }
    }

    // Sort: Progressing first, then Stalling, then Regressing, then Insufficient Data
    const order: Record<string, number> = { PROGRESSING: 1, STALLING: 2, REGRESSING: 3, INSUFFICIENT_DATA: 4 };
    return reports.sort((a, b) => (order[a.state] || 99) - (order[b.state] || 99));
  }, [workouts]);

  const handleSaveBodyweight = async () => {
    if (!user || !newWeight) return;
    const weight = parseFloat(newWeight);
    if (isNaN(weight) || weight <= 0) return;
    
    setSavingWeight(true);
    const entry: BodyweightEntry = {
      id: crypto.randomUUID(),
      userId: user.uid,
      weight,
      date: Date.now()
    };
    
    await saveBodyweight(entry);
    setBodyweightData([entry, ...bodyweightData]);
    setNewWeight('');
    setSavingWeight(false);
  };

  if (loading) return <div>Loading progress...</div>;

  const totalVolume = workouts.reduce((sum, w) => sum + (w.totalVolume || 0), 0);
  const workoutCount = workouts.length;

  // PR extraction for recent workouts
  interface PR {
    type: '1RM' | 'Weight' | 'Reps' | 'Volume';
    name: string;
    value: string;
    date: number;
    weight: number;
    reps: number;
  }
  const prs: PR[] = [];
  
  const maxes = {
    weight: {} as Record<string, number>,
    oneRepMax: {} as Record<string, number>,
    repsAtWeight: {} as Record<string, Record<number, number>>, // exerciseId -> weight -> maxReps
    volume: {} as Record<string, number>
  };

  // Sort workouts oldest to newest for PR chronological calculation
  const sortedWorkouts = [...workouts].filter(w => w.status === 'completed').sort((a, b) => a.startedAt - b.startedAt);
  
  for (const w of sortedWorkouts) {
    const workoutVolumes: Record<string, number> = {};
    const exercises = w.exercises || [];

    for (const ex of exercises) {
      if (!workoutVolumes[ex.exerciseId]) workoutVolumes[ex.exerciseId] = 0;
      
      const def = getExerciseById(ex.exerciseId);
      const exerciseName = def?.name || 'Unknown';
      let newPrsForWorkout: PR[] = [];

      for (const set of ex.sets) {
        if (!set.completed || set.weight <= 0 || set.reps <= 0) continue;
        
        workoutVolumes[ex.exerciseId] += (set.weight * set.reps);
        const date = w.completedAt || w.startedAt || Date.now();
        
        // 1. 1RM PR (Brzycki formula)
        const e1rm = set.weight * (36 / (37 - set.reps));
        if (e1rm > (maxes.oneRepMax[ex.exerciseId] || 0)) {
          maxes.oneRepMax[ex.exerciseId] = e1rm;
          newPrsForWorkout.push({ type: '1RM', name: exerciseName, value: `${Math.round(e1rm)}kg e1RM`, date, weight: set.weight, reps: set.reps });
        }

        // 2. Weight PR
        if (set.weight > (maxes.weight[ex.exerciseId] || 0)) {
          maxes.weight[ex.exerciseId] = set.weight;
          newPrsForWorkout.push({ type: 'Weight', name: exerciseName, value: `${set.weight}kg`, date, weight: set.weight, reps: set.reps });
        }

        // 3. Rep PR (at a specific weight)
        if (!maxes.repsAtWeight[ex.exerciseId]) maxes.repsAtWeight[ex.exerciseId] = {};
        if (set.reps > (maxes.repsAtWeight[ex.exerciseId][set.weight] || 0)) {
          // Only count as a Rep PR if it's > 1 rep and not already covered by a weight/1rm PR in this exact workout
          maxes.repsAtWeight[ex.exerciseId][set.weight] = set.reps;
          newPrsForWorkout.push({ type: 'Reps', name: exerciseName, value: `${set.reps} reps @ ${set.weight}kg`, date, weight: set.weight, reps: set.reps });
        }
      }

      // 4. Volume PR
      if (workoutVolumes[ex.exerciseId] > (maxes.volume[ex.exerciseId] || 0) && workoutVolumes[ex.exerciseId] > 0) {
        maxes.volume[ex.exerciseId] = workoutVolumes[ex.exerciseId];
        const prDate = w.completedAt || w.startedAt || Date.now();
        newPrsForWorkout.push({ type: 'Volume', name: exerciseName, value: `${workoutVolumes[ex.exerciseId]}kg Vol`, date: prDate, weight: 0, reps: 0 });
      }

      // Filter out redundant PRs for the same workout/exercise
      // If we got a 1RM PR, we don't need a Weight PR or Rep PR for that same set
      // Just keep the best one per type
      const filtered = newPrsForWorkout.reduce((acc, pr) => {
         const exists = acc.find(a => a.type === pr.type);
         if (!exists || (pr.type === '1RM' && parseInt(pr.value) > parseInt(exists.value))) {
            return [...acc.filter(a => a.type !== pr.type), pr];
         }
         return acc;
      }, [] as PR[]);
      
      prs.push(...filtered);
    }
  }

  // Only take the most recent 10 PRs and deduplicate to avoid spamming the UI
  // Keep the most impressive PRs
  const recentPrs = prs.reverse().slice(0, 10);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-display font-bold">Progress</h1>
        <p className="text-muted-foreground mt-1">Track your strength and volume over time.</p>
      </header>

      <div className="grid grid-cols-2 gap-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-sm font-medium text-muted-foreground">Workouts Logged</p>
            <h2 className="text-3xl font-bold mt-1">{workoutCount}</h2>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm font-medium text-muted-foreground">Total Volume</p>
            <h2 className="text-3xl font-bold mt-1">{totalVolume.toLocaleString()} <span className="text-lg font-normal text-muted-foreground">kg</span></h2>
          </CardContent>
        </Card>
      </div>

      {/* Physique Hypertrophy Heatmap with 2-Consecutive-Week Deficit Notification */}
      <PhysiqueHeatmap workouts={workouts} />

      {workoutCount === 0 ? (
        <Card className="bg-secondary/20 border-dashed border-2 text-center py-8">
          <CardContent>
            <p className="text-muted-foreground text-sm">Complete workouts to see your detailed 1RM trajectories and D3 volume trend charts.</p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Target 1RM Strength Milestones & Visual Progress Bars */}
          {user && (
            <Target1RMGoals
              userId={user.uid}
              targets={targets}
              workouts={workouts}
              onSaveTarget={handleSaveTarget}
              onDeleteTarget={handleDeleteTarget}
            />
          )}

          {/* D3-Powered Volume & 1RM Performance Visualizer */}
          <D3PerformanceCharts workouts={workouts} />

          {/* Exercise Progression Trajectory Engine */}
          <Card className="border-border/80 shadow-xs">
            <CardHeader className="pb-3 border-b border-border/50">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base font-bold flex items-center gap-2">
                    <Target size={16} className="text-primary" /> Exercise Progression Trajectory
                  </CardTitle>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Deterministic 1RM analysis and automated progressive overload recommendations.
                  </p>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-4 space-y-3">
              {progressionReports.length === 0 ? (
                <div className="text-center py-6 text-xs text-muted-foreground">
                  Log at least one completed workout session to generate progression trajectory reports.
                </div>
              ) : (
                <div className="space-y-3">
                  {progressionReports.map((rep) => {
                    const badgeConfig = {
                      PROGRESSING: {
                        color: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30',
                        icon: TrendingUp,
                        label: 'Progressing'
                      },
                      STALLING: {
                        color: 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30',
                        icon: Minus,
                        label: 'Stalling'
                      },
                      REGRESSING: {
                        color: 'bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/30',
                        icon: TrendingDown,
                        label: 'Regressing'
                      },
                      INSUFFICIENT_DATA: {
                        color: 'bg-muted text-muted-foreground border-border',
                        icon: HelpCircle,
                        label: 'Insufficient Data'
                      }
                    }[rep.state];

                    const BadgeIcon = badgeConfig.icon;

                    return (
                      <div 
                        key={rep.exerciseId} 
                        className="p-3.5 rounded-xl bg-secondary/30 border border-border/60 space-y-2.5 hover:bg-secondary/40 transition-colors"
                      >
                        <div className="flex items-center justify-between flex-wrap gap-2">
                          <div className="flex items-center gap-2">
                            <Dumbbell size={15} className="text-muted-foreground shrink-0" />
                            <span className="font-bold text-sm text-foreground">{rep.exerciseName}</span>
                          </div>
                          
                          <span className={cn("inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full border", badgeConfig.color)}>
                            <BadgeIcon size={12} /> {badgeConfig.label}
                            {rep.state === 'PROGRESSING' && rep.deltaE1RM > 0 ? ` (+${rep.deltaE1RM}kg)` : ''}
                            {rep.state === 'REGRESSING' && rep.deltaE1RM < 0 ? ` (${rep.deltaE1RM}kg)` : ''}
                          </span>
                        </div>

                        {/* Performance & e1RM Summary */}
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs bg-background/50 p-2 rounded-lg border border-border/40 font-mono">
                          <div>
                            <span className="text-[10px] text-muted-foreground block uppercase font-sans">Current e1RM</span>
                            <span className="font-bold text-foreground">{rep.currentE1RM > 0 ? `${rep.currentE1RM}kg` : '—'}</span>
                          </div>
                          <div>
                            <span className="text-[10px] text-muted-foreground block uppercase font-sans">Last Top Set</span>
                            <span className="font-bold text-foreground">
                              {rep.lastPerformance ? `${rep.lastPerformance.weight}kg × ${rep.lastPerformance.reps}` : '—'}
                            </span>
                          </div>
                          <div className="col-span-2 sm:col-span-1">
                            <span className="text-[10px] text-muted-foreground block uppercase font-sans">Sessions Tracked</span>
                            <span className="font-bold text-foreground">{rep.recentSessionsCount} session{rep.recentSessionsCount === 1 ? '' : 's'}</span>
                          </div>
                        </div>

                        {/* Next Target / Rationale */}
                        <div className="text-xs space-y-1 pt-1 border-t border-border/40">
                          <div className="flex items-start gap-1.5 text-primary font-medium">
                            <Target size={13} className="shrink-0 mt-0.5" />
                            <span>
                              Next Target: <strong>{rep.nextTarget.targetWeight}kg</strong> for {rep.nextTarget.targetRepsMin}–{rep.nextTarget.targetRepsMax} reps 
                              {rep.nextTarget.suggestedRIR !== undefined ? ` @ RIR ${rep.nextTarget.suggestedRIR}` : ''}
                            </span>
                          </div>
                          <p className="text-[11px] text-muted-foreground pl-4">
                            {rep.nextTarget.rationale}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle>Bodyweight</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex gap-2 mb-4">
                <Input 
                  type="number" 
                  placeholder="Weight (kg)" 
                  value={newWeight} 
                  onChange={e => setNewWeight(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSaveBodyweight()}
                />
                <Button onClick={handleSaveBodyweight} disabled={savingWeight || !newWeight}>
                  Log
                </Button>
              </div>
              
              {bodyweightData.length > 0 && (
                <div className="text-sm">
                  <div className="flex justify-between items-center py-2 border-b border-border/50 text-muted-foreground">
                    <span>Latest</span>
                    <span className="font-bold text-foreground">{bodyweightData[0].weight} kg</span>
                  </div>
                  {bodyweightData.length > 1 && (
                    <div className="flex justify-between items-center py-2 text-muted-foreground text-xs">
                      <span>Previous ({new Date(bodyweightData[1].date).toLocaleDateString()})</span>
                      <span>{bodyweightData[1].weight} kg</span>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Recent PRs</CardTitle>
            </CardHeader>
            <CardContent>
              {recentPrs.length > 0 ? (
                <div className="space-y-4">
                  {recentPrs.map((pr, i) => (
                    <div key={i} className="flex items-center justify-between p-3 bg-secondary/50 rounded-lg">
                      <div>
                        <p className="font-medium flex items-center gap-2">
                          <span className="text-orange-500">🔥</span> {pr.name}
                        </p>
                        <p className="text-xs text-muted-foreground">{formatDistanceToNow(pr.date, { addSuffix: true })}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-muted-foreground mb-0.5">{pr.type} PR</p>
                        <p className="font-bold text-primary">{pr.value}</p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No PRs recorded yet. Keep lifting heavy!</p>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

