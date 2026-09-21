/**
 * FORGE Phase 1 Gemini BYOK Proof Function (Netlify Serverless).
 *
 * Proves:
 * Authenticated browser/request -> Netlify Function -> Ephemeral User Gemini BYOK -> Gemini API -> Success/Error only
 *
 * Constraints:
 * - Requires Firebase authentication.
 * - BYOK key read strictly from 'x-gemini-api-key' header.
 * - Key is never read from URL, query string, or request body.
 * - Key is never logged, stored, or persisted.
 * - Ephemeral GoogleGenAI client is created and discarded within request scope.
 * - Error responses are strictly sanitized (INVALID_GEMINI_KEY, GEMINI_RATE_LIMITED, GEMINI_UNAVAILABLE, GEMINI_TEST_FAILED).
 */

import { Context } from '@netlify/functions';
import { GoogleGenAI } from '@google/genai';
import { verifyAuth } from './_shared/auth';

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

  // 2. Authentication
  try {
    await verifyAuth(req);
  } catch (err: any) {
    const status = err.status || 401;
    return new Response(
      JSON.stringify({ ok: false, error: err.code || 'UNAUTHORIZED' }),
      { status, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // 3. Extract BYOK key from designated header ONLY
  const rawKey = req.headers.get('x-gemini-api-key');
  if (!rawKey || !rawKey.trim()) {
    return new Response(
      JSON.stringify({ ok: false, error: 'MISSING_GEMINI_KEY' }),
      {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }

  const apiKey = rawKey.trim();

  // 4. Ephemeral probe execution
  try {
    const client = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'forge-byok-runtime-proof',
        },
      },
    });

    await client.models.generateContent({
      model: 'gemini-flash-latest',
      contents: 'ping',
    });

    return new Response(
      JSON.stringify({
        ok: true,
        authenticated: true,
        gemini: true,
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  } catch (err: any) {
    // 5. Sanitized error handling: Never log or emit the key or raw error payload
    let sanitizedError = 'GEMINI_TEST_FAILED';
    let status = 400;

    const errMsg = (err?.message || '').toLowerCase();
    const errStatus = err?.status;

    if (
      errStatus === 400 ||
      errMsg.includes('api_key_invalid') ||
      errMsg.includes('api key not valid') ||
      errMsg.includes('invalid api key') ||
      errMsg.includes('api_key')
    ) {
      sanitizedError = 'INVALID_GEMINI_KEY';
      status = 400;
    } else if (
      errStatus === 429 ||
      errMsg.includes('resource_exhausted') ||
      errMsg.includes('quota') ||
      errMsg.includes('rate limit')
    ) {
      sanitizedError = 'GEMINI_RATE_LIMITED';
      status = 429;
    } else if (
      errStatus === 503 ||
      errMsg.includes('unavailable') ||
      errMsg.includes('high demand')
    ) {
      sanitizedError = 'GEMINI_UNAVAILABLE';
      status = 503;
    }

    return new Response(
      JSON.stringify({
        ok: false,
        authenticated: true,
        error: sanitizedError,
      }),
      {
        status,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
};
