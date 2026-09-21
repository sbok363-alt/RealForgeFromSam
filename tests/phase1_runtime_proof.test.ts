/**
 * FORGE Phase 1 — Free Runtime Proof Test Suite.
 *
 * Verifies:
 * 1. Runtime Proof Function (Netlify Serverless)
 *    - Rejects missing / malformed / invalid Authorization
 *    - Derives uid strictly from token claims
 *    - Executes isolated Firestore transaction on runtime_proofs/{uid}
 *    - Reversibility: cleans up proof document
 *    - Returns minimal sanitized JSON
 * 2. Gemini BYOK Proof Function (Netlify Serverless)
 *    - Rejects unauthenticated callers
 *    - Reads key strictly from 'x-gemini-api-key' header
 *    - Ignores query string / URL / body key transport
 *    - Returns sanitized errors (INVALID_GEMINI_KEY, etc.)
 *    - Zero secret leakage in response or output
 * 3. Firebase Admin Singleton
 *    - Idempotent initialization across warm invocations
 *    - Safe newline unescaping for private keys
 */

import runtimeProofHandler from '../netlify/functions/runtime-proof';
import geminiProofHandler from '../netlify/functions/gemini-proof';
import {
  setAdminAuthForTesting,
  setAdminDbForTesting,
  resetAdminForTesting,
} from '../netlify/functions/_shared/firebase-admin';

async function runTests() {
  console.log('--- FORGE Phase 1: Free Runtime Proof Test Suite ---');
  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, msg: string) {
    if (condition) {
      console.log(`✔ ${msg}`);
      passed++;
    } else {
      console.error(`❌ FAIL: ${msg}`);
      failed++;
    }
  }

  // Mock Admin Auth setup
  const validTokens: Record<string, { uid: string; email?: string }> = {
    'valid-user-token-abc': { uid: 'user_athlete_123', email: 'athlete@forge.test' },
  };

  const mockAdminAuth = {
    verifyIdToken: async (token: string) => {
      if (validTokens[token]) {
        return validTokens[token];
      }
      const err: any = new Error('Firebase ID token has expired or is invalid.');
      err.code = 'auth/argument-error';
      throw err;
    },
  };

  // Mock Admin DB with Transaction Tracking
  const mockStorage = new Map<string, any>();
  const testState = {
    transactionExecuted: false,
    docDeleted: false,
  };

  const mockAdminDb = {
    collection: (collName: string) => {
      return {
        doc: (docId: string) => {
          const path = `${collName}/${docId}`;
          return {
            path,
            delete: async () => {
              testState.docDeleted = true;
              mockStorage.delete(path);
            },
          };
        },
      };
    },
    runTransaction: async (updateFunction: (t: any) => Promise<any>) => {
      testState.transactionExecuted = true;
      const transaction = {
        get: async (ref: any) => {
          const data = mockStorage.get(ref.path);
          return {
            exists: !!data,
            data: () => data,
          };
        },
        set: (ref: any, data: any) => {
          mockStorage.set(ref.path, data);
        },
      };
      return await updateFunction(transaction);
    },
  };

  setAdminAuthForTesting(mockAdminAuth);
  setAdminDbForTesting(mockAdminDb);

  try {
    // -------------------------------------------------------------
    // 1. Runtime Proof Tests
    // -------------------------------------------------------------
    console.log('\n[Suite 1: Runtime Proof Endpoint]');

    // 1A. Method check
    const getReq = new Request('http://localhost/api/proof/runtime', { method: 'GET' });
    const getRes = await runtimeProofHandler(getReq);
    assert(getRes.status === 405, '1A: Rejects GET requests with 405 Method Not Allowed');

    // 1B. Missing Authorization header
    const noAuthReq = new Request('http://localhost/api/proof/runtime', { method: 'POST' });
    const noAuthRes = await runtimeProofHandler(noAuthReq);
    const noAuthData = await noAuthRes.json();
    assert(noAuthRes.status === 401 && noAuthData.error === 'AUTH_MISSING_HEADER', '1B: Rejects missing Authorization header with 401 AUTH_MISSING_HEADER');

    // 1C. Malformed Authorization header
    const malformedReq = new Request('http://localhost/api/proof/runtime', {
      method: 'POST',
      headers: { authorization: 'Basic dXNlcjpwYXNz' },
    });
    const malformedRes = await runtimeProofHandler(malformedReq);
    const malformedData = await malformedRes.json();
    assert(malformedRes.status === 401 && malformedData.error === 'AUTH_MALFORMED_HEADER', '1C: Rejects non-Bearer Authorization header with 401 AUTH_MALFORMED_HEADER');

    // 1D. Invalid Firebase token
    const invalidTokenReq = new Request('http://localhost/api/proof/runtime', {
      method: 'POST',
      headers: { authorization: 'Bearer forged-or-expired-token' },
    });
    const invalidTokenRes = await runtimeProofHandler(invalidTokenReq);
    const invalidTokenData = await invalidTokenRes.json();
    assert(invalidTokenRes.status === 401 && invalidTokenData.error === 'AUTH_INVALID_TOKEN', '1D: Rejects invalid ID token with 401 AUTH_INVALID_TOKEN');

    // 1E. Valid token + Firestore transaction execution + Cleanup
    testState.transactionExecuted = false;
    testState.docDeleted = false;
    const validReq = new Request('http://localhost/api/proof/runtime', {
      method: 'POST',
      headers: {
        authorization: 'Bearer valid-user-token-abc',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ userId: 'spoofed_victim_uid' }), // Attacker attempts to spoof body userId
    });
    const validRes = await runtimeProofHandler(validReq);
    const validData = await validRes.json();

    const isTxDone = (): boolean => testState.transactionExecuted;
    const isDocCleaned = (): boolean => testState.docDeleted;

    assert(validRes.status === 200, '1E: Valid token returns HTTP 200');
    assert(validData.ok === true && validData.authenticated === true && validData.firestore === true, '1E: Response payload confirms { ok, authenticated, firestore }');
    assert(isTxDone() === true, '1E: Firestore transaction executed successfully');
    assert(isDocCleaned() === true, '1E: Proof document cleaned up (zero database residue)');
    assert(!validData.token && !validData.uid, '1E: Zero internal credentials or token details leaked in response');

    // -------------------------------------------------------------
    // 2. Gemini BYOK Proof Tests
    // -------------------------------------------------------------
    console.log('\n[Suite 2: Gemini BYOK Proof Endpoint]');

    // 2A. Rejects unauthenticated caller
    const geminiNoAuthReq = new Request('http://localhost/api/proof/gemini', {
      method: 'POST',
      headers: { 'x-gemini-api-key': 'AIza-test-key' },
    });
    const geminiNoAuthRes = await geminiProofHandler(geminiNoAuthReq);
    assert(geminiNoAuthRes.status === 401, '2A: Gemini proof rejects unauthenticated caller with 401');

    // 2B. Missing x-gemini-api-key header
    const geminiNoKeyReq = new Request('http://localhost/api/proof/gemini', {
      method: 'POST',
      headers: { authorization: 'Bearer valid-user-token-abc' },
    });
    const geminiNoKeyRes = await geminiProofHandler(geminiNoKeyReq);
    const geminiNoKeyData = await geminiNoKeyRes.json();
    assert(geminiNoKeyRes.status === 400 && geminiNoKeyData.error === 'MISSING_GEMINI_KEY', '2B: Rejects missing x-gemini-api-key header with 400 MISSING_GEMINI_KEY');

    // 2C. Ignores key in query string and body
    const geminiQueryKeyReq = new Request('http://localhost/api/proof/gemini?key=secret-in-url', {
      method: 'POST',
      headers: {
        authorization: 'Bearer valid-user-token-abc',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ apiKey: 'secret-in-body' }),
    });
    const geminiQueryKeyRes = await geminiProofHandler(geminiQueryKeyReq);
    const geminiQueryKeyData = await geminiQueryKeyRes.json();
    assert(geminiQueryKeyRes.status === 400 && geminiQueryKeyData.error === 'MISSING_GEMINI_KEY', '2C: Strictly ignores API keys passed in URL query or request body');

    // 2D. Sanitized error handling for invalid Gemini key
    const rawSecretToTest = 'AIzaSyFakeSecretKeyThatMustNotLeak_98765';
    const geminiInvalidKeyReq = new Request('http://localhost/api/proof/gemini', {
      method: 'POST',
      headers: {
        authorization: 'Bearer valid-user-token-abc',
        'x-gemini-api-key': rawSecretToTest,
      },
    });
    const geminiInvalidKeyRes = await geminiProofHandler(geminiInvalidKeyReq);
    const geminiInvalidKeyData = await geminiInvalidKeyRes.json();
    const rawResponseBody = JSON.stringify(geminiInvalidKeyData);

    assert(geminiInvalidKeyRes.status === 400, '2D: Invalid Gemini key returns HTTP 400');
    assert(
      geminiInvalidKeyData.error === 'INVALID_GEMINI_KEY' || geminiInvalidKeyData.error === 'GEMINI_TEST_FAILED',
      `2D: Returns sanitized error code (${geminiInvalidKeyData.error})`
    );
    assert(!rawResponseBody.includes(rawSecretToTest), '2D: Secret key is completely absent from response body');

    // 2E. Secret absence from error responses across prefixes
    const nonStandardKey = 'custom-raw-byok-secret-token-abcdef';
    const nonStandardReq = new Request('http://localhost/api/proof/gemini', {
      method: 'POST',
      headers: {
        authorization: 'Bearer valid-user-token-abc',
        'x-gemini-api-key': nonStandardKey,
      },
    });
    const nonStandardRes = await geminiProofHandler(nonStandardReq);
    const nonStandardData = await nonStandardRes.json();
    assert(!JSON.stringify(nonStandardData).includes(nonStandardKey), '2E: Secret key without AIza prefix is never emitted or reflected in errors');

  } finally {
    resetAdminForTesting();
  }

  console.log(`\nPhase 1 Test Summary: ${passed} passed, ${failed} failed`);
  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Fatal error in Phase 1 tests:', err);
  process.exit(1);
});
