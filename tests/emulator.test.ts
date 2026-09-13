import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { initializeApp as adminApp, deleteApp as deleteAdminApp } from 'firebase-admin/app';
import { getFirestore as adminFirestore } from 'firebase-admin/firestore';
import { getAuth as adminAuth } from 'firebase-admin/auth';
import { initializeApp, deleteApp } from 'firebase/app';
import { getAuth, connectAuthEmulator, signInAnonymously } from 'firebase/auth';
import { getFirestore, connectFirestoreEmulator, doc, getDoc, setDoc, deleteDoc, terminate } from 'firebase/firestore';
import { changePlan } from '../src/server/plans';
import { createWorkoutProposal, reviewProposal } from '../src/server/proposals';

for (const name of ['FIRESTORE_EMULATOR_HOST', 'FIREBASE_AUTH_EMULATOR_HOST']) {
  assert.match(process.env[name] || '', /^127\.0\.0\.1:\d+$/, `${name} must explicitly point to localhost; live fallback forbidden`);
}
const projectId = 'demo-forge-security';
// This suite runs in its own process; the server expects a default admin app.
const app = adminApp({ projectId });
const db = adminFirestore(app, 'forge-security');
const clients: any[] = [];
async function client(signedIn = true) {
  const app = initializeApp({ projectId, apiKey: 'fake-emulator-key', authDomain: 'localhost' }, randomUUID());
  const auth = getAuth(app);
  connectAuthEmulator(auth, `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}`, { disableWarnings: true });
  if (signedIn) await signInAnonymously(auth);
  const store = getFirestore(app, 'forge-security');
  const [host, port] = process.env.FIRESTORE_EMULATOR_HOST!.split(':');
  connectFirestoreEmulator(store, host, Number(port));
  const result = { app, auth, store, uid: auth.currentUser?.uid };
  clients.push(result); return result;
}
try {
  // firebase-tools 15.30 skips CLI rule loading for multi-database configs.
  // Load and verify the actual repository rules explicitly for BOTH local DBs.
  // The localhost guards above run before any request; live fallback is forbidden.
  const rules = readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8');
  for (const databaseId of ['(default)', 'forge-security']) {
    const rulesUrl = `http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${projectId}/databases/${databaseId}:securityRules`;
    const response = await fetch(rulesUrl, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rules: { files: [{ name: 'firestore.rules', content: rules }] } }),
    });
    assert.equal(response.ok, true, `Failed to install local rules: ${await response.text()}`);
    const loaded = await fetch(rulesUrl);
    assert.equal(loaded.ok, true, 'Could not verify loaded emulator rules');
    assert.equal((await loaded.json()).rules.files[0].content, rules, 'Emulator must use the unchanged repository rules');
  }
  const a = await client(), b = await client(), anonymous = await client(false);
  const uid = a.uid;
  const owned = { id: 'owned', userId: uid, name: 'Draft', weeklyFrequency: 3, isActive: false, days: [], version: 1 };
  await db.collection('plans').doc('owned').set(owned);
  assert.ok((await getDoc(doc(a.store, 'plans', 'owned'))).exists());
  for (const other of [b, anonymous]) await assert.rejects(getDoc(doc(other.store, 'plans', 'owned')), /permission/i);
  for (const collection of ['plans', 'proposals', 'workouts', 'mutation_ids', 'mutation_audit_logs', 'user_permissions']) {
    await assert.rejects(setDoc(doc(a.store, collection, 'forged'), { userId: uid, status: 'EXECUTED' }), /permission/i);
  }
  const input = { id: 'owned', baseVersion: 1, plan: { name: 'Changed', weeklyFrequency: 3, isActive: false, days: [] } };
  const outcomes = await Promise.allSettled([changePlan(db, uid, 'UPDATE_PLAN', { ...input, mutationId: randomUUID() }), changePlan(db, uid, 'UPDATE_PLAN', { ...input, mutationId: randomUUID() })]);
  assert.equal(outcomes.filter(r => r.status === 'fulfilled').length, 1, 'Only one concurrent replacement wins');
  assert.equal((await db.collection('plans').doc('owned').get()).data()!.version, 2);
  const replayInput = { id: `new-${randomUUID()}`, mutationId: randomUUID(), plan: input.plan };
  const creations = await Promise.all([changePlan(db, uid, 'CREATE_PLAN', replayInput), changePlan(db, uid, 'CREATE_PLAN', replayInput)]);
  assert.deepEqual(creations[0], creations[1]);
  const audits = await db.collection('mutation_audit_logs').where('mutationId', '==', replayInput.mutationId).get();
  assert.equal(audits.size, 1);
  // Fail after staging writes: actual Firestore transaction must commit nothing.
  const failedId = `failed-${randomUUID()}`;
  const failingDb = { collection: (n: string) => db.collection(n), runTransaction: (fn: any) => db.runTransaction(async tx => { await fn(tx); throw new Error('Injected failure after staging'); }) };
  await assert.rejects(changePlan(failingDb, uid, 'CREATE_PLAN', { ...replayInput, id: failedId, mutationId: randomUUID() }), /Injected/);
  assert.equal((await db.collection('plans').doc(failedId).get()).exists, false);
  await db.collection('user_permissions').doc(uid).set({ userId: uid, autonomyLevel: 'L2_GUIDED_AUTONOMY', permissionEpoch: 1 });
  await db.collection('workouts').doc('w').set({ id: 'w', userId: uid, title: 'Session', scheduledDate: '2026-09-13', version: 1, status: 'PLANNED', sets: [] });
  const p = await createWorkoutProposal(db, uid, { targetEntityId: 'w', baseVersion: 1, summary: 'Rename', afterState: { title: 'Renamed' } });
  const race = await Promise.allSettled([reviewProposal(db, uid, p.id, { mutationId: randomUUID(), contentHash: p.contentHash }), reviewProposal(db, uid, p.id, { mutationId: randomUUID(), contentHash: p.contentHash }, true)]);
  assert.equal(race.filter(r => r.status === 'fulfilled').length, 1, 'Execute/discard race produces one terminal result');
  const { createApiApp, setAdminDbForTesting, setAdminAuthForTesting } = await import('../server');
  setAdminDbForTesting(db); setAdminAuthForTesting(adminAuth(app));
  const http = createApiApp().listen(0, '127.0.0.1');
  await new Promise<void>(r => http.once('listening', r));
  try {
    const url = `http://127.0.0.1:${(http.address() as any).port}/api/plans/owned`;
    for (const token of ['', 'invalid']) {
      const response = await fetch(url, { method: 'PUT', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ ...input, mutationId: randomUUID() }) });
      assert.equal(response.status, 401);
    }
    const token = await b.auth.currentUser.getIdToken();
    const response = await fetch(url, { method: 'PUT', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ ...input, baseVersion: 2, mutationId: randomUUID() }) });
    assert.equal(response.status, 403);
  } finally { await new Promise<void>((r, reject) => http.close(e => e ? reject(e) : r())); }
  console.log('PASS named-database rules, token verification, cross-user denial, real contention, atomicity and approval race');
} finally {
  for (const c of clients) { await terminate(c.store); await deleteApp(c.app); }
  await db.terminate(); await deleteAdminApp(app);
}
