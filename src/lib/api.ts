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
import { useAuthStore } from '../store/useAuthStore';
import { adaptLegacyWorkouts, type TrainingSessionReadResult } from '../domain/canonical/adapters/workout';

async function securedRequest(path: string, method: string, body: any) {
  const user = useAuthStore.getState().user;
  const token = await user?.getIdToken?.();
  if (!token) throw new Error('Sign in required');
  const response = await fetch(path, { method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(body) });
  const data = await response.json();
  if (useAuthStore.getState().user?.uid !== user.uid) throw new Error('Account changed');
  if (!response.ok) throw new Error(data.error || 'Request failed');
  return data;
}
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

// ==========================================
// USER PERMISSIONS
// ==========================================

export async function getUserPermissions(userId: string): Promise<UserPermissions> {
  const snap = await getDoc(doc(db, 'user_permissions', userId));
  return snap.exists() ? snap.data() as UserPermissions : { userId, autonomyLevel: 'L0_READ_ONLY', permissionEpoch: 0 };
}
export async function updateUserPermissions(userId: string, autonomyLevel: AutonomyLevel): Promise<UserPermissions> {
  if (useAuthStore.getState().user?.uid !== userId) throw new Error('Account changed');
  return securedRequest('/api/permissions', 'PUT', { autonomyLevel });
}
// ==========================================
// WORKOUTS & OPTIMISTIC CONCURRENCY CONTROL (OCC)
// ==========================================

export async function getWorkouts(userId: string): Promise<Workout[]> {
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

  const local = localStorage.getItem(`forge_workouts_${userId}`);
  if (local) {
    try {
      return JSON.parse(local);
    } catch (e) {}
  }
  return [];
}

/** Opt-in canonical read. Callers must surface failures; legacy reads/writes stay unchanged. */
export async function getCanonicalTrainingSessions(userId: string): Promise<TrainingSessionReadResult> {
  return adaptLegacyWorkouts(await getWorkouts(userId), { userId });
}

export async function getWorkout(workoutId: string, userId: string): Promise<Workout | null> {
  try {
    const docRef = doc(db, 'workouts', workoutId);
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      return { id: snap.id, ...snap.data() } as Workout;
    }
  } catch (e) {
    console.warn("Could not fetch workout from Firestore:", e);
  }

  const list = await getWorkouts(userId);
  return list.find(w => w.id === workoutId) || null;
}

export async function saveWorkout(
  workout: Workout,
  actor: 'USER' | 'AI_BRAIN' | 'SYSTEM_AUTONOMOUS' = 'USER',
  summary: string = 'Created initial workout routine'
): Promise<Workout> {
  const token = (await auth.currentUser?.getIdToken()) || 'demo-token';
  const mutationId = crypto.randomUUID();

  // P0-2: Workouts must be created via the authoritative server API
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

  // Update localStorage cache
  if (created.userId) {
    const all = await getWorkouts(created.userId);
    const nextList = [created, ...all.filter(w => w.id !== created.id)];
    localStorage.setItem(`forge_workouts_${created.userId}`, JSON.stringify(nextList));
  }

  return created;
}

export async function deleteWorkout(
  workoutId: string, 
  userId: string,
  actor: 'USER' | 'AI_BRAIN' = 'USER'
): Promise<void> {
  const token = (await auth.currentUser?.getIdToken()) || 'demo-token';
  const mutationId = crypto.randomUUID();

  try {
    const res = await fetch(`/api/workouts/${workoutId}`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ mutationId })
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || 'Failed to delete workout');
    }
  } catch (e: any) {
    console.warn("Server deleteWorkout failed, attempting fallback:", e);
    if (!token || token === 'demo-token') {
      // Proceed with local deletion
    } else {
      throw e;
    }
  }

  // Remove from localStorage cache
  const all = await getWorkouts(userId);
  const nextList = all.filter(w => w.id !== workoutId);
  localStorage.setItem(`forge_workouts_${userId}`, JSON.stringify(nextList));
}

// ==========================================
// PROPOSALS MANAGEMENT & OCC EXECUTION
// ==========================================

export async function getProposals(userId: string): Promise<Proposal[]> {
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

  const local = localStorage.getItem(`forge_proposals_${userId}`);
  if (local) {
    try {
      return JSON.parse(local);
    } catch (e) {}
  }
  return [];
}

export async function createProposal(userId: string, proposal: Omit<Proposal, 'createdAt'>): Promise<Proposal> {
  if (useAuthStore.getState().user?.uid !== userId) throw new Error('Account changed');
  const result = await securedRequest('/api/proposals', 'POST', proposal);
  return result.proposal;
}
export async function executeProposal(
  proposalId: string, 
  userId: string,
  actor: 'USER' | 'AI_BRAIN' | 'SYSTEM_AUTONOMOUS' = 'USER',
  contentHash?: string
): Promise<{ success: boolean; workout?: Workout; proposal?: Proposal; error?: string }> {
  if (!contentHash) return { success: false, error: 'Regenerate this legacy proposal' };
  const token = await useAuthStore.getState().user?.getIdToken?.();
  const mutationKey = `forge_proposal_mutation_${userId}_${proposalId}_${contentHash}`;
  const mutationId = sessionStorage.getItem(mutationKey) || crypto.randomUUID();
  sessionStorage.setItem(mutationKey, mutationId);

  try {
    const res = await fetch(`/api/proposals/${proposalId}/execute`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ mutationId, contentHash })
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return {
        success: false,
        error: data.error || 'Failed to execute proposal'
      };
    }

    sessionStorage.removeItem(mutationKey);

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
  const proposal = (await getProposals(userId)).find(p => p.id === proposalId);
  if (!proposal?.contentHash) throw new Error('Legacy proposal: regenerate required');
  const result = await securedRequest(`/api/proposals/${proposalId}/discard`, 'POST', { mutationId: crypto.randomUUID(), contentHash: proposal.contentHash });
  return result.proposal;
}
// ==========================================
// MUTATION AUDIT LOGS & REVERSIBLE UNDO
// ==========================================

export async function getMutationAuditLogs(userId: string, targetEntityId?: string): Promise<MutationAuditLog[]> {
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
    if (!snap.empty) {
      return snap.docs.map(d => ({ id: d.id, ...d.data() } as MutationAuditLog));
    }
  } catch (e) {
    console.warn("Could not fetch audit logs from Firestore:", e);
  }

  const local = localStorage.getItem(`forge_audit_logs_${userId}`);
  if (local) {
    try {
      const parsed: MutationAuditLog[] = JSON.parse(local);
      if (targetEntityId) {
        return parsed.filter(l => l.targetEntityId === targetEntityId);
      }
      return parsed;
    } catch (e) {}
  }
  return [];
}

export async function recordMutationAuditLog(log: MutationAuditLog): Promise<void> {
  // P0-1: mutation_audit_logs is strictly server-authoritative. Direct client Firestore writes are denied.
  if (log.userId) {
    const list = await getMutationAuditLogs(log.userId);
    const updated = [log, ...list.filter(l => l.id !== log.id)];
    localStorage.setItem(`forge_audit_logs_${log.userId}`, JSON.stringify(updated));
  }
}

export async function undoMutation(
  auditLogId: string, 
  userId: string
): Promise<{ success: boolean; workout?: Workout; error?: string }> {
  const logs = await getMutationAuditLogs(userId);
  const log = logs.find(l => l.id === auditLogId);
  if (!log) return { success: false, error: "Audit log entry not found" };

  const token = (await auth.currentUser?.getIdToken()) || 'demo-token';
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

    if (data.workout && data.workout.userId) {
      const allWorkouts = await getWorkouts(data.workout.userId);
      localStorage.setItem(`forge_workouts_${data.workout.userId}`, JSON.stringify(
        allWorkouts.map(w => w.id === data.workout.id ? data.workout : w)
      ));
    }

    return { success: true, workout: data.workout };
  } catch (err: any) {
    console.warn("Server undoMutation error:", err);
    return { success: false, error: err.message || 'Failed to rollback' };
  }
}

// ==========================================
// THREADS & COPILOT CHATS
// ==========================================

export async function getThreads(userId: string): Promise<Thread[]> {
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

  try {
    await setDoc(doc(db, 'threads', newThread.id), newThread);
  } catch (e) {}

  const threads = await getThreads(userId);
  localStorage.setItem(`forge_threads_${userId}`, JSON.stringify([newThread, ...threads]));
  return newThread;
}

export async function saveThread(thread: Thread): Promise<void> {
  try {
    await setDoc(doc(db, 'threads', thread.id), thread);
  } catch (e) {}

  const threads = await getThreads(thread.userId);
  const updated = threads.some(t => t.id === thread.id)
    ? threads.map(t => t.id === thread.id ? thread : t)
    : [thread, ...threads];
  localStorage.setItem(`forge_threads_${thread.userId}`, JSON.stringify(updated));
}

export async function deleteThread(threadId: string, userId: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'threads', threadId));
  } catch (e) {
    console.warn("Firestore deleteThread failed, deleting locally:", e);
  }

  const threads = await getThreads(userId);
  const updated = threads.filter(t => t.id !== threadId);
  localStorage.setItem(`forge_threads_${userId}`, JSON.stringify(updated));
}

export async function deleteAllThreads(userId: string): Promise<void> {
  const threads = await getThreads(userId);
  for (const t of threads) {
    try {
      await deleteDoc(doc(db, 'threads', t.id));
    } catch (e) {}
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
  try {
    const q = query(collection(db, 'bodyweight'), where('userId', '==', userId), orderBy('date', 'desc'));
    const snap = await getDocs(q);
    if (!snap.empty) {
      return snap.docs.map(d => ({ id: d.id, ...d.data() } as BodyweightEntry));
    }
  } catch (e) {}
  const local = localStorage.getItem(`forge_bw_${userId}`);
  return local ? JSON.parse(local) : [
    { id: 'bw1', userId, weight: 78.5, date: Date.now() - 86400000 * 3 },
    { id: 'bw2', userId, weight: 78.2, date: Date.now() - 86400000 * 7 }
  ];
}

export async function saveBodyweight(entry: BodyweightEntry): Promise<void> {
  try {
    await setDoc(doc(db, 'bodyweight', entry.id), entry);
  } catch (e) {}
  const all = await getBodyweight(entry.userId);
  localStorage.setItem(`forge_bw_${entry.userId}`, JSON.stringify([entry, ...all]));
}

// ==========================================
// TARGET 1RM GOALS
// ==========================================

export async function getTarget1RMs(userId: string): Promise<Target1RM[]> {
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

  const local = localStorage.getItem(`forge_target_1rms_${userId}`);
  if (local) {
    try {
      return JSON.parse(local);
    } catch (e) {}
  }

  // Default seed target 1RMs for a motivating experience
  const defaultTargets: Target1RM[] = [
    {
      id: `target_bench_${userId}`,
      userId,
      exerciseId: 'bench_press',
      exerciseName: 'Bench Press',
      target1RM: 100,
      createdAt: Date.now() - 86400000 * 7,
      updatedAt: Date.now() - 86400000 * 7,
      notes: 'Road to 100kg (2 plates)'
    },
    {
      id: `target_squat_${userId}`,
      userId,
      exerciseId: 'squat',
      exerciseName: 'Squat',
      target1RM: 140,
      createdAt: Date.now() - 86400000 * 7,
      updatedAt: Date.now() - 86400000 * 7,
      notes: '3 plates milestone'
    },
    {
      id: `target_ohp_${userId}`,
      userId,
      exerciseId: 'overhead_press',
      exerciseName: 'Overhead Press',
      target1RM: 60,
      createdAt: Date.now() - 86400000 * 7,
      updatedAt: Date.now() - 86400000 * 7,
      notes: 'Bodyweight overhead press goal'
    }
  ];

  localStorage.setItem(`forge_target_1rms_${userId}`, JSON.stringify(defaultTargets));
  for (const t of defaultTargets) {
    try {
      await setDoc(doc(db, 'target_1rms', t.id), t);
    } catch (e) {}
  }
  return defaultTargets;
}

export async function saveTarget1RM(target: Target1RM): Promise<Target1RM> {
  const updated: Target1RM = {
    ...target,
    updatedAt: Date.now()
  };

  try {
    await setDoc(doc(db, 'target_1rms', updated.id), updated);
  } catch (e) {
    console.warn("Could not save target 1RM to Firestore, saving locally:", e);
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
  try {
    await deleteDoc(doc(db, 'target_1rms', targetId));
  } catch (e) {
    console.warn("Could not delete target 1RM from Firestore:", e);
  }

  const all = await getTarget1RMs(userId);
  const nextList = all.filter(t => t.id !== targetId);
  localStorage.setItem(`forge_target_1rms_${userId}`, JSON.stringify(nextList));
}

export async function getPlans(userId: string): Promise<any[]> {
  const snap = await getDocs(query(collection(db, 'plans'), where('userId', '==', userId)));
  return snap.docs.map(d => ({ ...d.data(), id: d.id, version: d.data().version ?? 0 }));
}
export async function savePlan(plan: any): Promise<void> {
  const { name, weeklyFrequency, isActive, days, goal } = plan;
  const creating = plan.version === undefined;
  await securedRequest(creating ? '/api/plans' : `/api/plans/${plan.id}`, creating ? 'POST' : 'PUT', {
    id: plan.id, baseVersion: plan.version, mutationId: crypto.randomUUID(), plan: { name, weeklyFrequency, isActive, days, ...(goal !== undefined ? { goal } : {}) }
  });
}
export async function deletePlan(planId: string, userId?: string, baseVersion?: number): Promise<void> {
  await securedRequest(`/api/plans/${planId}`, 'DELETE', { baseVersion, mutationId: crypto.randomUUID() });
}
export async function getUserProfile(userId: string): Promise<UserProfile | null> {
  try {
    const snap = await getDoc(doc(db, 'users', userId));
    if (snap.exists()) return snap.data() as UserProfile;
  } catch (e) {
    console.warn("Could not fetch user profile:", e);
  }
  return { userId, name: 'Athlete', experience: 'intermediate', createdAt: Date.now() };
}

export async function saveUserProfile(profile: UserProfile): Promise<void> {
  try {
    await setDoc(doc(db, 'users', profile.userId), profile);
  } catch (e) {
    console.warn("Could not save user profile:", e);
  }
}

export async function getPersonalRecords(userId: string): Promise<PersonalRecord[]> {
  try {
    const q = query(collection(db, 'personal_records'), where('userId', '==', userId));
    const snap = await getDocs(q);
    if (!snap.empty) return snap.docs.map(d => ({ id: d.id, ...d.data() } as PersonalRecord));
  } catch (e) {
    console.warn("Could not fetch personal records:", e);
  }
  return [];
}

export async function getPreviousPerformance(userId: string, exerciseId: string): Promise<any | null> {
  const workouts = await getRecentWorkouts(userId, 30);
  const normId = exerciseId.toLowerCase().replace(/[-_\s]+/g, '');
  
  for (const w of workouts) {
    if (w.status !== 'COMPLETED' && w.status !== 'completed') continue;

    // Check exercises array
    if (w.exercises && Array.isArray(w.exercises)) {
      const match = w.exercises.find((e: any) => {
        const eId = (e.exerciseId || '').toLowerCase().replace(/[-_\s]+/g, '');
        return eId === normId || eId.includes(normId) || normId.includes(eId);
      });
      if (match) return w;
    }

    // Check flat sets array
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

export async function savePersonalRecord(record: PersonalRecord): Promise<void> {
  try {
    await setDoc(doc(db, 'personal_records', record.id), record);
  } catch (e) {
    console.warn("Could not save personal record:", e);
  }
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

export async function mutateWorkout(workoutId: string, baseVersion: number, updates: Partial<Workout>, duration?: number, volume?: number): Promise<Workout> {
  const epoch = useAuthStore.getState().identityEpoch;
  const token = (await auth.currentUser?.getIdToken()) || 'demo-token';

  const res = await fetch(`/api/workouts/${workoutId}/mutate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({ 
      baseVersion, 
      updates, 
      duration, 
      volume,
      mutationId: crypto.randomUUID()
    })
  });

  const data = await res.json();
  if (useAuthStore.getState().identityEpoch !== epoch) throw new Error('Account changed');
  if (!res.ok) {
    if (res.status === 409) {
      const err: any = new Error(data.error || 'Stale version');
      err.status = 409;
      err.currentVersion = data.currentVersion;
      err.workout = data.workout;
      throw err;
    }
    throw new Error(data.error || 'Failed to mutate workout');
  }

  // Update localStorage cache
  if (data.workout && data.workout.userId) {
    const all = await getWorkouts(data.workout.userId);
    const exists = all.some(w => w.id === data.workout.id);
    const nextList = exists 
      ? all.map(w => w.id === data.workout.id ? data.workout : w)
      : [data.workout, ...all];
    localStorage.setItem(`forge_workouts_${data.workout.userId}`, JSON.stringify(nextList));
  }

  return data.workout;
}

