/**
 * FORGE Serverless Authentication Helper for Netlify Functions.
 *
 * Verifies caller identity using Firebase ID tokens exclusively.
 * Rejects client-supplied user IDs. Derives uid strictly from token claims.
 */

import { getAdminAuth } from './firebase-admin';

export interface AuthenticatedUser {
  uid: string;
  email?: string;
}

export interface AuthError {
  status: number;
  code: string;
  message: string;
}

export async function verifyAuth(req: Request): Promise<AuthenticatedUser> {
  const authHeader = req.headers.get('authorization');

  if (!authHeader) {
    const err: any = new Error('Missing Authorization header');
    err.status = 401;
    err.code = 'AUTH_MISSING_HEADER';
    throw err;
  }

  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0].toLowerCase() !== 'bearer' || !parts[1].trim()) {
    const err: any = new Error('Malformed Authorization header: Expected Bearer <token>');
    err.status = 401;
    err.code = 'AUTH_MALFORMED_HEADER';
    throw err;
  }

  const token = parts[1].trim();
  const auth = getAdminAuth();

  if (!auth) {
    const err: any = new Error('Authentication service unavailable');
    err.status = 503;
    err.code = 'AUTH_SERVICE_UNAVAILABLE';
    throw err;
  }

  try {
    const decoded = await auth.verifyIdToken(token);
    if (!decoded || !decoded.uid) {
      const err: any = new Error('Invalid token: missing uid claim');
      err.status = 401;
      err.code = 'AUTH_INVALID_TOKEN';
      throw err;
    }

    return {
      uid: decoded.uid,
      email: decoded.email,
    };
  } catch (err: any) {
    const error: any = new Error('Unauthorized: Token verification failed');
    error.status = 401;
    error.code = 'AUTH_INVALID_TOKEN';
    throw error;
  }
}
