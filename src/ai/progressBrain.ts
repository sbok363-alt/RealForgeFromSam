import { FunctionDeclaration, Type } from '@google/genai';
import { z } from 'zod';
import {
  calculateE1RM,
  detectExerciseStall,
  calculateMuscleGroupVolume,
  extractExerciseHistory,
  analyzeExerciseProgression,
  StallDetectionResult,
} from '../domain/analytics';
import {
  UpdateTargetProgressionSchema,
  ModifyTrainingPlanSchema,
  executeSecureMutation,
  MutationStorageAdapter,
} from '../domain/mutations';
import { Workout } from '../types';
import { getExerciseById } from '../lib/exercises';

// ============================================================================
// 1. STRUCTURED AI TOOL DEFINITIONS (Function Calling for Gemini API)
// ============================================================================

/**
 * Tool 1: proposeProgressionUpdate
 * Proposes updating exercise target weight/reps based on double-progression rules.
 */
export const proposeProgressionUpdateDeclaration: FunctionDeclaration = {
  name: 'proposeProgressionUpdate',
  description:
    'Proposes updating exercise target weight and target repetitions based on double-progression rules and deterministic e1RM trajectory. Requires a valid factual rationale explaining the physiological or progression justification.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      exerciseId: {
        type: Type.STRING,
        description: "The identifier of the exercise (e.g. 'bench_press', 'barbell_squat').",
      },
      targetWeightKg: {
        type: Type.NUMBER,
        description: 'Target working load in kilograms (e.g. 102.5).',
      },
      targetRepsMin: {
        type: Type.INTEGER,
        description: 'Lower bound of the target repetition range (e.g. 6).',
      },
      targetRepsMax: {
        type: Type.INTEGER,
        description: 'Upper bound of the target repetition range (e.g. 8). Must be >= targetRepsMin.',
      },
      suggestedRir: {
        type: Type.NUMBER,
        description: 'Suggested Reps In Reserve buffer (e.g. 2).',
      },
      action: {
        type: Type.STRING,
        enum: ['INCREASE_WEIGHT', 'INCREASE_REPS', 'MAINTAIN', 'DELOAD', 'BASELINE'],
        description: 'The progression action being proposed.',
      },
      rationale: {
        type: Type.STRING,
        description:
          'Mandatory explanation justifying this progression update based on recent session performances.',
      },
    },
    required: ['exerciseId', 'targetWeightKg', 'targetRepsMin', 'targetRepsMax', 'action', 'rationale'],
  },
};

/**
 * Tool 2: proposePlanModification
 * Proposes deloads, exercise swaps, or volume adjustments when a stall, fatigue, or muscle volume deficit is detected.
 */
export const proposePlanModificationDeclaration: FunctionDeclaration = {
  name: 'proposePlanModification',
  description:
    'Proposes structural modifications to a training plan (exercise substitutions, set volume adjustments, or deload periods) when fatigue or multi-week volume deficits/stalls are detected.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      planId: {
        type: Type.STRING,
        description: 'The identifier of the training plan to modify.',
      },
      name: {
        type: Type.STRING,
        description: 'Optional updated name of the training plan.',
      },
      weeklyFrequency: {
        type: Type.INTEGER,
        description: 'Weekly workout frequency (1-7).',
      },
      isActive: {
        type: Type.BOOLEAN,
        description: 'Whether the plan is the user active routine.',
      },
      days: {
        type: Type.ARRAY,
        description: 'The complete list of planned training days.',
        items: {
          type: Type.OBJECT,
          properties: {
            id: { type: Type.STRING, description: 'Day identifier.' },
            name: { type: Type.STRING, description: "Name of the day (e.g. 'Upper A', 'Legs Heavy')." },
            exercises: {
              type: Type.ARRAY,
              description: 'Prescribed exercises for this day.',
              items: {
                type: Type.OBJECT,
                properties: {
                  id: { type: Type.STRING, description: 'Prescribed exercise item id.' },
                  exerciseId: { type: Type.STRING, description: 'The exercise identifier.' },
                  targetSets: { type: Type.INTEGER, description: 'Number of working sets.' },
                  targetRepsMin: { type: Type.INTEGER, description: 'Minimum target reps.' },
                  targetRepsMax: { type: Type.INTEGER, description: 'Maximum target reps.' },
                },
                required: ['id', 'exerciseId', 'targetSets', 'targetRepsMin', 'targetRepsMax'],
              },
            },
          },
          required: ['id', 'name', 'exercises'],
        },
      },
      rationale: {
        type: Type.STRING,
        description:
          'Mandatory justification explaining why the plan is being modified (e.g. Fatigue mitigation or addressing a 2-week muscle volume deficit).',
      },
    },
    required: ['planId', 'days', 'rationale'],
  },
};

/**
 * Tool 3: flagExerciseStall
 * Emits a structured performance analysis explanation without mutating data.
 */
export const flagExerciseStallDeclaration: FunctionDeclaration = {
  name: 'flagExerciseStall',
  description:
    'Emits a non-mutating structured performance analysis explaining an identified exercise plateau or regression based on deterministic stall criteria (< 2.5% progression over 3-4 consecutive sessions).',
  parameters: {
    type: Type.OBJECT,
    properties: {
      exerciseId: {
        type: Type.STRING,
        description: 'The identifier of the stalling exercise.',
      },
      sessionsAnalyzed: {
        type: Type.INTEGER,
        description: 'Number of consecutive sessions analyzed (e.g. 3 or 4).',
      },
      e1rmTrendPercent: {
        type: Type.NUMBER,
        description: 'Percentage change in e1RM across the analyzed window.',
      },
      stallReason: {
        type: Type.STRING,
        description: "Short diagnosis of the stall (e.g. 'Plateau with high RPE across 3 sessions').",
      },
      recommendedAction: {
        type: Type.STRING,
        enum: ['HOLD_LOAD', 'DELOAD', 'CHANGE_EXERCISE', 'ADJUST_VOLUME', 'ASSESS_FATIGUE'],
        description: 'Recommended tactical action.',
      },
      explanation: {
        type: Type.STRING,
        description:
          'In-depth analytical explanation detailing why the movement stalled and the physiological recommendations.',
      },
    },
    required: ['exerciseId', 'sessionsAnalyzed', 'e1rmTrendPercent', 'stallReason', 'recommendedAction', 'explanation'],
  },
};

/**
 * Combined Progress Brain Tool Declarations
 */
export const brainToolDeclarations: FunctionDeclaration[] = [
  proposeProgressionUpdateDeclaration,
  proposePlanModificationDeclaration,
  flagExerciseStallDeclaration,
];

// Zod Schema for FlagExerciseStall (non-mutating analysis tool validation)
export const FlagExerciseStallSchema = z.object({
  exerciseId: z.string({ message: 'exerciseId is required' }).trim().min(1, 'exerciseId is required'),
  sessionsAnalyzed: z.number({ message: 'sessionsAnalyzed must be an integer' }).int().min(1, 'sessionsAnalyzed must be at least 1'),
  e1rmTrendPercent: z.number({ message: 'e1rmTrendPercent must be a finite number' }).finite(),
  stallReason: z.string({ message: 'stallReason is required' }).trim().min(1, 'stallReason is required'),
  recommendedAction: z.enum(['HOLD_LOAD', 'DELOAD', 'CHANGE_EXERCISE', 'ADJUST_VOLUME', 'ASSESS_FATIGUE']),
  explanation: z.string({ message: 'explanation is required' }).trim().min(1, 'explanation is required'),
});

export type FlagExerciseStallArgs = z.infer<typeof FlagExerciseStallSchema>;

// ============================================================================
// 2. ANALYTICS SUMMARIZER & CONTEXT BUILDER
// ============================================================================

export interface BrainContextDependencies {
  storageAdapter?: MutationStorageAdapter;
  workouts?: Workout[];
  plans?: any[];
  currentTargets?: Record<string, any>[];
}

export interface BrainExerciseSummary {
  exerciseId: string;
  exerciseName: string;
  recentSessionsCount: number;
  latestE1RM: number;
  deltaE1RM: number;
  percentageDelta: number;
  progressionState: string;
  lastPerformance?: {
    date: string;
    weight: number;
    reps: number;
    rir?: number;
    rpe?: number;
    e1RM: number;
    volume: number;
  };
  stallAnalysis?: StallDetectionResult;
}

export interface BrainContextSummary {
  userId: string;
  generatedAt: string;
  hardFacts: {
    totalWorkoutsAnalyzed: number;
    completedWorkoutsCount: number;
    exercises: BrainExerciseSummary[];
    stalledExercises: {
      exerciseId: string;
      sessionsAnalyzed: number;
      percentageDelta: number;
      recommendedAction: string;
      rationale: string;
    }[];
    muscleVolumes: Record<
      string,
      {
        weeklySets: number;
        targetThreshold: number;
        isDeficit: boolean;
        status: string;
      }
    >;
    activeVolumeDeficits: string[];
  };
  deterministicRules: {
    doubleProgression: string;
    stallCriteria: string;
    fatigueDeload: string;
  };
  promptContextText: string;
}

/**
 * Builds a clean, factual context summary payload for the AI model.
 * 1. Fetches recent user training data.
 * 2. Runs Phase 1 deterministic analytics (calculateE1RM, detectExerciseStall, calculateMuscleGroupVolume).
 * 3. Compiles a concise factual context summary omitting verbose raw logs.
 */
export async function buildBrainContext(
  userId: string,
  deps?: BrainContextDependencies
): Promise<BrainContextSummary> {
  let workouts: Workout[] = deps?.workouts || [];

  // If workouts not provided directly, attempt fetch from storageAdapter if present
  if (workouts.length === 0 && deps?.storageAdapter) {
    const userWorkouts = await deps.storageAdapter.findExistingEntity('user_workouts_index', userId);
    if (userWorkouts && Array.isArray(userWorkouts.items)) {
      workouts = userWorkouts.items;
    }
  }

  const completedWorkouts = workouts.filter((w) => String(w.status).toUpperCase() === 'COMPLETED');

  // Discover all unique exercises logged in recent completed workouts
  const exerciseSet = new Set<string>();
  for (const w of completedWorkouts) {
    if (Array.isArray(w.sets)) {
      for (const s of w.sets) {
        if (s.exercise) exerciseSet.add(s.exercise);
      }
    }
  }

  const exerciseSummaries: BrainExerciseSummary[] = [];
  const stalledExercisesList: BrainContextSummary['hardFacts']['stalledExercises'] = [];

  for (const exId of exerciseSet) {
    const def = getExerciseById(exId);
    const exName = def?.name || exId;
    const history = extractExerciseHistory(completedWorkouts, exId);

    if (history.length === 0) continue;

    const progReport = analyzeExerciseProgression(completedWorkouts, exId, exName);
    const stallRes = detectExerciseStall(completedWorkouts, exId);

    const summary: BrainExerciseSummary = {
      exerciseId: exId,
      exerciseName: exName,
      recentSessionsCount: history.length,
      latestE1RM: progReport.currentE1RM,
      deltaE1RM: progReport.deltaE1RM,
      percentageDelta: progReport.percentageDelta,
      progressionState: progReport.state,
      lastPerformance: progReport.lastPerformance,
      stallAnalysis: stallRes,
    };

    exerciseSummaries.push(summary);

    if (stallRes.isStalled) {
      stalledExercisesList.push({
        exerciseId: exId,
        sessionsAnalyzed: stallRes.sessionsAnalyzed,
        percentageDelta: stallRes.percentageDelta,
        recommendedAction: stallRes.recommendedAction,
        rationale: stallRes.rationale,
      });
    }
  }

  // Calculate muscle group volume & deficits
  const volumeMap = calculateMuscleGroupVolume(completedWorkouts);
  const activeDeficits: string[] = [];

  for (const [mKey, vol] of Object.entries(volumeMap)) {
    if (vol.isDeficit) {
      activeDeficits.push(`${mKey} (${vol.weeklySets}/${vol.targetThreshold} sets)`);
    }
  }

  // Generate concise, high-signal LLM prompt text
  const textLines: string[] = [];
  textLines.push('=== FORGE AUTHORITATIVE TRAINING CONTEXT ===');
  textLines.push(`USER ID: ${userId}`);
  textLines.push(`GENERATED AT: ${new Date().toISOString()}`);
  textLines.push(`TOTAL COMPLETED SESSIONS: ${completedWorkouts.length}`);
  textLines.push('');

  textLines.push('--- [HARD FACTS] EXERCISE PERFORMANCE & TRAJECTORY ---');
  if (exerciseSummaries.length === 0) {
    textLines.push('No completed exercise logs recorded yet (Insufficient data).');
  } else {
    for (const ex of exerciseSummaries) {
      const last = ex.lastPerformance;
      const lastStr = last ? `${last.weight}kg × ${last.reps} reps (e1RM: ${last.e1RM}kg)` : 'No recent stats';
      const rirStr = last?.rir !== undefined ? ` [RIR: ${last.rir}]` : '';
      textLines.push(
        `- ${ex.exerciseName} (${ex.exerciseId}): Latest: ${lastStr}${rirStr} | Trend: ${ex.progressionState} (Δe1RM: ${ex.deltaE1RM >= 0 ? '+' : ''}${ex.deltaE1RM}kg, ${ex.percentageDelta}%)`
      );
      if (ex.stallAnalysis?.isStalled) {
        textLines.push(
          `  ⚠️ STALL DETECTED: < 2.5% progression over ${ex.stallAnalysis.sessionsAnalyzed} sessions. Action: ${ex.stallAnalysis.recommendedAction}. (${ex.stallAnalysis.rationale})`
        );
      }
    }
  }
  textLines.push('');

  textLines.push('--- [HARD FACTS] WEEKLY MUSCLE SET VOLUMES & DEFICITS ---');
  for (const [mKey, vol] of Object.entries(volumeMap)) {
    textLines.push(`- ${mKey}: ${vol.weeklySets} / ${vol.targetThreshold} sets (${vol.status})`);
  }
  if (activeDeficits.length > 0) {
    textLines.push(`ACTIVE DEFICITS FLAGGED: ${activeDeficits.join(', ')}`);
  } else {
    textLines.push('No volume deficits flagged across major muscle groups.');
  }
  textLines.push('');

  textLines.push('--- [SYSTEM PROGRESSION INVARIANTS] ---');
  textLines.push(
    '1. DOUBLE PROGRESSION: Increase load (+2.5kg compound / +1.25kg accessory) ONLY when target reps are hit at target RIR (>= 2).'
  );
  textLines.push(
    '2. STALL CRITERIA: When e1RM or load progresses < 2.5% across 3-4 consecutive sessions, DO NOT increase weight. Use flagExerciseStall and recommend HOLD_LOAD or DELOAD.'
  );
  textLines.push(
    '3. FATIGUE REGRESSION: High exertion (RIR 0-1) across stalled sessions indicates systemic fatigue; recommend deload or volume reduction.'
  );
  textLines.push(
    '4. MANDATORY AI JUSTIFICATION: Any proposed mutation (proposeProgressionUpdate, proposePlanModification) MUST include a non-empty, factual rationale.'
  );

  return {
    userId,
    generatedAt: new Date().toISOString(),
    hardFacts: {
      totalWorkoutsAnalyzed: workouts.length,
      completedWorkoutsCount: completedWorkouts.length,
      exercises: exerciseSummaries,
      stalledExercises: stalledExercisesList,
      muscleVolumes: volumeMap,
      activeVolumeDeficits: activeDeficits,
    },
    deterministicRules: {
      doubleProgression: 'Advance load only after top-of-range reps are met with RIR >= 2.',
      stallCriteria: '< 2.5% progression across 3-4 consecutive sessions at target RIR indicates plateau.',
      fatigueDeload: 'Decline in e1RM with high exertion requires deload or volume reduction.',
    },
    promptContextText: textLines.join('\n'),
  };
}

// ============================================================================
// 3. AI EXECUTION BRIDGE & MUTATION TRANSFORMER
// ============================================================================

export interface ToolCallPayload {
  name: string;
  args: Record<string, any>;
  callId?: string;
}

export interface SecurityContext {
  authenticatedUserId: string;
  storageAdapter: MutationStorageAdapter;
  idempotencyKey?: string;
  autonomyLevel?: string;
}

export interface BrainExecutionResult {
  toolName: string;
  actionType: 'MUTATION' | 'ANALYSIS_ONLY';
  success: boolean;
  mutationType?: string;
  auditLogId?: string;
  data?: any;
  error?: string;
  replayed?: boolean;
}

/**
 * Receives structured tool call output from the AI model, transforms parameters into a
 * strictly validated Phase 2 MutationEnvelope<T>, and routes through executeSecureMutation.
 */
export async function executeBrainAction(
  toolCall: ToolCallPayload,
  context: SecurityContext
): Promise<BrainExecutionResult> {
  const { authenticatedUserId, storageAdapter } = context;

  if (!authenticatedUserId || typeof authenticatedUserId !== 'string' || !authenticatedUserId.trim()) {
    return {
      toolName: toolCall.name,
      actionType: 'ANALYSIS_ONLY',
      success: false,
      error: 'SecurityContext: authenticatedUserId is required and must be a non-empty string.',
    };
  }

  if (!storageAdapter) {
    return {
      toolName: toolCall.name,
      actionType: 'ANALYSIS_ONLY',
      success: false,
      error: 'SecurityContext: storageAdapter is required.',
    };
  }

  const toolName = toolCall.name;
  const rawArgs = toolCall.args || {};

  // --------------------------------------------------------------------------
  // Tool: flagExerciseStall (Non-mutating Analysis Tool)
  // --------------------------------------------------------------------------
  if (toolName === 'flagExerciseStall') {
    const parseRes = FlagExerciseStallSchema.safeParse(rawArgs);
    if (!parseRes.success) {
      const errMsgs = parseRes.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(', ');
      return {
        toolName,
        actionType: 'ANALYSIS_ONLY',
        success: false,
        error: `Tool argument validation failed for flagExerciseStall: ${errMsgs}`,
      };
    }

    return {
      toolName,
      actionType: 'ANALYSIS_ONLY',
      success: true,
      data: {
        ...parseRes.data,
        evaluatedAt: new Date().toISOString(),
        verified: true,
      },
    };
  }

  // --------------------------------------------------------------------------
  // Tool: proposeProgressionUpdate (Mutates Target Progression)
  // --------------------------------------------------------------------------
  if (toolName === 'proposeProgressionUpdate') {
    const reason = (rawArgs.rationale || rawArgs.reason || '').trim();

    // Invariant: AI_BRAIN mutation strictly requires a non-empty reason
    if (!reason) {
      return {
        toolName,
        actionType: 'MUTATION',
        success: false,
        mutationType: 'UPDATE_TARGET_PROGRESSION',
        error: 'AI_BRAIN mutation rejected: A non-empty rationale/reason is strictly required for progression updates.',
      };
    }

    const idempotencyKey = context.idempotencyKey || crypto.randomUUID();
    const targetEntityId = `target_${authenticatedUserId}_${rawArgs.exerciseId || 'unknown'}`;

    const rawEnvelope = {
      idempotencyKey,
      userId: authenticatedUserId,
      source: 'AI_BRAIN' as const,
      reason,
      timestamp: new Date().toISOString(),
      payload: {
        exerciseId: rawArgs.exerciseId,
        targetWeightKg: rawArgs.targetWeightKg,
        targetRepsMin: rawArgs.targetRepsMin,
        targetRepsMax: rawArgs.targetRepsMax,
        suggestedRir: rawArgs.suggestedRir,
        action: rawArgs.action,
        rationale: reason,
      },
    };

    const mutResult = await executeSecureMutation({
      rawEnvelope,
      payloadSchema: UpdateTargetProgressionSchema,
      authenticatedUserId,
      targetEntityType: 'TARGET_PROGRESSION',
      targetEntityId,
      storageAdapter,
      execute: async (validatedPayload) => {
        const targetData = {
          id: targetEntityId,
          userId: authenticatedUserId,
          ...validatedPayload,
          source: 'AI_BRAIN',
          updatedAt: new Date().toISOString(),
        };
        await storageAdapter.commitMutation('targets_1rm', targetEntityId, targetData);
        return targetData;
      },
    });

    if (!mutResult.success) {
      return {
        toolName,
        actionType: 'MUTATION',
        success: false,
        mutationType: 'UPDATE_TARGET_PROGRESSION',
        error: mutResult.error,
        auditLogId: mutResult.auditLogId,
      };
    }

    return {
      toolName,
      actionType: 'MUTATION',
      success: true,
      mutationType: 'UPDATE_TARGET_PROGRESSION',
      auditLogId: mutResult.auditLogId,
      data: mutResult.data,
      replayed: mutResult.idempotentReplay,
    };
  }

  // --------------------------------------------------------------------------
  // Tool: proposePlanModification (Mutates Training Plan)
  // --------------------------------------------------------------------------
  if (toolName === 'proposePlanModification') {
    const reason = (rawArgs.rationale || rawArgs.reason || '').trim();

    // Invariant: AI_BRAIN mutation strictly requires a non-empty reason
    if (!reason) {
      return {
        toolName,
        actionType: 'MUTATION',
        success: false,
        mutationType: 'MODIFY_TRAINING_PLAN',
        error: 'AI_BRAIN mutation rejected: A non-empty rationale/reason is strictly required for plan modifications.',
      };
    }

    const idempotencyKey = context.idempotencyKey || crypto.randomUUID();
    const planId = rawArgs.planId;

    const rawEnvelope = {
      idempotencyKey,
      userId: authenticatedUserId,
      source: 'AI_BRAIN' as const,
      reason,
      timestamp: new Date().toISOString(),
      payload: {
        planId,
        name: rawArgs.name,
        weeklyFrequency: rawArgs.weeklyFrequency,
        isActive: rawArgs.isActive,
        days: rawArgs.days,
      },
    };

    const mutResult = await executeSecureMutation({
      rawEnvelope,
      payloadSchema: ModifyTrainingPlanSchema,
      authenticatedUserId,
      targetEntityType: 'TRAINING_PLAN',
      targetEntityId: planId,
      storageAdapter,
      execute: async (validatedPayload) => {
        const planData = {
          id: validatedPayload.planId,
          userId: authenticatedUserId,
          ...validatedPayload,
          source: 'AI_BRAIN',
          updatedAt: new Date().toISOString(),
        };
        await storageAdapter.commitMutation('plans', validatedPayload.planId, planData);
        return planData;
      },
    });

    if (!mutResult.success) {
      return {
        toolName,
        actionType: 'MUTATION',
        success: false,
        mutationType: 'MODIFY_TRAINING_PLAN',
        error: mutResult.error,
        auditLogId: mutResult.auditLogId,
      };
    }

    return {
      toolName,
      actionType: 'MUTATION',
      success: true,
      mutationType: 'MODIFY_TRAINING_PLAN',
      auditLogId: mutResult.auditLogId,
      data: mutResult.data,
      replayed: mutResult.idempotentReplay,
    };
  }

  // --------------------------------------------------------------------------
  // Unrecognized tool
  // --------------------------------------------------------------------------
  return {
    toolName,
    actionType: 'ANALYSIS_ONLY',
    success: false,
    error: `Unrecognized AI tool call: "${toolName}". Allowed tools: proposeProgressionUpdate, proposePlanModification, flagExerciseStall.`,
  };
}
