import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { PlanExerciseInputSchema } from '../domain/mutations';
import { ApiError, documentId, versionInput, versionOf, own, digest, replay } from './security';

export const planInput = z.object({
  name: z.string().trim().min(1).max(100),
  weeklyFrequency: z.number().int().min(1).max(7),
  isActive: z.boolean(),
  goal: z.string().max(500).optional(),
  days: z.array(z.object({ id: documentId, name: z.string().trim().min(1).max(60), exercises: z.array(PlanExerciseInputSchema).max(100) }).strict()).max(7),
}).strict();

export async function changePlan(db: any, uid: string, operation: 'CREATE_PLAN' | 'UPDATE_PLAN' | 'DELETE_PLAN', input: any) {
  const id = documentId.parse(input.id);
  const mutationId = z.string().uuid().parse(input.mutationId);
  const baseVersion = operation === 'CREATE_PLAN' ? null : versionInput.parse(input.baseVersion);
  const plan = operation === 'DELETE_PLAN' ? null : planInput.parse(input.plan);
  const intent = JSON.parse(JSON.stringify({ operation, uid, id, baseVersion, plan }));
  const hash = digest({ schemaVersion: 2, ...intent });
  const ref = db.collection('plans').doc(id);
  const replayRef = db.collection('mutation_ids').doc(mutationId);
  const auditRef = db.collection('mutation_audit_logs').doc(randomUUID());
  return db.runTransaction(async (tx: any) => {
    const saved = await tx.get(replayRef);
    const prior = replay(saved.exists ? saved.data() : null, uid, operation, hash);
    if (prior) return prior;
    const snap = await tx.get(ref);
    if (snap.exists) own(snap.data(), uid);
    if (operation === 'CREATE_PLAN' && snap.exists) throw new ApiError(409, 'Plan already exists');
    if (operation !== 'CREATE_PLAN' && !snap.exists) throw new ApiError(404, 'Plan not found');
    const current = snap.exists ? versionOf(snap.data()) : 0;
    if (baseVersion !== null && baseVersion !== current) throw new ApiError(409, 'Plan changed; reconcile before retrying');
    const now = new Date().toISOString();
    const after = operation === 'DELETE_PLAN' ? null : { ...plan, id, userId: uid, version: current + 1, createdAt: snap.exists ? snap.data().createdAt ?? now : now, updatedAt: now };
    if (after) tx.set(ref, JSON.parse(JSON.stringify(after))); else tx.delete(ref);
    const result = { success: true, plan: after };
    tx.set(auditRef, { id: auditRef.id, schemaVersion: 2, mutationId, userId: uid, actor: 'USER', targetEntityType: 'PLAN', targetEntityId: id, baseVersion: current, resultVersion: current + 1, beforeState: snap.exists ? snap.data() : null, afterState: after, createdAt: now });
    tx.set(replayRef, { schemaVersion: 2, mutationId, userId: uid, operation, targetId: id, payloadHash: hash, result, createdAt: now });
    return result;
  });
}
