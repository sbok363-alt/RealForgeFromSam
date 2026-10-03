import { 
  doc, 
  getDoc, 
  setDoc, 
  serverTimestamp, 
  collection, 
  query, 
  where, 
  getDocs, 
  orderBy, 
  limit as firestoreLimit, 
  deleteDoc, 
  writeBatch 
} from 'firebase/firestore';
import { db, auth } from './firebase';
import { executeRollbackValidation } from './validation';
import {
  getOrCreateGuestIdentity,
  guestProfileKey,
  isGuestSessionActive,
  isGuestUserId,
} from './guest-session';
import { 
  UserPermissions, 
  Proposal, 
  Workout, 
  MutationAuditLog, 
  Thread, 
  ThreadMessage, 
  AutonomyLevel,
  ProposalStatus,
  BodyweightEntry,
  PersonalRecord,
  UserProfile,
  Target1RM
} from '../types';

export interface CloudPersistenceOptions {
  requireCloud?: boolean;
}

function isLocalEntityForUser(value: unknown, userId: string): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const entity = value as { id?: unknown; userId?: unknown };
  return (
    typeof entity.id === 'string' &&
    entity.id.trim().length > 0 &&
    (entity.userId === undefined || entity.userId === userId)
  );
}

// ==========================================
// USER PERMISSIONS
// ==========================================

export async function getUserPermissions(userId: string): Promise<UserPermissions> {
  const localKey = `forge_permissions_${userId}`;
  const local = localStorage.getItem(localKey);
  if (local) {
    try {
      const parsed = JSON.parse(local) as Partial<UserPermissions>;
      const validAutonomyLevels: AutonomyLevel[] = [
        'L0_READ_ONLY',
        'L1_MICRO_ACTIONS',
        'L2_GUIDED_AUTONOMY',
        'L3_FULL_AUTONOMY',
      ];
      if (
        parsed &&
        typeof parsed === 'object' &&
        !Array.isArray(parsed) &&
        parsed.userId === userId &&
        validAutonomyLevels.includes(parsed.autonomyLevel as AutonomyLevel) &&
        Number.isInteger(parsed.permissionEpoch) &&
        Number(parsed.permissionEpoch) >= 1
      ) {
        return parsed as UserPermissions;
      }
    } catch {}
  }

  if (!isGuestUserId(userId)) {
    try {
      const docRef = doc(db, 'user_permissions', userId);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        return docSnap.data() as UserPermissions;
      }
    } catch (e) {
      console.warn("Could not fetch user_permissions from Firestore, fallback to local:", e);
    }
  }

  const defaultPermissions: UserPermissions = {
    userId,
    autonomyLevel: 'L2_GUIDED_AUTONOMY',
    permissionEpoch: 1
  };
  localStorage.setItem(localKey, JSON.stringify(defaultPermissions));

  if (!isGuestUserId(userId)) {
    try {
      await setDoc(doc(db, 'user_permissions', userId), defaultPermissions);
    } catch {}
  }

  return defaultPermissions;
}

export async function updateUserPermissions(
  userId: string,
  autonomyLevel: AutonomyLevel,
  options: CloudPersistenceOptions = {}
): Promise<UserPermissions> {
  const current = await getUserPermissions(userId);
  const updated: UserPermissions = {
    userId,
    autonomyLevel,
    permissionEpoch: (current.permissionEpoch || 1) + 1
  };

  if (!isGuestUserId(userId)) {
    try {
      await setDoc(doc(db, 'user_permissions', userId), updated);
    } catch (e) {
      if (options.requireCloud) throw e;
      console.warn("Could not update Firestore user_permissions:", e);
    }
  }

  localStorage.setItem(`forge_permissions_${userId}`, JSON.stringify(updated));
  return updated;
}

// ==========================================
// WORKOUTS & OPTIMISTIC CONCURRENCY CONTROL (OCC)
// ==========================================

export async function getWorkouts(userId: string): Promise<Workout[]> {
  if (!isGuestUserId(userId)) {
    try {
      const q = query(
        collection(db, 'workouts'),
        where('userId', '==', userId),
        orderBy('scheduledDate', 'desc')
      );
      const snap = await getDocs(q);
      if (!snap.empty) {
        return snap.docs.map(d => ({ id: d.id, ...d.data() } as Workout));
      }
    } catch (e) {
      console.warn("Firestore query failed for workouts, reading localStorage:", e);
    }
  }

  const local = localStorage.getItem(`forge_workouts_${userId}`);
  if (local) {
    try {
      const parsed = JSON.parse(local);
      return Array.isArray(parsed)
      ? parsed.filter((item) => isLocalEntityForUser(item, userId))
      : [];
    } catch (e) {}
  }
  return [];
}

export async function getWorkout(workoutId: string, userId: string): Promise<Workout | null> {
  if (!isGuestUserId(userId)) {
    try {
      const docRef = doc(db, 'workouts', workoutId);
      const snap = await getDoc(docRef);
      if (snap.exists()) {
        return { id: snap.id, ...snap.data() } as Workout;
      }
    } catch (e) {
      console.warn("Could not fetch workout from Firestore:", e);
    }
  }

  const list = await getWorkouts(userId);
  return list.find(w => w.id === workoutId) || null;
}

export interface SaveWorkoutOptions {
  mutationId?: string;
}

export interface WorkoutMutationOptions {
  mutationId: string;
  duration?: number;
  volume?: number;
  forceCloud?: boolean;
}

export class WorkoutConflictError extends Error {
  status = 409;
  currentVersion?: number;
  workout?: Workout;

  constructor(message: string, currentVersion?: number, workout?: Workout) {
    super(message);
    this.name = 'WorkoutConflictError';
    this.currentVersion = currentVersion;
    this.workout = workout;
  }
}

function workoutInverseDelta(workout: Workout): Record<string, any> {
  const delta: Record<string, any> = {
    title: workout.title,
    scheduledDate: workout.scheduledDate,
    status: workout.status,
    sets: workout.sets || [],
    exercises: workout.exercises || [],
  };

  if (workout.notes !== undefined) delta.notes = workout.notes;
  if (workout.exerciseNotes !== undefined) delta.exerciseNotes = workout.exerciseNotes;
  if (workout.completedAt !== undefined) delta.completedAt = workout.completedAt;
  if (workout.startedAt !== undefined) delta.startedAt = workout.startedAt;
  if (workout.totalVolume !== undefined) delta.totalVolume = workout.totalVolume;
  if (workout.volume !== undefined) delta.volume = workout.volume;
  if (workout.duration !== undefined) delta.duration = workout.duration;

  return delta;
}

async function appendLocalAuditLog(log: MutationAuditLog): Promise<void> {
  if (!log.userId) return;
  const normalized: MutationAuditLog = {
    ...log,
    storageScope: log.storageScope || 'LOCAL',
  };
  const key = `forge_audit_logs_${log.userId}`;
  let existing: MutationAuditLog[] = [];
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || '[]');
    existing = Array.isArray(parsed)
      ? parsed.filter((item) => isLocalEntityForUser(item, log.userId!)) as MutationAuditLog[]
      : [];
  } catch {}
  localStorage.setItem(
    key,
    JSON.stringify([normalized, ...existing.filter((item) => item.id !== normalized.id)])
  );
}

export async function upsertAuthoritativeWorkoutCache(workout: Workout): Promise<void> {
  if (!workout.userId) return;
  const all = await getWorkouts(workout.userId);
  const exists = all.some(w => w.id === workout.id);
  const next = exists
    ? all.map(w => w.id === workout.id ? workout : w)
    : [workout, ...all];
  localStorage.setItem(`forge_workouts_${workout.userId}`, JSON.stringify(next));
}

export async function saveWorkout(
  workout: Workout,
  actor: 'USER' | 'AI_BRAIN' | 'SYSTEM_AUTONOMOUS' = 'USER',
  summary: string = 'Created initial workout routine',
  options: SaveWorkoutOptions = {}
): Promise<Workout> {
  if (isGuestUserId(workout.userId) || (isGuestSessionActive() && !auth.currentUser)) {
    const identity = getOrCreateGuestIdentity();
    const localWorkout: Workout = {
      ...workout,
      userId: workout.userId || identity.uid,
      version: Math.max(1, workout.version || 1),
      updatedAt: new Date().toISOString(),
    };
    await upsertAuthoritativeWorkoutCache(localWorkout);
    await appendLocalAuditLog({
      id: `audit_${crypto.randomUUID()}`,
      mutationId: options.mutationId || crypto.randomUUID(),
      userId: localWorkout.userId,
      actor,
      action: 'CREATE',
      mutationType: 'CREATE_WORKOUT',
      targetEntityType: 'WORKOUT',
      targetEntityId: localWorkout.id,
      baseVersion: 0,
      resultVersion: localWorkout.version,
      summary,
      inverseDelta: { deleted: true },
      createdAt: new Date().toISOString(),
    });
    return localWorkout;
  }

  const token = await auth.currentUser?.getIdToken();
  if (!token) throw new Error('Not authenticated');
  const mutationId = options.mutationId || crypto.randomUUID();

  const res = await fetch('/api/workouts', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({
      workout,
      actor,
      summary,
      mutationId
    })
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || 'Failed to create workout on server');
  }

  const created: Workout = data.workout;
  await upsertAuthoritativeWorkoutCache(created);
  return created;
}

export async function deleteWorkout(
  workoutId: string,
  userId: string,
  actor: 'USER' | 'AI_BRAIN' = 'USER'
): Promise<void> {
  if (!isGuestUserId(userId)) {
    const token = await auth.currentUser?.getIdToken();
    if (!token) throw new Error('Not authenticated');
    const mutationId = crypto.randomUUID();

    const res = await fetch(`/api/workouts/${workoutId}`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ mutationId, actor })
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || 'Failed to delete workout');
    }
  }

  const all = await getWorkouts(userId);
  const current = all.find((workout) => workout.id === workoutId);
  const nextList = all.filter(w => w.id !== workoutId);
  localStorage.setItem(`forge_workouts_${userId}`, JSON.stringify(nextList));

  if (isGuestUserId(userId) && current) {
    await appendLocalAuditLog({
      id: `audit_${crypto.randomUUID()}`,
      mutationId: crypto.randomUUID(),
      userId,
      actor,
      action: 'DELETE',
      mutationType: 'DELETE_WORKOUT',
      targetEntityType: 'WORKOUT',
      targetEntityId: workoutId,
      baseVersion: current.version,
      resultVersion: current.version + 1,
      summary: `Deleted workout "${current.title}"`,
      inverseDelta: workoutInverseDelta(current),
      createdAt: new Date().toISOString(),
    });
  }
}

// ==========================================
// PROPOSALS MANAGEMENT & OCC EXECUTION
// ==========================================

export async function getProposals(userId: string): Promise<Proposal[]> {
  if (!isGuestUserId(userId)) {
    try {
    const q = query(
      collection(db, 'proposals'),
      where('userId', '==', userId),
      orderBy('createdAt', 'desc')
    );
    const snap = await getDocs(q);
    if (!snap.empty) {
      return snap.docs.map(d => ({ id: d.id, ...d.data() } as Proposal));
    }
  } catch (e) {
      console.warn("Could not fetch proposals from Firestore:", e);
    }
  }

  const local = localStorage.getItem(`forge_proposals_${userId}`);
  if (local) {
    try {
      return JSON.parse(local);
    } catch (e) {}
  }
  return [];
}

export async function createProposal(userId: string, proposal: Omit<Proposal, 'createdAt'>): Promise<Proposal> {
  const newProposal: Proposal = {
    ...proposal,
    createdAt: new Date().toISOString()
  };

  if (!isGuestUserId(userId)) {
    try {
      await setDoc(doc(db, 'proposals', proposal.id), { ...newProposal, userId });
    } catch (e) {
      console.warn("Could not save proposal to Firestore:", e);
    }
  }

  const list = await getProposals(userId);
  const updated = [newProposal, ...list.filter(p => p.id !== proposal.id)];
  localStorage.setItem(`forge_proposals_${userId}`, JSON.stringify(updated));

  return newProposal;
}

export async function executeProposal(
  proposalId: string, 
  userId: string,
  actor: 'USER' | 'AI_BRAIN' | 'SYSTEM_AUTONOMOUS' = 'USER'
): Promise<{ success: boolean; workout?: Workout; proposal?: Proposal; error?: string }> {
  if (isGuestUserId(userId)) {
    return { success: false, error: 'CLOUD_REQUIRED' };
  }
  const token = await auth.currentUser?.getIdToken();
  if (!token) return { success: false, error: 'Not authenticated' };
  const mutationId = crypto.randomUUID();

  try {
    const res = await fetch(`/api/proposals/${proposalId}/execute`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ mutationId })
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return {
        success: false,
        error: data.error || 'Failed to execute proposal'
      };
    }

    // Update local workout cache
    if (data.workout && data.workout.userId) {
      const all = await getWorkouts(data.workout.userId);
      const exists = all.some(w => w.id === data.workout.id);
      const nextList = exists
        ? all.map(w => w.id === data.workout.id ? data.workout : w)
        : [data.workout, ...all];
      localStorage.setItem(`forge_workouts_${data.workout.userId}`, JSON.stringify(nextList));
    }

    // Update local proposals cache
    if (data.proposal) {
      const proposals = await getProposals(userId);
      const nextProps = proposals.map(p => p.id === proposalId ? data.proposal : p);
      localStorage.setItem(`forge_proposals_${userId}`, JSON.stringify(nextProps));
    }

    return { success: true, workout: data.workout, proposal: data.proposal };
  } catch (err: any) {
    console.warn("Server executeProposal error:", err);
    return { success: false, error: err.message || 'Execution error' };
  }
}

export async function discardProposal(proposalId: string, userId: string): Promise<Proposal | null> {
  const proposals = await getProposals(userId);
  const proposal = proposals.find(p => p.id === proposalId);
  if (!proposal) return null;

  const discarded: Proposal = {
    ...proposal,
    status: 'DISCARDED',
    reviewedAt: new Date().toISOString()
  };

  if (!isGuestUserId(userId)) {
    try {
      await setDoc(doc(db, 'proposals', proposal.id), { ...discarded, userId });
    } catch (e) {}
  }

  const nextList = proposals.map(p => p.id === proposal.id ? discarded : p);
  localStorage.setItem(`forge_proposals_${userId}`, JSON.stringify(nextList));

  return discarded;
}

// ==========================================
// MUTATION AUDIT LOGS & REVERSIBLE UNDO
// ==========================================

export async function getMutationAuditLogs(
  userId: string,
  targetEntityId?: string
): Promise<MutationAuditLog[]> {
  let localLogs: MutationAuditLog[] = [];
  const local = localStorage.getItem(`forge_audit_logs_${userId}`);
  if (local) {
    try {
      const parsed = JSON.parse(local);
      localLogs = Array.isArray(parsed)
        ? parsed
            .filter((item) => isLocalEntityForUser(item, userId))
            .map((log) => ({
              ...log,
              storageScope: log.storageScope || 'LOCAL',
            }))
        : [];
    } catch {}
  }

  if (isGuestUserId(userId)) {
    const guestLogs = targetEntityId
      ? localLogs.filter((log) => log.targetEntityId === targetEntityId)
      : localLogs;
    return guestLogs.sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  let serverLogs: MutationAuditLog[] = [];
  try {
    let q = query(
      collection(db, 'mutation_audit_logs'),
      where('userId', '==', userId),
      orderBy('createdAt', 'desc')
    );
    if (targetEntityId) {
      q = query(
        collection(db, 'mutation_audit_logs'),
        where('userId', '==', userId),
        where('targetEntityId', '==', targetEntityId),
        orderBy('createdAt', 'desc')
      );
    }
    const snap = await getDocs(q);
    serverLogs = snap.docs.map((item) => ({
      id: item.id,
      ...item.data(),
      storageScope: 'SERVER',
    } as MutationAuditLog));
  } catch (e) {
    console.warn('Could not fetch audit logs from Firestore:', e);
  }

  const merged = new Map<string, MutationAuditLog>();
  for (const log of localLogs) {
    if (!targetEntityId || log.targetEntityId === targetEntityId) {
      merged.set(log.id, log);
    }
  }
  for (const log of serverLogs) {
    // Server truth wins if the same audit id exists in both places.
    merged.set(log.id, log);
  }

  return Array.from(merged.values()).sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

export function migrateLocalAuditHistory(
  sourceUserId: string,
  targetUserId: string
): number {
  let source: MutationAuditLog[] = [];
  let target: MutationAuditLog[] = [];

  try {
    const parsed = JSON.parse(localStorage.getItem(`forge_audit_logs_${sourceUserId}`) || '[]');
    source = Array.isArray(parsed)
      ? parsed.filter((item) => isLocalEntityForUser(item, sourceUserId)) as MutationAuditLog[]
      : [];
  } catch {}
  try {
    const parsed = JSON.parse(localStorage.getItem(`forge_audit_logs_${targetUserId}`) || '[]');
    target = Array.isArray(parsed)
      ? parsed.filter((item) => isLocalEntityForUser(item, targetUserId)) as MutationAuditLog[]
      : [];
  } catch {}

  const merged = new Map<string, MutationAuditLog>();
  for (const log of target) merged.set(log.id, log);
  for (const log of source) {
    merged.set(log.id, {
      ...log,
      userId: targetUserId,
      storageScope: 'LOCAL_MIGRATED',
    });
  }

  localStorage.setItem(
    `forge_audit_logs_${targetUserId}`,
    JSON.stringify(Array.from(merged.values()))
  );
  return source.length;
}

export async function recordMutationAuditLog(log: MutationAuditLog): Promise<void> {
  // Cloud audit remains server-authoritative; this cache is only a local mirror / Guest truth.
  await appendLocalAuditLog(log);
}

export async function undoMutation(
  auditLogId: string,
  userId: string
): Promise<{ success: boolean; workout?: Workout; deleted?: boolean; id?: string; error?: string }> {
  const logs = await getMutationAuditLogs(userId);
  const log = logs.find((item) => item.id === auditLogId);
  if (!log) return { success: false, error: 'Audit log entry not found' };

  if (!isGuestUserId(userId) && log.storageScope !== 'SERVER') {
    return {
      success: false,
      error: 'Preserved local Guest history is read-only after cloud sync'
    };
  }

  if (isGuestUserId(userId)) {
    try {
      const workouts = await getWorkouts(userId);
      const current = workouts.find((item) => item.id === log.targetEntityId);
      if (!current) return { success: false, error: 'Workout not found' };

      const decision = executeRollbackValidation(userId, current.id, current, log);
      const mutationId = crypto.randomUUID();

      if ('action' in decision && decision.action === 'DELETE') {
        localStorage.setItem(
          `forge_workouts_${userId}`,
          JSON.stringify(workouts.filter((item) => item.id !== current.id))
        );
        await appendLocalAuditLog({
          id: `audit_${crypto.randomUUID()}`,
          mutationId,
          userId,
          actor: 'USER',
          action: 'ROLLBACK_CREATION',
          mutationType: 'ROLLBACK_CREATION',
          targetEntityType: 'WORKOUT',
          targetEntityId: current.id,
          baseVersion: current.version,
          resultVersion: 0,
          summary: `Rollback of workout creation: deleted workout "${current.title}"`,
          inverseDelta: workoutInverseDelta(current),
          createdAt: new Date().toISOString(),
        });
        return { success: true, deleted: true, id: current.id };
      }

      const restored = decision as Workout;
      await upsertAuthoritativeWorkoutCache(restored);
      await appendLocalAuditLog({
        id: `audit_${crypto.randomUUID()}`,
        mutationId,
        userId,
        actor: 'USER',
        action: 'ROLLBACK_UPDATE',
        mutationType: 'ROLLBACK_UPDATE',
        targetEntityType: 'WORKOUT',
        targetEntityId: current.id,
        baseVersion: current.version,
        resultVersion: restored.version,
        summary: `Rollback of mutation: restored state from v${log.baseVersion}`,
        inverseDelta: workoutInverseDelta(current),
        createdAt: new Date().toISOString(),
      });
      return { success: true, workout: restored };
    } catch (err: any) {
      return { success: false, error: err.message || 'Failed to rollback' };
    }
  }

  const token = await auth.currentUser?.getIdToken();
  if (!token) return { success: false, error: 'Not authenticated' };
  const mutationId = crypto.randomUUID();

  try {
    const res = await fetch(`/api/workouts/${log.targetEntityId}/rollback`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ auditLogId, mutationId })
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { success: false, error: data.error || 'Failed to undo mutation' };
    }

    if (data.workout?.userId) {
      await upsertAuthoritativeWorkoutCache(data.workout);
    }

    return {
      success: true,
      workout: data.workout,
      deleted: data.deleted,
      id: data.id
    };
  } catch (err: any) {
    console.warn('Server undoMutation error:', err);
    return { success: false, error: err.message || 'Failed to rollback' };
  }
}

// ==========================================
// THREADS & COPILOT CHATS
// ==========================================

export async function getThreads(userId: string): Promise<Thread[]> {
  if (!isGuestUserId(userId)) {
    try {
    const q = query(
      collection(db, 'threads'),
      where('userId', '==', userId),
      orderBy('updatedAt', 'desc')
    );
    const snap = await getDocs(q);
    if (!snap.empty) {
      return snap.docs.map(d => ({ id: d.id, ...d.data() } as Thread));
    }
  } catch (e) {
      console.warn("Could not fetch threads from Firestore:", e);
    }
  }

  const local = localStorage.getItem(`forge_threads_${userId}`);
  if (local) {
    try {
      return JSON.parse(local);
    } catch (e) {}
  }
  return [];
}

export async function createThread(userId: string, title: string, targetWorkoutId?: string): Promise<Thread> {
  const newThread: Thread = {
    id: crypto.randomUUID(),
    userId,
    title,
    status: 'ACTIVE',
    targetWorkoutId,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    messages: [
      {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: `Hi! I'm FORGE Brain, your AI fitness copilot. I can inspect your training logs, evaluate progressive overload, and formulate structured proposals for you to review and approve with Optimistic Concurrency Control (OCC). What would you like to work on?`,
        timestamp: new Date().toISOString()
      }
    ]
  };

  if (!isGuestUserId(userId)) {
    try {
      await setDoc(doc(db, 'threads', newThread.id), newThread);
    } catch (e) {}
  }

  const threads = await getThreads(userId);
  localStorage.setItem(`forge_threads_${userId}`, JSON.stringify([newThread, ...threads]));
  return newThread;
}

export async function saveThread(thread: Thread): Promise<void> {
  if (!isGuestUserId(thread.userId)) {
    try {
      await setDoc(doc(db, 'threads', thread.id), thread);
    } catch (e) {}
  }

  const threads = await getThreads(thread.userId);
  const updated = threads.some(t => t.id === thread.id)
    ? threads.map(t => t.id === thread.id ? thread : t)
    : [thread, ...threads];
  localStorage.setItem(`forge_threads_${thread.userId}`, JSON.stringify(updated));
}

export async function deleteThread(threadId: string, userId: string): Promise<void> {
  if (!isGuestUserId(userId)) {
    try {
      await deleteDoc(doc(db, 'threads', threadId));
    } catch (e) {
      console.warn("Firestore deleteThread failed, deleting locally:", e);
    }
  }

  const threads = await getThreads(userId);
  const updated = threads.filter(t => t.id !== threadId);
  localStorage.setItem(`forge_threads_${userId}`, JSON.stringify(updated));
}

export async function deleteAllThreads(userId: string): Promise<void> {
  if (!isGuestUserId(userId)) {
    const threads = await getThreads(userId);
    for (const thread of threads) {
      try {
        await deleteDoc(doc(db, 'threads', thread.id));
      } catch {}
    }
  }
  localStorage.removeItem(`forge_threads_${userId}`);
}

// ==========================================
// COMPATIBILITY & ANALYTICS EXPORTS
// ==========================================

export async function getRecentWorkouts(userId: string, limitCount: number = 10): Promise<any[]> {
  const workouts = await getWorkouts(userId);
  return workouts.slice(0, limitCount).map(w => ({
    ...w,
    name: w.title,
    startedAt: new Date(w.scheduledDate).getTime(),
    completedAt: new Date(w.scheduledDate).getTime() + 3600000,
    totalVolume: (w.sets || []).reduce((sum, s) => sum + (s.weight * s.reps), 0),
    exercises: (w.sets || []).map(s => ({
      id: s.id,
      exerciseId: s.exercise.toLowerCase().replace(/\s+/g, '-'),
      sets: [{ id: s.id, weight: s.weight, reps: s.reps, completed: true }]
    }))
  }));
}

export async function getBodyweight(userId: string): Promise<BodyweightEntry[]> {
  if (!isGuestUserId(userId)) {
    try {
      const q = query(collection(db, 'bodyweight'), where('userId', '==', userId), orderBy('date', 'desc'));
      const snap = await getDocs(q);
      if (!snap.empty) {
        return snap.docs.map(d => ({ id: d.id, ...d.data() } as BodyweightEntry));
      }
    } catch (e) {}
  }
  const local = localStorage.getItem(`forge_bw_${userId}`);
  if (!local) return [];
  try {
    const parsed = JSON.parse(local);
    return Array.isArray(parsed)
      ? parsed.filter((item) => isLocalEntityForUser(item, userId))
      : [];
  } catch {
    return [];
  }
}

export async function saveBodyweight(
  entry: BodyweightEntry,
  options: CloudPersistenceOptions = {}
): Promise<void> {
  if (!isGuestUserId(entry.userId)) {
    try {
      await setDoc(doc(db, 'bodyweight', entry.id), entry);
    } catch (e) {
      if (options.requireCloud) throw e;
    }
  }
  const all = await getBodyweight(entry.userId);
  localStorage.setItem(
    `forge_bw_${entry.userId}`,
    JSON.stringify([entry, ...all.filter((item) => item.id !== entry.id)])
  );
}

// ==========================================
// TARGET 1RM GOALS
// ==========================================

export async function getTarget1RMs(userId: string): Promise<Target1RM[]> {
  if (!isGuestUserId(userId)) {
    try {
      const q = query(
        collection(db, 'target_1rms'),
        where('userId', '==', userId)
      );
      const snap = await getDocs(q);
      if (!snap.empty) {
        return snap.docs.map(d => ({ id: d.id, ...d.data() } as Target1RM));
      }
    } catch (e) {
      console.warn("Could not fetch target_1rms from Firestore, reading local:", e);
    }
  }

  const local = localStorage.getItem(`forge_target_1rms_${userId}`);
  if (local) {
    try {
      const parsed = JSON.parse(local);
      return Array.isArray(parsed)
      ? parsed.filter((item) => isLocalEntityForUser(item, userId))
      : [];
    } catch {}
  }
  return [];
}

export async function saveTarget1RM(
  target: Target1RM,
  options: CloudPersistenceOptions = {}
): Promise<Target1RM> {
  const updated: Target1RM = {
    ...target,
    updatedAt: Date.now()
  };

  if (!isGuestUserId(updated.userId)) {
    try {
      await setDoc(doc(db, 'target_1rms', updated.id), updated);
    } catch (e) {
      if (options.requireCloud) throw e;
      console.warn("Could not save target 1RM to Firestore, saving locally:", e);
    }
  }

  const all = await getTarget1RMs(updated.userId);
  const exists = all.some(t => t.id === updated.id);
  const nextList = exists
    ? all.map(t => t.id === updated.id ? updated : t)
    : [updated, ...all];

  localStorage.setItem(`forge_target_1rms_${updated.userId}`, JSON.stringify(nextList));
  return updated;
}

export async function deleteTarget1RM(targetId: string, userId: string): Promise<void> {
  if (!isGuestUserId(userId)) {
    try {
      await deleteDoc(doc(db, 'target_1rms', targetId));
    } catch (e) {
      console.warn("Could not delete target 1RM from Firestore:", e);
    }
  }

  const all = await getTarget1RMs(userId);
  const nextList = all.filter(t => t.id !== targetId);
  localStorage.setItem(`forge_target_1rms_${userId}`, JSON.stringify(nextList));
}

export async function getPlans(userId: string): Promise<any[]> {
  if (!isGuestUserId(userId)) {
    try {
      const q = query(collection(db, 'plans'), where('userId', '==', userId));
      const snap = await getDocs(q);
      if (!snap.empty) return snap.docs.map(d => ({ id: d.id, ...d.data() }));
    } catch (e) {}
  }
  const local = localStorage.getItem(`forge_plans_${userId}`);
  if (!local) return [];
  try {
    const parsed = JSON.parse(local);
    return Array.isArray(parsed)
      ? parsed.filter((item) => isLocalEntityForUser(item, userId))
      : [];
  } catch {
    return [];
  }
}

export async function savePlan(
  plan: any,
  options: CloudPersistenceOptions = {}
): Promise<void> {
  if (!isGuestUserId(plan.userId)) {
    try {
      await setDoc(doc(db, 'plans', plan.id), plan);
    } catch (e) {
      if (options.requireCloud) throw e;
    }
  }
  const all = await getPlans(plan.userId);
  localStorage.setItem(`forge_plans_${plan.userId}`, JSON.stringify([plan, ...all.filter(p => p.id !== plan.id)]));
}

export async function deletePlan(planId: string, userId?: string): Promise<void> {
  if (!userId || !isGuestUserId(userId)) {
    try {
      await deleteDoc(doc(db, 'plans', planId));
    } catch (e) {
      console.warn("Could not delete plan from Firestore:", e);
    }
  }

  if (userId) {
    const all = await getPlans(userId);
    localStorage.setItem(`forge_plans_${userId}`, JSON.stringify(all.filter(p => p.id !== planId)));
  } else {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('forge_plans_')) {
        try {
          const list = JSON.parse(localStorage.getItem(key) || '[]');
          localStorage.setItem(key, JSON.stringify(list.filter((p: any) => p.id !== planId)));
        } catch (e) {}
      }
    }
  }
}

export async function getUserProfile(userId: string): Promise<UserProfile | null> {
  if (isGuestUserId(userId)) {
    const local = localStorage.getItem(guestProfileKey(userId));
    if (!local) return null;
    try {
      const parsed = JSON.parse(local) as Partial<UserProfile>;
      if (
        parsed &&
        typeof parsed === 'object' &&
        !Array.isArray(parsed) &&
        parsed.userId === userId &&
        typeof parsed.createdAt === 'number' &&
        Number.isFinite(parsed.createdAt)
      ) {
        return parsed as UserProfile;
      }
      return null;
    } catch {
      return null;
    }
  }

  try {
    const snap = await getDoc(doc(db, 'users', userId));
    if (snap.exists()) return snap.data() as UserProfile;
  } catch (e) {
    console.warn("Could not fetch user profile:", e);
  }
  return null;
}

export async function saveUserProfile(profile: UserProfile): Promise<void> {
  if (isGuestUserId(profile.userId)) {
    localStorage.setItem(guestProfileKey(profile.userId), JSON.stringify(profile));
    return;
  }

  await setDoc(doc(db, 'users', profile.userId), profile);
}

export async function getPersonalRecords(userId: string): Promise<PersonalRecord[]> {
  if (!isGuestUserId(userId)) {
    try {
      const q = query(collection(db, 'personal_records'), where('userId', '==', userId));
      const snap = await getDocs(q);
      if (!snap.empty) return snap.docs.map(d => ({ id: d.id, ...d.data() } as PersonalRecord));
    } catch (e) {
      console.warn("Could not fetch personal records:", e);
    }
  }

  const local = localStorage.getItem(`forge_prs_${userId}`);
  if (!local) return [];
  try {
    const parsed = JSON.parse(local);
    return Array.isArray(parsed)
      ? parsed.filter((item) => isLocalEntityForUser(item, userId))
      : [];
  } catch {
    return [];
  }
}

export async function getPreviousPerformance(userId: string, exerciseId: string): Promise<any | null> {
  const workouts = await getRecentWorkouts(userId, 30);
  const normId = exerciseId.toLowerCase().replace(/[-_\s]+/g, '');

  for (const w of workouts) {
    if (w.status !== 'COMPLETED' && w.status !== 'completed') continue;

    if (w.exercises && Array.isArray(w.exercises)) {
      const match = w.exercises.find((e: any) => {
        const eId = (e.exerciseId || '').toLowerCase().replace(/[-_\s]+/g, '');
        return eId === normId || eId.includes(normId) || normId.includes(eId);
      });
      if (match) return w;
    }

    if (w.sets && Array.isArray(w.sets)) {
      const match = w.sets.find((s: any) => {
        const sEx = (s.exercise || '').toLowerCase().replace(/[-_\s]+/g, '');
        return sEx === normId || sEx.includes(normId) || normId.includes(sEx);
      });
      if (match) return w;
    }
  }
  return null;
}

export async function savePersonalRecord(
  record: PersonalRecord,
  options: CloudPersistenceOptions = {}
): Promise<void> {
  if (!isGuestUserId(record.userId)) {
    try {
      await setDoc(doc(db, 'personal_records', record.id), record);
    } catch (e) {
      if (options.requireCloud) throw e;
      console.warn("Could not save personal record:", e);
    }
  }

  const all = await getPersonalRecords(record.userId);
  const next = [record, ...all.filter((item) => item.id !== record.id)];
  localStorage.setItem(`forge_prs_${record.userId}`, JSON.stringify(next));
}

// ==========================================
// SEED INITIAL DEMO DATA
// ==========================================

export async function seedForgeData(userId: string): Promise<void> {
  // Prevent destructive clobbering:
  // 1. If user already has a seeded flag in localStorage, never re-seed
  if (typeof window !== 'undefined' && localStorage.getItem(`forge_seeded_${userId}`) === 'true') {
    return;
  }

  // 2. If user already has existing workouts in Firestore or local cache, mark as seeded and do not overwrite
  const existingWorkouts = await getWorkouts(userId);
  if (existingWorkouts && existingWorkouts.length > 0) {
    if (typeof window !== 'undefined') {
      localStorage.setItem(`forge_seeded_${userId}`, 'true');
    }
    return;
  }

  const today = new Date();
  const dateStr = today.toISOString().split('T')[0];
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = tomorrow.toISOString().split('T')[0];
  const nextDay = new Date(today);
  nextDay.setDate(nextDay.getDate() + 3);
  const nextDayStr = nextDay.toISOString().split('T')[0];

  const initialWorkouts: Workout[] = [
    {
      id: `w_upper_${userId}`,
      userId,
      title: 'Upper Body Power & Hypertrophy',
      scheduledDate: dateStr,
      status: 'PLANNED',
      version: 1,
      exercises: [],
      sets: [
        { id: 's1', exercise: 'Barbell Bench Press', reps: 8, weight: 80, completed: false },
        { id: 's2', exercise: 'Barbell Bench Press', reps: 8, weight: 80, completed: false },
        { id: 's3', exercise: 'Barbell Bench Press', reps: 8, weight: 80, completed: false },
        { id: 's4', exercise: 'Incline Dumbbell Press', reps: 10, weight: 28, completed: false },
        { id: 's5', exercise: 'Incline Dumbbell Press', reps: 10, weight: 28, completed: false },
        { id: 's6', exercise: 'Lat Pulldown', reps: 10, weight: 65, completed: false },
        { id: 's7', exercise: 'Lat Pulldown', reps: 10, weight: 65, completed: false },
        { id: 's8', exercise: 'Lateral Raises', reps: 15, weight: 12, completed: false },
        { id: 's9', exercise: 'Tricep Rope Pushdown', reps: 12, weight: 25, completed: false }
      ],
      updatedAt: new Date().toISOString()
    },
    {
      id: `w_lower_${userId}`,
      userId,
      title: 'Lower Body Strength & Quads',
      scheduledDate: tomorrowStr,
      status: 'PLANNED',
      version: 1,
      exercises: [],
      sets: [
        { id: 'l1', exercise: 'Barbell Squat', reps: 6, weight: 110, completed: false },
        { id: 'l2', exercise: 'Barbell Squat', reps: 6, weight: 110, completed: false },
        { id: 'l3', exercise: 'Barbell Squat', reps: 6, weight: 110, completed: false },
        { id: 'l4', exercise: 'Romanian Deadlift', reps: 8, weight: 95, completed: false },
        { id: 'l5', exercise: 'Romanian Deadlift', reps: 8, weight: 95, completed: false },
        { id: 'l6', exercise: 'Leg Press', reps: 12, weight: 160, completed: false },
        { id: 'l7', exercise: 'Standing Calf Raise', reps: 15, weight: 60, completed: false }
      ],
      updatedAt: new Date().toISOString()
    },
    {
      id: `w_pull_${userId}`,
      userId,
      title: 'Pull & Posterior Chain',
      scheduledDate: nextDayStr,
      status: 'PLANNED',
      version: 1,
      exercises: [],
      sets: [
        { id: 'p1', exercise: 'Deadlift', reps: 5, weight: 140, completed: false },
        { id: 'p2', exercise: 'Deadlift', reps: 5, weight: 140, completed: false },
        { id: 'p3', exercise: 'Lat Pulldown', reps: 10, weight: 65, completed: false },
        { id: 'p4', exercise: 'Seated Cable Row', reps: 10, weight: 60, completed: false },
        { id: 'p5', exercise: 'Incline Dumbbell Curl', reps: 12, weight: 14, completed: false },
        { id: 'p6', exercise: 'Face Pulls', reps: 15, weight: 20, completed: false }
      ],
      updatedAt: new Date().toISOString()
    }
  ];

  for (const w of initialWorkouts) {
    try {
      const snap = await getDoc(doc(db, 'workouts', w.id));
      if (!snap.exists()) {
        await saveWorkout(w, 'SYSTEM_AUTONOMOUS', 'Initial sample workout seed');
      }
    } catch (e) {
      console.warn("Could not seed workout via server API:", e);
    }
  }

  // Safe localStorage update: preserve existing workouts, never clobber
  if (typeof window !== 'undefined') {
    const localExisting = localStorage.getItem(`forge_workouts_${userId}`);
    let currentLocalWorkouts: Workout[] = [];
    if (localExisting) {
      try {
        currentLocalWorkouts = JSON.parse(localExisting);
      } catch (e) {}
    }
    const mergedWorkouts = [
      ...currentLocalWorkouts,
      ...initialWorkouts.filter(iw => !currentLocalWorkouts.some(cw => cw.id === iw.id))
    ];
    localStorage.setItem(`forge_workouts_${userId}`, JSON.stringify(mergedWorkouts));
  }

  // Seed default thread & proposal safely
  const threadId = `th_seed_${userId}`;
  const seedProposal: Proposal = {
    id: `prop_seed_${userId}`,
    threadId,
    targetEntityType: 'WORKOUT',
    targetEntityId: initialWorkouts[0].id,
    baseVersion: 1,
    status: 'PENDING_APPROVAL',
    summary: 'Progressive Overload: +2.5kg on Bench Press (80kg -> 82.5kg) & +1 set on Lateral Raises for shoulder volume ramp',
    beforeState: {
      title: initialWorkouts[0].title,
      scheduledDate: initialWorkouts[0].scheduledDate,
      status: initialWorkouts[0].status,
      sets: initialWorkouts[0].sets
    },
    afterState: {
      title: initialWorkouts[0].title,
      scheduledDate: initialWorkouts[0].scheduledDate,
      status: initialWorkouts[0].status,
      sets: [
        { id: 's1', exercise: 'Barbell Bench Press', reps: 8, weight: 82.5, completed: false },
        { id: 's2', exercise: 'Barbell Bench Press', reps: 8, weight: 82.5, completed: false },
        { id: 's3', exercise: 'Barbell Bench Press', reps: 8, weight: 82.5, completed: false },
        { id: 's4', exercise: 'Incline Dumbbell Press', reps: 10, weight: 28, completed: false },
        { id: 's5', exercise: 'Incline Dumbbell Press', reps: 10, weight: 28, completed: false },
        { id: 's6', exercise: 'Lat Pulldown', reps: 10, weight: 65, completed: false },
        { id: 's7', exercise: 'Lat Pulldown', reps: 10, weight: 65, completed: false },
        { id: 's8', exercise: 'Lateral Raises', reps: 15, weight: 12, completed: false },
        { id: 's8_b', exercise: 'Lateral Raises', reps: 15, weight: 12, completed: false },
        { id: 's9', exercise: 'Tricep Rope Pushdown', reps: 12, weight: 25, completed: false }
      ]
    },
    createdAt: new Date().toISOString()
  };

  try {
    const propSnap = await getDoc(doc(db, 'proposals', seedProposal.id));
    if (!propSnap.exists()) {
      await setDoc(doc(db, 'proposals', seedProposal.id), { ...seedProposal, userId });
    }
  } catch (e) {
    console.warn("Could not seed proposal to Firestore:", e);
  }
  if (typeof window !== 'undefined') {
    const existingProps = await getProposals(userId);
    if (!existingProps.some(p => p.id === seedProposal.id)) {
      localStorage.setItem(`forge_proposals_${userId}`, JSON.stringify([seedProposal, ...existingProps]));
    }
  }

  const seedThread: Thread = {
    id: threadId,
    userId,
    title: 'Upper Body Progressive Overload Audit',
    status: 'ACTIVE',
    targetWorkoutId: initialWorkouts[0].id,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    messages: [
      {
        id: 'm1',
        role: 'user',
        content: 'Can you analyze my upper body workout and recommend progressive overload adjustments?',
        timestamp: new Date(Date.now() - 300000).toISOString()
      },
      {
        id: 'm2',
        role: 'assistant',
        content: 'I reviewed your Upper Body session. You completed all 3 sets of 8 reps at 80kg on Bench Press comfortably last session. Based on your current recovery profile, I propose increasing Bench Press to 82.5kg (+2.5kg overload) and adding a 2nd hypertrophy set of Lateral Raises. Review the proposed diff below:',
        timestamp: new Date().toISOString(),
        proposalId: seedProposal.id,
        proposal: seedProposal
      }
    ]
  };

  try {
    const threadSnap = await getDoc(doc(db, 'threads', seedThread.id));
    if (!threadSnap.exists()) {
      await setDoc(doc(db, 'threads', seedThread.id), seedThread);
    }
  } catch (e) {
    console.warn("Could not seed thread to Firestore:", e);
  }
  if (typeof window !== 'undefined') {
    const existingThreads = await getThreads(userId);
    if (!existingThreads.some(t => t.id === seedThread.id)) {
      localStorage.setItem(`forge_threads_${userId}`, JSON.stringify([seedThread, ...existingThreads]));
    }
  }

  // Seed User Permissions only if not already present
  try {
    const permSnap = await getDoc(doc(db, 'user_permissions', userId));
    if (!permSnap.exists()) {
      const permissions: UserPermissions = {
        userId,
        autonomyLevel: 'L2_GUIDED_AUTONOMY',
        permissionEpoch: 1
      };
      await setDoc(doc(db, 'user_permissions', userId), permissions);
    }
  } catch (e) {
    console.warn("Could not check/seed user permissions:", e);
  }

  if (typeof window !== 'undefined') {
    localStorage.setItem(`forge_seeded_${userId}`, 'true');
  }

  // Record initial seed mutation audit log
  await recordMutationAuditLog({
    id: `log_seed_${userId}`,
    mutationId: crypto.randomUUID(),
    userId,
    actor: 'SYSTEM_AUTONOMOUS',
    targetEntityType: 'WORKOUT',
    targetEntityId: initialWorkouts[0].id,
    baseVersion: 0,
    resultVersion: 1,
    summary: 'Initialized base workout routine (Upper Body Power & Hypertrophy)',
    inverseDelta: { deleted: true },
    createdAt: new Date().toISOString()
  });
}

export async function mutateWorkout(
  workoutId: string,
  baseVersion: number,
  updates: Partial<Workout>,
  options: WorkoutMutationOptions
): Promise<Workout> {
  if (isGuestSessionActive() && !options.forceCloud) {
    const identity = getOrCreateGuestIdentity();
    const workouts = await getWorkouts(identity.uid);
    const current = workouts.find((workout) => workout.id === workoutId);
    if (!current) {
      const err: any = new Error('Workout not found');
      err.status = 404;
      throw err;
    }
    if (current.version !== baseVersion) {
      throw new WorkoutConflictError(
        'Stale local version',
        current.version,
        current
      );
    }

    const authoritative: Workout = {
      ...current,
      ...updates,
      id: current.id,
      userId: identity.uid,
      version: current.version + 1,
      duration: options.duration ?? updates.duration ?? current.duration,
      volume: options.volume ?? updates.volume ?? current.volume,
      totalVolume: options.volume ?? updates.totalVolume ?? current.totalVolume,
      updatedAt: new Date().toISOString(),
    };
    await upsertAuthoritativeWorkoutCache(authoritative);
    await appendLocalAuditLog({
      id: `audit_${crypto.randomUUID()}`,
      mutationId: options.mutationId,
      userId: identity.uid,
      actor: 'USER',
      action: 'UPDATE',
      mutationType: 'UPDATE_WORKOUT',
      targetEntityType: 'WORKOUT',
      targetEntityId: current.id,
      baseVersion: current.version,
      resultVersion: authoritative.version,
      summary: updates.status === 'COMPLETED' || updates.status === 'completed'
        ? `Completed workout "${authoritative.title}"`
        : `Updated workout "${authoritative.title}"`,
      inverseDelta: workoutInverseDelta(current),
      createdAt: new Date().toISOString(),
    });
    return authoritative;
  }

  const token = await auth.currentUser?.getIdToken();
  if (!token) throw new Error('Not authenticated');

  const res = await fetch(`/api/workouts/${workoutId}/mutate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({
      baseVersion,
      updates,
      duration: options.duration,
      volume: options.volume,
      mutationId: options.mutationId
    })
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 409) {
      throw new WorkoutConflictError(
        data.error || 'Stale version',
        data.currentVersion,
        data.workout
      );
    }
    const err: any = new Error(data.error || 'Failed to mutate workout');
    err.status = res.status;
    throw err;
  }

  const authoritative: Workout = data.workout;
  await upsertAuthoritativeWorkoutCache(authoritative);
  return authoritative;
}



function migrationWorkoutShape(workout: Workout) {
  return {
    title: workout.title,
    scheduledDate: workout.scheduledDate,
    status: workout.status,
    sets: workout.sets || [],
    exercises: workout.exercises || [],
    exerciseNotes: workout.exerciseNotes || {},
    totalVolume: workout.totalVolume,
    completedAt: workout.completedAt,
    startedAt: workout.startedAt,
    duration: workout.duration,
    volume: workout.volume,
  };
}

export async function upsertWorkoutForCloudMigration(
  workout: Workout,
  targetUserId: string,
  sourceGuestUserId: string
): Promise<Workout> {
  const desired = { ...workout, userId: targetUserId };
  const createMissingWorkout = () => saveWorkout(
    desired,
    'USER',
    'Migrated from local guest account',
    {
      mutationId: `guest-migration:create:${sourceGuestUserId}:${targetUserId}:${workout.id}:v${workout.version}`,
    }
  );
  const existing = await getWorkout(workout.id, targetUserId);

  if (!existing) {
    return createMissingWorkout();
  }

  try {
    return await mutateWorkout(
      existing.id,
      existing.version,
      {
        title: desired.title,
        scheduledDate: desired.scheduledDate,
        status: desired.status,
        sets: desired.sets,
        exercises: desired.exercises,
        exerciseNotes: desired.exerciseNotes,
        totalVolume: desired.totalVolume,
        completedAt: desired.completedAt,
        startedAt: desired.startedAt,
      },
      {
        mutationId: `guest-migration:update:${sourceGuestUserId}:${targetUserId}:${workout.id}:cloudv${existing.version}:guestv${workout.version}`,
        forceCloud: true,
        duration: desired.duration,
        volume: desired.volume ?? desired.totalVolume,
      }
    );
  } catch (error: any) {
    if (error?.status !== 404) throw error;
    return createMissingWorkout();
  }
}

export interface CloudMigrationExpectation {
  workoutIds: string[];
  planIds: string[];
  bodyweightIds: string[];
  personalRecordIds: string[];
  targetIds: string[];
  requireCompletedProfile: boolean;
  autonomyLevel: AutonomyLevel;
}

export async function verifyCloudMigration(
  userId: string,
  expected: CloudMigrationExpectation
): Promise<void> {
  const requireIds = (label: string, expectedIds: string[], actualIds: string[]) => {
    const actual = new Set(actualIds);
    const missing = expectedIds.filter((id) => !actual.has(id));
    if (missing.length > 0) {
      throw new Error(`${label} cloud verification failed: missing ${missing.join(', ')}`);
    }
  };

  const [
    profileSnap,
    permissionsSnap,
    workoutSnap,
    planSnap,
    bodyweightSnap,
    personalRecordSnap,
    targetSnap,
  ] = await Promise.all([
    getDoc(doc(db, 'users', userId)),
    getDoc(doc(db, 'user_permissions', userId)),
    getDocs(query(collection(db, 'workouts'), where('userId', '==', userId))),
    getDocs(query(collection(db, 'plans'), where('userId', '==', userId))),
    getDocs(query(collection(db, 'bodyweight'), where('userId', '==', userId))),
    getDocs(query(collection(db, 'personal_records'), where('userId', '==', userId))),
    getDocs(query(collection(db, 'target_1rms'), where('userId', '==', userId))),
  ]);

  if (expected.requireCompletedProfile) {
    if (!profileSnap.exists() || !Boolean(profileSnap.data()?.onboardingCompleted)) {
      throw new Error('profile cloud verification failed');
    }
  }

  if (!permissionsSnap.exists() || permissionsSnap.data()?.autonomyLevel !== expected.autonomyLevel) {
    throw new Error('permissions cloud verification failed');
  }

  requireIds('workout', expected.workoutIds, workoutSnap.docs.map((item) => item.id));
  requireIds('plan', expected.planIds, planSnap.docs.map((item) => item.id));
  requireIds('bodyweight', expected.bodyweightIds, bodyweightSnap.docs.map((item) => item.id));
  requireIds('personal record', expected.personalRecordIds, personalRecordSnap.docs.map((item) => item.id));
  requireIds('target', expected.targetIds, targetSnap.docs.map((item) => item.id));
}
