/**
 * FORGE Isolated Firebase Admin Singleton for Netlify Serverless Functions.
 *
 * Adheres strictly to Master Plan Phase 1 security rules:
 * - Credentials must never be committed or hardcoded.
 * - In production/preview: Read from managed Netlify environment variables:
 *     FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY.
 * - Private key newlines (\n) are unescaped safely.
 * - App initialization is strictly singleton across warm serverless invocations.
 */

import { initializeApp, getApps, getApp, cert, App } from 'firebase-admin/app';
import { getAuth, Auth } from 'firebase-admin/auth';
import { getFirestore, Firestore } from 'firebase-admin/firestore';
import fs from 'fs';

let cachedApp: App | null = null;
let cachedAuth: Auth | null = null;
let cachedDb: Firestore | null = null;

// Test overrides
let testAuthMock: any = null;
let testDbMock: any = null;

function loadAppletConfig(): Record<string, any> {
  try {
    if (fs.existsSync('./firebase-applet-config.json')) {
      return JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf8'));
    }
  } catch {
    // Silently proceed if not present
  }
  return {};
}

export function getAdminApp(): App {
  if (cachedApp) return cachedApp;

  const existingApps = getApps();
  if (existingApps.length > 0) {
    cachedApp = existingApps[0];
    return cachedApp;
  }

  const appletConfig = loadAppletConfig();
  const projectId = process.env.FIREBASE_PROJECT_ID || appletConfig.projectId || 'gen-lang-client-0367580829';
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const rawPrivateKey = process.env.FIREBASE_PRIVATE_KEY;

  if (clientEmail && rawPrivateKey) {
    const privateKey = rawPrivateKey.replace(/\\n/g, '\n');
    cachedApp = initializeApp({
      credential: cert({
        projectId,
        clientEmail,
        privateKey,
      }),
      projectId,
    });
  } else {
    // Project ID or Application Default Credentials
    cachedApp = initializeApp({ projectId });
  }

  return cachedApp;
}

export function getAdminAuth(): Auth {
  if (testAuthMock) return testAuthMock;
  if (cachedAuth) return cachedAuth;

  const app = getAdminApp();
  cachedAuth = getAuth(app);
  return cachedAuth;
}

export function getAdminDb(): Firestore {
  if (testDbMock) return testDbMock;
  if (cachedDb) return cachedDb;

  const app = getAdminApp();
  const appletConfig = loadAppletConfig();
  const dbId = process.env.FIREBASE_DATABASE_ID || appletConfig.firestoreDatabaseId || '(default)';

  cachedDb = getFirestore(app, dbId);
  return cachedDb;
}

export function setAdminAuthForTesting(mock: any): void {
  testAuthMock = mock;
}

export function setAdminDbForTesting(mock: any): void {
  testDbMock = mock;
}

export function resetAdminForTesting(): void {
  testAuthMock = null;
  testDbMock = null;
}
