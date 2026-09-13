import { z } from 'zod';
import { changePlan } from './plans';
import { createWorkoutProposal, reviewProposal, levels } from './proposals';
import { ApiError } from './security';

export function registerSecuredRoutes(app: any, getDb: () => any, verify: (token: string) => Promise<string>) {
  const route = (fn: (req: any, uid: string, db: any) => Promise<any>) => async (req: any, res: any) => {
    try {
      const token = req.headers.authorization?.match(/^Bearer (\S+)$/)?.[1];
      const uid = await verify(token);
      if (token === 'demo-token') throw new ApiError(403, 'Demo proposals are non-executable');
      const result = await fn(req, uid, getDb());
      return res.status(result?.conflict ? 409 : 200).json(result);
    } catch (error: any) {
      const status = error instanceof z.ZodError ? 400 : error.status || 503;
      return res.status(status).json({ error: status === 503 ? 'Service unavailable' : error instanceof z.ZodError ? 'Invalid request' : error.message });
    }
  };
  app.post('/api/plans', route((req, uid, db) => changePlan(db, uid, 'CREATE_PLAN', req.body)));
  app.put('/api/plans/:id', route((req, uid, db) => changePlan(db, uid, 'UPDATE_PLAN', { ...req.body, id: req.params.id })));
  app.delete('/api/plans/:id', route((req, uid, db) => changePlan(db, uid, 'DELETE_PLAN', { ...req.body, id: req.params.id })));
  app.post('/api/proposals', route(async (req, uid, db) => ({ proposal: await createWorkoutProposal(db, uid, req.body) })));
  app.post('/api/proposals/:id/execute', route((req, uid, db) => reviewProposal(db, uid, req.params.id, req.body)));
  app.post('/api/proposals/:id/discard', route((req, uid, db) => reviewProposal(db, uid, req.params.id, req.body, true)));
  app.put('/api/permissions', route(async (req, uid, db) => {
    const autonomyLevel = z.enum(levels).parse(req.body.autonomyLevel);
    return db.runTransaction(async (tx: any) => {
      const ref = db.collection('user_permissions').doc(uid);
      const snap = await tx.get(ref);
      const epoch = snap.exists ? snap.data().permissionEpoch : 0;
      if (!Number.isSafeInteger(epoch) || epoch < 0) throw new ApiError(409, 'Invalid stored permission epoch');
      const result = { userId: uid, autonomyLevel, permissionEpoch: epoch + 1 };
      tx.set(ref, result);
      return result;
    });
  }));
  app.post('/api/forge-apply-plan', route(async () => { throw new ApiError(410, 'Use the reviewed proposal workflow'); }));
}
