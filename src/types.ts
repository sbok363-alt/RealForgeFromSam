export type AutonomyLevel = 'L0_READ_ONLY' | 'L1_MICRO_ACTIONS' | 'L2_GUIDED_AUTONOMY' | 'L3_FULL_AUTONOMY';

export interface UserPermissions {
  userId: string;
  autonomyLevel: AutonomyLevel;
  permissionEpoch: number;
}

export type ProposalStatus = 'DRAFT' | 'PENDING_APPROVAL' | 'EXECUTED' | 'DISCARDED' | 'REJECTED_CONFLICT';

export interface Proposal {
  id: string;
  threadId: string;
  targetEntityType: 'WORKOUT';
  targetEntityId: string;
  baseVersion: number;
  status: ProposalStatus;
  summary: string;
  beforeState: Record<string, any>;
  afterState: Record<string, any>;
  createdAt?: string;
  reviewedAt?: string;
}

export type WorkoutStatus = 'PLANNED' | 'IN_PROGRESS' | 'COMPLETED' | 'SKIPPED' | 'planned' | 'in-progress' | 'completed' | 'skipped';

export interface WorkoutSetItem {
  id: string;
  exercise: string;
  reps: number;
  weight: number;
  rir?: number; // Reps In Reserve (e.g. 0, 1, 2, 3, 4)
  rpe?: number; // Rate of Perceived Exertion (e.g. 6.5, 7, 8, 9, 10)
  notes?: string;
  completed?: boolean;
  setType?: 'N' | 'W' | 'D' | 'F';
}

// Backward compatibility set type
export interface WorkoutSet {
  id: string;
  reps: number;
  weight: number;
  targetReps?: number;
  targetWeight?: number;
  completed: boolean;
  rir?: number;
  rpe?: number;
  notes?: string;
  setType?: 'N' | 'W' | 'D' | 'F' | 'normal';
}

// Backward compatibility exercise type
export interface WorkoutExercise {
  id: string;
  exerciseId: string;
  name?: string;
  category?: string;
  sets: WorkoutSet[];
  notes?: string;
}

export type ProgressionState = 'PROGRESSING' | 'STALLING' | 'REGRESSING' | 'INSUFFICIENT_DATA';

export interface NextSessionTarget {
  targetWeight: number;
  targetRepsMin: number;
  targetRepsMax: number;
  targetSets?: number;
  suggestedRIR?: number;
  action: 'INCREASE_WEIGHT' | 'INCREASE_REPS' | 'MAINTAIN' | 'DELOAD' | 'BASELINE';
  rationale: string;
}

export interface ProgressionReport {
  exerciseId: string;
  exerciseName: string;
  state: ProgressionState;
  currentE1RM: number;
  previousE1RM: number;
  deltaE1RM: number;
  percentageDelta: number;
  recentSessionsCount: number;
  lastPerformance?: {
    date: string;
    weight: number;
    reps: number;
    rir?: number;
    rpe?: number;
    e1RM: number;
    volume: number;
  };
  history?: {
    date: string;
    totalVolume: number;
    sets: { weight: number; reps: number; rir?: number }[];
  }[];
  summary: string;
  rationales: string[];
  nextTarget: NextSessionTarget;
}

export interface Workout {
  id: string;
  userId?: string;
  title: string;
  scheduledDate: string;
  status: WorkoutStatus;
  version: number; // Incrementing OCC counter
  sets: WorkoutSetItem[];
  notes?: string;
  exerciseNotes?: Record<string, string>;
  updatedAt?: string;
  
  // Backward compatibility fields
  name?: string;
  planId?: string;
  startedAt?: number;
  completedAt?: number;
  totalVolume?: number;
  volume?: number;
  duration?: number;
  createdAt?: string;
  exercises?: WorkoutExercise[];
}

export type MutationActor = 'USER' | 'AI_BRAIN' | 'SYSTEM_AUTONOMOUS';

export interface MutationAuditLog {
  id: string;
  mutationId: string;
  userId?: string;
  actor: MutationActor;
  targetEntityType: string;
  targetEntityId: string;
  baseVersion: number;
  resultVersion: number;
  summary: string;
  inverseDelta: Record<string, any>;
  createdAt: string;
  proposalId?: string;
}

export type ThreadStatus = 'ACTIVE' | 'PAUSED' | 'COMPLETED' | 'ARCHIVED' | 'EXPIRED';

export interface ThreadMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
  proposalId?: string;
  proposal?: Proposal;
}

export interface Thread {
  id: string;
  userId: string;
  title: string;
  status: ThreadStatus;
  targetWorkoutId?: string;
  createdAt: string;
  updatedAt: string;
  messages: ThreadMessage[];
}

export type ExperienceLevel = 'beginner' | 'intermediate' | 'advanced';
export type PrimaryGoal = 'strength' | 'hypertrophy' | 'recomp' | 'general';
export type EquipmentAccess = 'full_gym' | 'home_basic' | 'bodyweight';

export interface UserProfile {
  userId: string;
  name?: string;
  experience?: ExperienceLevel;
  goals?: string[];
  primaryGoal?: PrimaryGoal;
  daysPerWeek?: number;
  equipment?: EquipmentAccess;
  onboardingCompleted?: boolean;
  onboardingCompletedAt?: number;
  createdAt: number;
}

export interface BodyweightEntry {
  id: string;
  userId: string;
  weight: number;
  date: number;
}

export interface PersonalRecord {
  id: string;
  userId: string;
  exerciseId: string;
  weight: number;
  reps: number;
  estimated1RM: number;
  workoutId: string;
  date: number;
}

export interface PlanExercise {
  id: string;
  exerciseId: string;
  targetSets: number;
  targetRepsMin: number;
  targetRepsMax: number;
}

export interface PlanDay {
  id: string;
  name: string;
  exercises: PlanExercise[];
}

export interface Target1RM {
  id: string;
  userId: string;
  exerciseId: string;
  exerciseName: string;
  target1RM: number; // in kg
  createdAt: number;
  updatedAt: number;
  notes?: string;
}

export interface TrainingPlan {
  id: string;
  userId: string;
  name: string;
  goal?: string;
  isActive: boolean;
  weeklyFrequency?: number;
  createdAt: number;
  days: PlanDay[];
}
