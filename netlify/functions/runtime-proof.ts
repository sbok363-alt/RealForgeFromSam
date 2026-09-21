/**
 * FORGE Phase 1 Runtime Proof Function (Netlify Serverless).
 *
 * Proves:
 * React/Vite client -> Netlify Function -> Firebase ID token verification -> Firebase Admin -> Firestore transaction
 *
 * Constraints:
 * - Operates strictly within dedicated 'runtime_proofs' collection.
 * - Never touches user training data, workouts, plans, or audit logs.
 * - Reversible transaction that cleans up proof documents.
 * - Zero secret or token exposure.
 */

import { Context } from '@netlify/functions';
import { verifyAuth } from './_shared/auth';
import { getAdminDb } from './_shared/firebase-admin';

export default async (req: Request, _context?: Context): Promise<Response> => {
  // 1. Method enforcement: POST only
  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ ok: false, error: 'METHOD_NOT_ALLOWED' }),
      {
        status: 405,
        headers: { 'Content-Type': 'application/json', Allow: 'POST' },
      }
    );
  }

  // 2. Authentication & tenant isolation
  let uid: string;
  try {
    const user = await verifyAuth(req);
    uid = user.uid;
  } catch (err: any) {
    const status = err.status || 401;
    return new Response(
      JSON.stringify({ ok: false, error: err.code || 'UNAUTHORIZED' }),
      { status, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // 3. Firestore transaction in isolated 'runtime_proofs' namespace
  try {
    const db = getAdminDb();
    const proofRef = db.collection('runtime_proofs').doc(uid);

    let priorCount = 0;
    await db.runTransaction(async (transaction: any) => {
      const doc = await transaction.get(proofRef);
      if (doc.exists) {
        priorCount = doc.data()?.proofCount || 0;
      }
      transaction.set(proofRef, {
        uid,
        proofCount: priorCount + 1,
        lastVerifiedAt: new Date().toISOString(),
        runtime: 'netlify-serverless-proof',
      });
    });

    // Clean up proof marker to ensure zero state residue in database
    await proofRef.delete();

    // 4. Return minimal success payload
    return new Response(
      JSON.stringify({
        ok: true,
        authenticated: true,
        firestore: true,
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({
        ok: false,
        authenticated: true,
        firestore: false,
        error: 'FIRESTORE_TRANSACTION_FAILED',
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
};
