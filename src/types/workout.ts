import { Workout, WorkoutSetItem, WorkoutStatus, ProgressionReport } from '../types';

export type SetType = 'N' | 'W' | 'D' | 'F';

export interface ExerciseDefinition {
  id: string;
  name: string;
  primaryMuscle: 'CHEST' | 'BACK' | 'SHOULDERS' | 'LEGS' | 'ARMS' | 'CORE' | 'FULL_BODY';
  secondaryMuscles?: ('CHEST' | 'BACK' | 'SHOULDERS' | 'LEGS' | 'ARMS' | 'CORE' | 'FULL_BODY')[];
  equipment: 'BARBELL' | 'DUMBBELL' | 'MACHINE' | 'CABLE' | 'BODYWEIGHT' | 'OTHER';
  movementPattern: 'PUSH' | 'PULL' | 'HINGE' | 'SQUAT' | 'LUNGE' | 'CARRY' | 'ISOLATION';
  thumbnailUrl?: string;
  iconName?: string;
  colorTheme?: string;
}

export interface WorkoutExerciseGroup {
  exerciseId: string;
  exerciseName: string;
  thumbnailUrl?: string;
  equipment?: string;
  primaryMuscle?: string;
  notes?: string;
  sets: {
    set: WorkoutSetItem;
    globalIndex: number;
    setNumber: number;
  }[];
}

export interface RestTimerState {
  isActive: boolean;
  isPaused: boolean;
  duration: number; // total duration in seconds (e.g. 120)
  remaining: number; // seconds remaining
  defaultDuration: number; // user selected default (e.g. 60, 90, 120, 180)
}
