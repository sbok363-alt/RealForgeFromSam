import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { validateWorkoutUpdates, validateCompleteWorkout } from '../lib/validation';
import { ApiError, canonical, clean, digest, documentId, own, replay, versionOf, versionInput } from './security';

export const levels = ['L0_READ_ONLY', 'L1_MICRO_ACTIONS', 'L2_GUIDED_AUTONOMY', 'L3_FULL_AUTONOMY'] as const;
export function permissions(value: any, uid: string) {
  if (!value || value.userId !== uid || !levels.includes(value.autonomyLevel) || !Number.isSafeInteger(value.permissionEpoch) || value.permissionEpoch < 1) return { userId: uid, autonomyLevel: levels[0], permissionEpoch: 0 };
  return { ...value, autonomyLevel: value.autonomyLevel === levels[3] ? levels[2] : value.autonomyLevel };
}
function numericInput(value: any) {
  if (!value || typeof value !== 'object') return;
  for (const [key, v] of Object.entries(value)) {
    if (['weight', 'reps', 'rir', 'rpe'].includes(key) && v !== null && (typeof v !== 'number' || !Number.isFinite(v))) throw new ApiError(400, 'Invalid numeric input');
    numericInput(v);
  }
}
function reviewState(workout: any) {
  return clean({ title: workout.title, scheduledDate: workout.scheduledDate, ...(workout.exercises?.length ? { exercises: workout.exercises } : { sets: workout.sets || [] }) });
}
export function candidateWorkout(current: any, patch: any) {
  canonical(patch);
  if (!patch || Array.isArray(patch) || Object.keys(patch).some(k => !['title', 'scheduledDate', 'sets', 'exercises'].includes(k))) throw new ApiError(400, 'Unsupported proposal change');
  const nested = !!current.exercises?.length;
  if ((nested && 'sets' in patch) || (!nested && 'exercises' in patch)) throw new ApiError(400, 'Proposal must match workout representation');
  numericInput(patch);
  const updates = validateWorkoutUpdates(patch);
  const result = validateCompleteWorkout({ ...current, ...updates });
  if (nested) result.sets = result.exercises.flatMap((e: any) => e.sets.map((s: any) => ({ ...s, exercise: e.exerciseId })));
  return clean(result);
}
function withoutWeights(value: any): any {
  if (Array.isArray(value)) return value.map(withoutWeights);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).filter(([k]) => !['weight', 'reps'].includes(k)).map(([k, v]) => [k, withoutWeights(v)]));
  return value;
}
function authorizePolicy(policy: any, before: any, after: any) {
  if (policy.autonomyLevel === levels[0]) throw new ApiError(403, 'AI is read-only at the current permission level');
  if (policy.autonomyLevel === levels[1] && canonical(withoutWeights(before)) !== canonical(withoutWeights(after))) throw new ApiError(403, 'This change requires guided autonomy');
}
function proposalHash(p: any) {
  return digest({ protocolVersion: 2, userId: p.userId, targetEntityType: p.targetEntityType, targetEntityId: p.targetEntityId, baseVersion: p.baseVersion, beforeState: p.beforeState, afterState: p.afterState, summary: p.summary, permissionEpoch: p.permissionEpoch });
}
export async function createWorkoutProposal(db: any, uid: string, input: any) {
  const target = documentId.parse(input.targetEntityId);
  const baseVersion = versionInput.parse(input.baseVersion);
  const summary = z.string().trim().min(1).max(2000).parse(input.summary);
  const id = randomUUID();
  return db.runTransaction(async (tx: any) => {
    const targetSnap = await tx.get(db.collection('workouts').doc(target));
    if (!targetSnap.exists) throw new ApiError(404, 'Workout not found');
    const current = targetSnap.data(); own(current, uid);
    const permissionSnap = await tx.get(db.collection('user_permissions').doc(uid));
    const policy = permissions(permissionSnap.exists ? permissionSnap.data() : null, uid);
    if (versionOf(current) !== baseVersion) throw new ApiError(409, 'Workout changed; regenerate recommendation');
    const candidate = candidateWorkout(current, input.afterState);
    const beforeState = reviewState(current), afterState = reviewState(candidate);
    authorizePolicy(policy, beforeState, afterState);
    const proposal: any = { id, userId: uid, threadId: typeof input.threadId === 'string' ? documentId.parse(input.threadId) : '', protocolVersion: 2, targetEntityType: 'WORKOUT', targetEntityId: target, baseVersion, beforeState, afterState, summary, permissionEpoch: policy.permissionEpoch, status: 'PENDING_APPROVAL', createdAt: new Date().toISOString() };
    proposal.contentHash = proposalHash(proposal);
    tx.create(db.collection('proposals').doc(id), proposal);
    return proposal;
  });
}
export async function reviewProposal(db: any, uid: string, rawId: string, input: any, discard = false) {
  const id = documentId.parse(rawId);
  const mutationId = z.string().uuid().parse(input.mutationId);
  const contentHash = z.string().regex(/^[a-f0-9]{64}$/).parse(input.contentHash);
  const operation = discard ? 'DISCARD_PROPOSAL' : 'EXECUTE_PROPOSAL';
  const hash = digest({ schemaVersion: 2, uid, operation, id, contentHash });
  const ref = db.collection('proposals').doc(id), replayRef = db.collection('mutation_ids').doc(mutationId);
  const auditRef = db.collection('mutation_audit_logs').doc(randomUUID());
  const result = await db.runTransaction(async (tx: any) => {
    const saved = await tx.get(replayRef);
    const previous = replay(saved.exists ? saved.data() : null, uid, operation, hash);
    if (previous) return previous;
    const snap = await tx.get(ref);
    if (!snap.exists) throw new ApiError(404, 'Proposal not found');
    const p = snap.data(); own(p, uid);
    if (p.protocolVersion !== 2) throw new ApiError(409, 'Regenerate this legacy proposal');
    if (p.contentHash !== contentHash || proposalHash(p) !== contentHash) throw new ApiError(409, 'Reviewed content changed');
    if (p.status !== 'PENDING_APPROVAL') throw new ApiError(409, 'Proposal is already terminal');
    const now = new Date().toISOString();
    let outcome: any;
    if (discard) {
      outcome = { success: true, proposal: { ...p, status: 'DISCARDED', reviewedAt: now } };
    } else {
      const permissionSnap = await tx.get(db.collection('user_permissions').doc(uid));
      const policy = permissions(permissionSnap.exists ? permissionSnap.data() : null, uid);
      if (policy.permissionEpoch !== p.permissionEpoch) throw new ApiError(403, 'Permissions changed; regenerate proposal');
      if (p.targetEntityType !== 'WORKOUT') throw new ApiError(400, 'Unsupported action');
      const targetRef = db.collection('workouts').doc(documentId.parse(p.targetEntityId));
      const targetSnap = await tx.get(targetRef);
      if (!targetSnap.exists) throw new ApiError(404, 'Workout not found');
      const current = targetSnap.data(); own(current, uid);
      if (versionOf(current) !== p.baseVersion) {
        const conflict = { success: false, conflict: true, error: 'Workout changed; regenerate proposal', proposal: { ...p, status: 'REJECTED_CONFLICT', reviewedAt: now } };
        tx.set(ref, conflict.proposal);
        return conflict;
      }
      const candidate = candidateWorkout(current, p.afterState);
      authorizePolicy(policy, reviewState(current), reviewState(candidate));
      const workout = { ...candidate, version: versionOf(current) + 1, updatedAt: now };
      outcome = { success: true, workout, proposal: { ...p, status: 'EXECUTED', reviewedAt: now } };
      tx.set(targetRef, workout);
      tx.create(auditRef, { id: auditRef.id, schemaVersion: 2, mutationId, userId: uid, actor: 'USER', targetEntityType: 'WORKOUT', targetEntityId: p.targetEntityId, baseVersion: p.baseVersion, resultVersion: workout.version, beforeState: current, afterState: workout, inverseDelta: current, summary: p.summary, createdAt: now });
    }
    tx.set(ref, outcome.proposal);
    tx.create(replayRef, { schemaVersion: 2, mutationId, operation, userId: uid, targetId: id, payloadHash: hash, result: outcome, createdAt: now });
    return outcome;
  });
  return result;
}
