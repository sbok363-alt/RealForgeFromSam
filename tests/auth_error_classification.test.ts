import assert from 'node:assert/strict';
import { test } from 'node:test';
import { setAdminAuthForTesting, verifyToken } from '../server';

test('known Firebase credential failures produce 401 and do not expose verifier details', async () => {
  for (const code of ['auth/argument-error', 'auth/invalid-id-token', 'auth/id-token-expired', 'auth/id-token-revoked', 'auth/user-disabled']) {
    setAdminAuthForTesting({ verifyIdToken: async () => { throw Object.assign(new Error('private verifier details'), { code }); } });
    await assert.rejects(verifyToken('invalid'), (error: Error & { status?: number }) =>
      error.status === 401 && error.message === 'Invalid or expired ID token');
  }
});

test('valid identity, missing credentials and infrastructure failures retain their contracts', async () => {
  setAdminAuthForTesting({ verifyIdToken: async () => ({ uid: 'verified-user' }) });
  assert.equal(await verifyToken('valid'), 'verified-user');
  await assert.rejects(verifyToken(undefined), (error: Error & { status?: number }) => error.status === 401);
  const unavailable = Object.assign(new Error('Verifier unavailable'), { code: 'auth/internal-error' });
  setAdminAuthForTesting({ verifyIdToken: async () => { throw unavailable; } });
  await assert.rejects(verifyToken('token'), error => error === unavailable);
  setAdminAuthForTesting(null);
  await assert.rejects(verifyToken('token'), (error: Error & { status?: number }) => error.status === 503);
});
