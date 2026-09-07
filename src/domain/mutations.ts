import { z } from 'zod';
import { hashMutationPayload, evaluateIdempotencyRecord, IdempotencyRecord } from '../lib/idempotency-guard';

// ==========================================
// 1. ZOD INPUT SCHEMAS FOR WORKOUT OPERATIONS
// ==========================================

/**
 * 1. LogSetInputSchema
 * Validates single set execution (exerciseId, weightKg, reps, rir, completedAt, etc.)
 */
export const LogSetInputSchema = z.object({
  exerciseId: z
    .string({ message: 'exerciseId is required' })
    .trim()
    .min(1, 'exerciseId must be a non-empty string'),
  weightKg: z
    .number({ message: 'weightKg is required' })
    .finite('weightKg must be a finite number')
    .min(0, 'weightKg must be greater than or equal to 0kg')
    .max(1000, 'weightKg cannot exceed 1000kg'),
  reps: z
    .number({ message: 'reps is required' })
    .int('reps must be an integer')
    .min(1, 'reps must be at least 1')
    .max(200, 'reps cannot exceed 200'),
  rir: z
    .number({ message: 'rir must be a number' })
    .finite('rir must be a finite number')
    .min(0, 'rir must be between 0 and 10')
    .max(10, 'rir must be between 0 and 10')
    .nullable()
    .optional(),
  rpe: z
    .number({ message: 'rpe must be a number' })
    .finite('rpe must be a finite number')
    .min(1, 'rpe must be between 1 and 10')
    .max(10, 'rpe must be between 1 and 10')
    .nullable()
    .optional(),
  completedAt: z
    .string()
    .refine((val) => !isNaN(Date.parse(val)), {
      message: 'completedAt must be a valid date/timestamp string',
    })
    .optional(),
  setType: z.enum(['N', 'W', 'D', 'F']).default('N').optional(),
  notes: z.string().max(500, 'notes cannot exceed 500 characters').optional(),
  workoutId: z.string().trim().min(1, 'workoutId must be non-empty').optional(),
});

export type LogSetInput = z.infer<typeof LogSetInputSchema>;

/**
 * 2. CreateWorkoutSessionSchema
 * Validates session metadata and sets array.
 */
export const CreateWorkoutSessionSchema = z.object({
  title: z
    .string({ message: 'title is required' })
    .trim()
    .min(1, 'title is required')
    .max(120, 'title cannot exceed 120 characters'),
  scheduledDate: z
    .string({ message: 'scheduledDate is required' })
    .regex(/^\d{4}-\d{2}-\d{2}/, 'scheduledDate must be a valid date string (YYYY-MM-DD)'),
  status: z
    .enum(['PLANNED', 'IN_PROGRESS', 'COMPLETED', 'SKIPPED'])
    .default('PLANNED'),
  sets: z.array(LogSetInputSchema).default([]),
  notes: z.string().max(2000, 'notes cannot exceed 2000 characters').optional(),
  planId: z.string().trim().min(1).optional(),
  durationMinutes: z
    .number()
    .int('durationMinutes must be an integer')
    .min(0, 'durationMinutes cannot be negative')
    .max(720, 'durationMinutes cannot exceed 720 minutes (12 hours)')
    .optional(),
});

export type CreateWorkoutSessionInput = z.infer<typeof CreateWorkoutSessionSchema>;

/**
 * 3. UpdateTargetProgressionSchema
 * Validates adjustments to weight/rep targets.
 */
export const UpdateTargetProgressionSchema = z
  .object({
    exerciseId: z
      .string({ message: 'exerciseId is required' })
      .trim()
      .min(1, 'exerciseId is required'),
    targetWeightKg: z
      .number({ message: 'targetWeightKg is required' })
      .finite('targetWeightKg must be a finite number')
      .min(0, 'targetWeightKg cannot be negative')
      .max(1000, 'targetWeightKg cannot exceed 1000kg'),
    targetRepsMin: z
      .number({ message: 'targetRepsMin is required' })
      .int('targetRepsMin must be an integer')
      .min(1, 'targetRepsMin must be at least 1')
      .max(100, 'targetRepsMin cannot exceed 100'),
    targetRepsMax: z
      .number({ message: 'targetRepsMax is required' })
      .int('targetRepsMax must be an integer')
      .min(1, 'targetRepsMax must be at least 1')
      .max(100, 'targetRepsMax cannot exceed 100'),
    suggestedRir: z
      .number()
      .finite('suggestedRir must be a finite number')
      .min(0, 'suggestedRir must be between 0 and 10')
      .max(10, 'suggestedRir must be between 0 and 10')
      .nullable()
      .optional(),
    action: z.enum(['INCREASE_WEIGHT', 'INCREASE_REPS', 'MAINTAIN', 'DELOAD', 'BASELINE'], {
      message: 'action is required',
    }),
    rationale: z
      .string({ message: 'rationale is required' })
      .trim()
      .min(1, 'rationale is required')
      .max(1000, 'rationale cannot exceed 1000 characters'),
  })
  .refine((data) => data.targetRepsMax >= data.targetRepsMin, {
    message: 'targetRepsMax must be greater than or equal to targetRepsMin',
    path: ['targetRepsMax'],
  });

export type UpdateTargetProgressionInput = z.infer<typeof UpdateTargetProgressionSchema>;

/**
 * 4. ModifyTrainingPlanSchema
 * Validates plan/exercise restructuring.
 */
export const PlanExerciseInputSchema = z
  .object({
    id: z.string().trim().min(1, 'Exercise item id is required'),
    exerciseId: z.string().trim().min(1, 'exerciseId is required'),
    targetSets: z
      .number({ message: 'targetSets is required' })
      .int('targetSets must be an integer')
      .min(1, 'targetSets must be at least 1')
      .max(50, 'targetSets cannot exceed 50'),
    targetRepsMin: z
      .number({ message: 'targetRepsMin is required' })
      .int('targetRepsMin must be an integer')
      .min(1, 'targetRepsMin must be at least 1')
      .max(100, 'targetRepsMin cannot exceed 100'),
    targetRepsMax: z
      .number({ message: 'targetRepsMax is required' })
      .int('targetRepsMax must be an integer')
      .min(1, 'targetRepsMax must be at least 1')
      .max(100, 'targetRepsMax cannot exceed 100'),
  })
  .refine((data) => data.targetRepsMax >= data.targetRepsMin, {
    message: 'targetRepsMax must be greater than or equal to targetRepsMin',
    path: ['targetRepsMax'],
  });

export type PlanExerciseInput = z.infer<typeof PlanExerciseInputSchema>;

export const PlanDayInputSchema = z.object({
  id: z.string().trim().min(1, 'Day id is required'),
  name: z.string().trim().min(1, 'Day name is required').max(60, 'Day name cannot exceed 60 characters'),
  exercises: z.array(PlanExerciseInputSchema).min(1, 'Each day must contain at least 1 exercise'),
});

export type PlanDayInput = z.infer<typeof PlanDayInputSchema>;

export const ModifyTrainingPlanSchema = z.object({
  planId: z.string({ message: 'planId is required' }).trim().min(1, 'planId is required'),
  name: z.string().trim().min(1).max(100, 'Plan name cannot exceed 100 characters').optional(),
  weeklyFrequency: z
    .number()
    .int('weeklyFrequency must be an integer')
    .min(1, 'weeklyFrequency must be between 1 and 7')
    .max(7, 'weeklyFrequency must be between 1 and 7')
    .optional(),
  isActive: z.boolean().optional(),
  days: z.array(PlanDayInputSchema).min(1, 'Plan must contain at least one training day'),
});

export type ModifyTrainingPlanInput = z.infer<typeof ModifyTrainingPlanSchema>;

// ==========================================
// 2. STANDARDIZED MUTATION ENVELOPE
// ==========================================

export const MutationSourceEnum = z.enum(['USER_INPUT', 'AI_BRAIN']);
export type MutationSource = z.infer<typeof MutationSourceEnum>;

export interface MutationEnvelope<T> {
  idempotencyKey: string;
  userId: string;
  source: MutationSource;
  reason?: string;
  timestamp: string;
  payload: T;
}

/**
 * Creates a validated generic MutationEnvelope Zod schema.
 * Enforces:
 * - idempotencyKey: valid UUIDv4
 * - userId: non-empty string
 * - source: USER_INPUT | AI_BRAIN
 * - reason: strictly REQUIRED and non-empty when source === 'AI_BRAIN'
 * - timestamp: valid ISO Date string
 * - payload: validated against payloadSchema
 */
export function createMutationEnvelopeSchema<T extends z.ZodTypeAny>(payloadSchema: T) {
  return z
    .object({
      idempotencyKey: z
        .string({ message: 'idempotencyKey is required' })
        .uuid('idempotencyKey must be a valid UUIDv4'),
      userId: z
        .string({ message: 'userId is required' })
        .trim()
        .min(1, 'userId must be a non-empty string'),
      source: MutationSourceEnum,
      reason: z.string().trim().optional(),
      timestamp: z
        .string({ message: 'timestamp is required' })
        .refine((val) => !isNaN(Date.parse(val)), {
          message: 'timestamp must be a valid ISO Date string',
        }),
      payload: payloadSchema,
    })
    .superRefine((data, ctx) => {
      if (data.source === 'AI_BRAIN') {
        if (!data.reason || data.reason.trim().length === 0) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'A non-empty reason is strictly required when mutation source is "AI_BRAIN"',
            path: ['reason'],
          });
        }
      }
    });
}

// ==========================================
// 3. SERVER-SIDE EXECUTION & AUDIT BRIDGE
// ==========================================

export interface MutationResult<T> {
  success: boolean;
  data?: T;
  error?: string;
  idempotentReplay?: boolean;
  auditLogId?: string;
}

export interface SecureAuditLogEntry {
  id: string;
  mutationId: string;
  userId: string;
  source: MutationSource;
  reason?: string;
  targetEntityType: string;
  targetEntityId: string;
  timestamp: string;
  beforeState?: Record<string, any> | null;
  afterState?: Record<string, any> | null;
  status: 'COMMITTED' | 'REVERTED' | 'FAILED';
}

export interface MutationStorageAdapter {
  findExistingEntity(entityType: string, entityId: string): Promise<Record<string, any> | null>;
  findIdempotencyRecord(key: string): Promise<(IdempotencyRecord & { auditLogId?: string }) | null>;
  recordIdempotency(record: IdempotencyRecord & { auditLogId?: string }): Promise<void>;
  recordAuditLog(entry: SecureAuditLogEntry): Promise<void>;
  commitMutation(entityType: string, entityId: string, data: Record<string, any>): Promise<void>;
  runTransaction<R>(fn: (txAdapter: MutationStorageAdapter) => Promise<R>): Promise<R>;
}

/**
 * In-Memory Mutation Storage Adapter for deterministic unit testing and local execution
 */
export class InMemoryMutationStorageAdapter implements MutationStorageAdapter {
  private entities = new Map<string, Record<string, any>>();
  private idempotencyStore = new Map<string, IdempotencyRecord & { auditLogId?: string }>();
  private auditLogStore = new Map<string, SecureAuditLogEntry>();

  private getEntityKey(type: string, id: string): string {
    return `${type}::${id}`;
  }

  async findExistingEntity(entityType: string, entityId: string): Promise<Record<string, any> | null> {
    const data = this.entities.get(this.getEntityKey(entityType, entityId));
    return data ? JSON.parse(JSON.stringify(data)) : null;
  }

  async findIdempotencyRecord(key: string): Promise<(IdempotencyRecord & { auditLogId?: string }) | null> {
    const data = this.idempotencyStore.get(key);
    return data ? JSON.parse(JSON.stringify(data)) : null;
  }

  async recordIdempotency(record: IdempotencyRecord & { auditLogId?: string }): Promise<void> {
    this.idempotencyStore.set(record.mutationId, JSON.parse(JSON.stringify(record)));
  }

  async recordAuditLog(entry: SecureAuditLogEntry): Promise<void> {
    this.auditLogStore.set(entry.id, JSON.parse(JSON.stringify(entry)));
  }

  async commitMutation(entityType: string, entityId: string, data: Record<string, any>): Promise<void> {
    this.entities.set(this.getEntityKey(entityType, entityId), JSON.parse(JSON.stringify(data)));
  }

  async runTransaction<R>(fn: (txAdapter: MutationStorageAdapter) => Promise<R>): Promise<R> {
    // In-memory transactions run atomically in single-threaded Node.js
    return await fn(this);
  }

  getAuditLogs(): SecureAuditLogEntry[] {
    return Array.from(this.auditLogStore.values());
  }

  getIdempotencyRecords(): (IdempotencyRecord & { auditLogId?: string })[] {
    return Array.from(this.idempotencyStore.values());
  }

  seedEntity(entityType: string, entityId: string, data: Record<string, any>): void {
    this.entities.set(this.getEntityKey(entityType, entityId), JSON.parse(JSON.stringify(data)));
  }
}

/**
 * Sanitizes errors to prevent exposing database internals or secrets to the client.
 */
function sanitizeErrorMessage(err: unknown): string {
  if (err instanceof Error) {
    const msg = err.message || '';
    if (
      msg.includes('Firebase') ||
      msg.includes('firestore') ||
      msg.includes('credentials') ||
      msg.includes('SQL') ||
      msg.includes('connection refused')
    ) {
      return 'An internal storage error occurred during mutation execution.';
    }
    return msg;
  }
  return 'Unknown error during mutation execution.';
}

export interface MutationExecutionContext {
  authenticatedUserId: string;
  timestamp: string;
  source: MutationSource;
  reason?: string;
  storage: MutationStorageAdapter;
  existingEntity?: Record<string, any> | null;
}

export interface ExecuteSecureMutationParams<TPayload, TResult = any> {
  rawEnvelope: unknown;
  payloadSchema: z.ZodSchema<TPayload>;
  authenticatedUserId: string;
  targetEntityType: string;
  targetEntityId?: string;
  storageAdapter?: MutationStorageAdapter;
  execute: (validatedPayload: TPayload, ctx: MutationExecutionContext) => Promise<TResult>;
  getExistingEntity?: (targetEntityId: string, storage: MutationStorageAdapter) => Promise<Record<string, any> | null>;
}

/**
 * Master Server-Side Mutation Pipeline: executeSecureMutation<T>
 * 
 * Enforces:
 * 1. Strict Zod schema validation on envelope and payload (including UUIDv4, RIR/weight bounds, AI reason).
 * 2. Server-side authentication and authorization: envelope.userId must equal verified token UID.
 * 3. Strict ownership check: existing target entity must belong to the authenticated user.
 * 4. Deterministic idempotency check (rejecting conflicts/cross-tenant hijacking; returning cached replay for identical requests).
 * 5. Atomic transaction execution.
 * 6. Non-destructive immutable audit log appended on every mutation.
 * 7. Structured, scrubbed MutationResult return type.
 */
export async function executeSecureMutation<TPayload, TResult = any>(
  params: ExecuteSecureMutationParams<TPayload, TResult>
): Promise<MutationResult<TResult>> {
  const {
    rawEnvelope,
    payloadSchema,
    authenticatedUserId,
    targetEntityType,
    targetEntityId,
    storageAdapter = new InMemoryMutationStorageAdapter(),
    execute,
    getExistingEntity,
  } = params;

  // STEP 1: Envelope & Payload Schema Validation
  const envelopeSchema = createMutationEnvelopeSchema(payloadSchema);
  const parseResult = envelopeSchema.safeParse(rawEnvelope);

  if (!parseResult.success) {
    const formattedErrors = parseResult.error.issues
      .map((issue) => `${issue.path.join('.') || 'envelope'}: ${issue.message}`)
      .join('; ');
    return {
      success: false,
      error: `Validation failed: ${formattedErrors}`,
    };
  }

  const envelope = parseResult.data;

  // STEP 2: Authentication & Authorization Verification
  if (envelope.userId !== authenticatedUserId) {
    return {
      success: false,
      error: `Authorization failed: Envelope userId "${envelope.userId}" does not match authenticated user "${authenticatedUserId}".`,
    };
  }

  try {
    return await storageAdapter.runTransaction(async (txStorage) => {
      // Determine target entity ID (either explicit or derived from payload if present)
      const effectiveTargetId =
        targetEntityId ||
        (envelope.payload as any)?.id ||
        (envelope.payload as any)?.exerciseId ||
        (envelope.payload as any)?.planId ||
        'global';

      // STEP 3: Ownership check if target exists
      let existingEntity: Record<string, any> | null = null;
      if (getExistingEntity && effectiveTargetId !== 'global') {
        existingEntity = await getExistingEntity(effectiveTargetId, txStorage);
      } else if (effectiveTargetId !== 'global') {
        existingEntity = await txStorage.findExistingEntity(targetEntityType, effectiveTargetId);
      }

      if (existingEntity && existingEntity.userId && existingEntity.userId !== authenticatedUserId) {
        return {
          success: false,
          error: `Authorization failed: Authenticated user "${authenticatedUserId}" does not own target entity "${effectiveTargetId}".`,
        };
      }

      // STEP 4: Idempotency Key & Hash Verification
      const payloadHash = hashMutationPayload(effectiveTargetId, envelope.payload);
      const existingIdempRecord = await txStorage.findIdempotencyRecord(envelope.idempotencyKey);

      const idempEval = evaluateIdempotencyRecord(
        existingIdempRecord,
        effectiveTargetId,
        payloadHash,
        authenticatedUserId
      );

      if (idempEval.status === 'REPLAY') {
        return {
          success: true,
          data: idempEval.result,
          idempotentReplay: true,
          auditLogId: existingIdempRecord?.auditLogId,
        };
      }

      if (idempEval.status === 'CONFLICT') {
        return {
          success: false,
          error: `Idempotency conflict: ${idempEval.error || 'Duplicate key with differing payload.'}`,
        };
      }

      // STEP 5: Execution of the State Mutation
      const executionContext: MutationExecutionContext = {
        authenticatedUserId,
        timestamp: envelope.timestamp,
        source: envelope.source,
        reason: envelope.reason,
        storage: txStorage,
        existingEntity,
      };

      const executionData = await execute(envelope.payload, executionContext);

      // STEP 6: Non-Destructive Audit Log Entry
      const auditLogId = `audit_${crypto.randomUUID()}`;
      const auditEntry: SecureAuditLogEntry = {
        id: auditLogId,
        mutationId: envelope.idempotencyKey,
        userId: authenticatedUserId,
        source: envelope.source,
        reason: envelope.reason,
        targetEntityType,
        targetEntityId: effectiveTargetId,
        timestamp: new Date().toISOString(),
        beforeState: existingEntity ? JSON.parse(JSON.stringify(existingEntity)) : null,
        afterState: executionData ? JSON.parse(JSON.stringify(executionData)) : null,
        status: 'COMMITTED',
      };
      await txStorage.recordAuditLog(auditEntry);

      // STEP 7: Record Idempotency Entry for replay caching
      const newIdempRecord: IdempotencyRecord & { auditLogId: string } = {
        mutationId: envelope.idempotencyKey,
        userId: authenticatedUserId,
        targetId: effectiveTargetId,
        payloadHash,
        result: executionData,
        createdAt: new Date().toISOString(),
        auditLogId,
      };
      await txStorage.recordIdempotency(newIdempRecord);

      return {
        success: true,
        data: executionData,
        idempotentReplay: false,
        auditLogId,
      };
    });
  } catch (error: any) {
    return {
      success: false,
      error: sanitizeErrorMessage(error),
    };
  }
}
