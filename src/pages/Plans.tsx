import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Plus, Trash2, Edit2 } from 'lucide-react';
import { useAuthStore } from '../store/useAuthStore';
import { useWorkoutStore } from '../store/useWorkoutStore';
import { getPlans, savePlan, deletePlan } from '../lib/api';
import { TrainingPlan, Workout } from '../types';
import { useNavigate } from 'react-router-dom';
import ExerciseSelector from '../components/workout/ExerciseSelector';
import { getExerciseById, ExerciseDef } from '../lib/exercises';
import { WorkoutConflictModal } from '../components/workout/WorkoutConflictModal';

export default function Plans() {
  const { user } = useAuthStore();
  const { activeWorkout, startWorkout, finishWorkout } = useWorkoutStore();
  const navigate = useNavigate();
  
  const [plans, setPlans] = useState<TrainingPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [newPlanName, setNewPlanName] = useState('');
  
  const [editingPlanId, setEditingPlanId] = useState<string | null>(null);
  const [showExerciseSelector, setShowExerciseSelector] = useState(false);
  const [conflictTargetWorkout, setConflictTargetWorkout] = useState<Workout | null>(null);

  useEffect(() => {
    if (user) {
      loadPlans();
    }
  }, [user]);

  const loadPlans = async () => {
    setLoading(true);
    const data = await getPlans(user!.uid);
    setPlans(data);
    setLoading(false);
  };

  const handleCreatePlan = async () => {
    if (!user || !newPlanName.trim()) return;
    
    const newPlan: TrainingPlan = {
      id: crypto.randomUUID(),
      userId: user.uid,
      name: newPlanName,
      isActive: false,
      weeklyFrequency: 3,
      createdAt: Date.now(),
      days: [
        {
          id: crypto.randomUUID(),
          name: 'Day 1',
          exercises: []
        }
      ]
    };
    
    await savePlan(newPlan);
    setNewPlanName('');
    setIsCreating(false);
    loadPlans();
  };

  const handleDelete = async (id: string) => {
    if (confirm("Delete this plan?")) {
      await deletePlan(id, user?.uid, plans.find(p => p.id === id)?.version);
      loadPlans();
    }
  };

  const handleAddExerciseToPlan = async (def: ExerciseDef) => {
    if (!editingPlanId || !user) return;
    
    const plan = plans.find(p => p.id === editingPlanId);
    if (!plan) return;

    const updatedPlan = structuredClone(plan);
    if (updatedPlan.days.length === 0) {
      updatedPlan.days.push({ id: crypto.randomUUID(), name: 'Day 1', exercises: [] });
    }
    
    updatedPlan.days[0].exercises.push({
      id: crypto.randomUUID(),
      exerciseId: def.id,
      targetSets: 3,
      targetRepsMin: 8,
      targetRepsMax: 12
    });

    await savePlan(updatedPlan);
    setShowExerciseSelector(false);
    loadPlans();
  };

  const handleRemoveExerciseFromPlan = async (planId: string, exerciseIdToRemove: string) => {
    const plan = plans.find(p => p.id === planId);
    if (!plan) return;
    
    const updatedPlan = structuredClone(plan);
    updatedPlan.days[0].exercises = updatedPlan.days[0].exercises.filter(ex => ex.id !== exerciseIdToRemove);
    await savePlan(updatedPlan);
    loadPlans();
  };

  const handleStartPlan = (plan: TrainingPlan) => {
    const todayStr = new Date().toISOString().split('T')[0];
    const exercises = plan.days[0]?.exercises.map(ex => ({
      id: crypto.randomUUID(),
      exerciseId: ex.exerciseId,
      sets: Array.from({ length: ex.targetSets }).map(() => ({
        id: crypto.randomUUID(),
        weight: 0,
        reps: ex.targetRepsMin,
        completed: false
      }))
    })) || [];

    const sets = exercises.flatMap(e => e.sets.map(s => ({
      id: s.id,
      exercise: e.exerciseId,
      reps: s.reps,
      weight: s.weight,
      completed: false
    })));

    const workout: Workout = {
      id: crypto.randomUUID(),
      userId: user!.uid,
      title: plan.name,
      name: plan.name,
      scheduledDate: todayStr,
      status: 'IN_PROGRESS',
      version: 1,
      startedAt: Date.now(),
      planId: plan.id,
      sets,
      exercises
    };

    if (activeWorkout) {
      setConflictTargetWorkout(workout);
      return;
    }

    startWorkout(workout);
    navigate('/workout');
  };

  const handleConfirmConflict = () => {
    if (!conflictTargetWorkout) return;
    finishWorkout();
    startWorkout(conflictTargetWorkout);
    setConflictTargetWorkout(null);
    navigate('/workout');
  };

  if (loading) return <div>Loading plans...</div>;

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-display font-bold">Plans</h1>
          <p className="text-muted-foreground mt-1">Manage your training routines.</p>
        </div>
        {!isCreating && (
          <Button size="icon" onClick={() => setIsCreating(true)}>
            <Plus size={20} />
          </Button>
        )}
      </header>

      {isCreating && (
        <Card className="border-primary bg-primary/5">
          <CardContent className="p-4 space-y-4">
            <h3 className="font-semibold">New Plan</h3>
            <Input 
              autoFocus
              placeholder="e.g. 5-Day Hypertrophy" 
              value={newPlanName}
              onChange={e => setNewPlanName(e.target.value)}
            />
            <div className="flex gap-2 justify-end">
              <Button variant="ghost" size="sm" onClick={() => setIsCreating(false)}>Cancel</Button>
              <Button variant="default" size="sm" onClick={handleCreatePlan} disabled={!newPlanName.trim()}>Save Plan</Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="space-y-4">
        {plans.length === 0 && !isCreating ? (
          <Card className="bg-secondary/20 border-dashed border-2 text-center py-12">
            <CardContent>
              <p className="text-muted-foreground mb-4">You don't have any training plans yet.</p>
              <Button onClick={() => setIsCreating(true)}>Create a Plan</Button>
            </CardContent>
          </Card>
        ) : (
          plans.map(plan => (
            <Card key={plan.id} className="relative overflow-hidden group">
              {plan.isActive && (
                <div className="absolute top-0 right-0 bg-primary text-primary-foreground text-[10px] uppercase font-bold px-2 py-1 rounded-bl-lg">
                  Active
                </div>
              )}
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle>{plan.name}</CardTitle>
                <div className="flex gap-1">
                  <Button variant="ghost" size="icon" className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-foreground" onClick={() => setEditingPlanId(editingPlanId === plan.id ? null : plan.id)}>
                    <Edit2 size={16} />
                  </Button>
                  <Button variant="ghost" size="icon" className="opacity-0 group-hover:opacity-100 transition-opacity text-red-500 hover:text-red-600 hover:bg-red-500/10 -mr-2" onClick={() => handleDelete(plan.id)}>
                    <Trash2 size={16} />
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex text-sm text-muted-foreground gap-4 mb-4">
                  <div>{plan.weeklyFrequency} days / week</div>
                  <div>{plan.days.reduce((acc, day) => acc + day.exercises.length, 0)} exercises</div>
                </div>

                {editingPlanId === plan.id && (
                  <div className="mb-6 p-4 bg-secondary/10 rounded-lg border border-border/50">
                    <h4 className="font-semibold text-sm mb-3">Day 1 Exercises</h4>
                    {plan.days[0]?.exercises.length > 0 ? (
                      <div className="space-y-2 mb-4">
                        {plan.days[0].exercises.map(ex => (
                          <div key={ex.id} className="flex justify-between items-center text-sm bg-background p-2 rounded border border-border">
                            <span>{getExerciseById(ex.exerciseId)?.name || 'Unknown'}</span>
                            <div className="flex items-center gap-3">
                              <span className="text-muted-foreground">{ex.targetSets} sets × {ex.targetRepsMin}-{ex.targetRepsMax} reps</span>
                              <Button variant="ghost" size="icon" className="h-6 w-6 text-red-400 hover:text-red-500" onClick={() => handleRemoveExerciseFromPlan(plan.id, ex.id)}>
                                <Trash2 size={14} />
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground mb-4">No exercises added yet.</p>
                    )}
                    <Button variant="outline" size="sm" className="w-full border-dashed" onClick={() => setShowExerciseSelector(true)}>
                      <Plus size={16} className="mr-2" /> Add Exercise
                    </Button>
                  </div>
                )}

                <div className="flex gap-2">
                  <Button className="w-full" onClick={() => handleStartPlan(plan)} disabled={plan.days[0]?.exercises.length === 0}>
                    {plan.days[0]?.exercises.length === 0 ? "Add exercises first" : "Start Plan"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {showExerciseSelector && (
        <ExerciseSelector 
          onClose={() => setShowExerciseSelector(false)}
          onSelect={handleAddExerciseToPlan}
        />
      )}

      {/* Workout Conflict Modal */}
      {conflictTargetWorkout && activeWorkout && (
        <WorkoutConflictModal
          isOpen={!!conflictTargetWorkout}
          activeWorkout={activeWorkout}
          newWorkout={conflictTargetWorkout}
          onCancel={() => setConflictTargetWorkout(null)}
          onConfirm={handleConfirmConflict}
        />
      )}
    </div>
  );
}

