export const GUEST_SESSION_KEY = 'hardstate_guest_session_v1';
export const GUEST_IDENTITY_KEY = 'hardstate_guest_identity_v1';
export const GUEST_PROFILE_PREFIX = 'hardstate_guest_profile_';
export const GUEST_UID_PREFIX = 'guest-local-';

export interface GuestIdentity {
  uid: string;
  displayName: string;
}

function canUseStorage(): boolean {
  return typeof window !== 'undefined' && Boolean(window.localStorage);
}

export function isGuestUserId(userId?: string | null): boolean {
  return Boolean(userId && userId.startsWith(GUEST_UID_PREFIX));
}

export function isGuestSessionActive(): boolean {
  return canUseStorage() && window.localStorage.getItem(GUEST_SESSION_KEY) === 'true';
}

export function setGuestSessionActive(active: boolean): void {
  if (!canUseStorage()) return;
  if (active) window.localStorage.setItem(GUEST_SESSION_KEY, 'true');
  else window.localStorage.removeItem(GUEST_SESSION_KEY);
}

export function getOrCreateGuestIdentity(): GuestIdentity {
  if (!canUseStorage()) {
    return { uid: `${GUEST_UID_PREFIX}runtime`, displayName: 'Gast' };
  }

  const existing = window.localStorage.getItem(GUEST_IDENTITY_KEY);
  if (existing) {
    try {
      const parsed = JSON.parse(existing) as GuestIdentity;
      if (isGuestUserId(parsed.uid) && parsed.displayName?.trim()) {
        return parsed;
      }
    } catch {
      // Replace corrupt identity below without touching workout data.
    }
  }

  const identity: GuestIdentity = {
    uid: `${GUEST_UID_PREFIX}${crypto.randomUUID()}`,
    displayName: 'Gast',
  };
  window.localStorage.setItem(GUEST_IDENTITY_KEY, JSON.stringify(identity));
  return identity;
}

export function updateGuestDisplayName(name: string): GuestIdentity {
  const identity = getOrCreateGuestIdentity();
  const next = {
    ...identity,
    displayName: name.trim() || 'Gast',
  };
  if (canUseStorage()) {
    window.localStorage.setItem(GUEST_IDENTITY_KEY, JSON.stringify(next));
  }
  return next;
}

export function guestProfileKey(userId: string): string {
  return `${GUEST_PROFILE_PREFIX}${userId}`;
}

let guestCloudMigrationInProgress = false;

export function beginGuestCloudMigration(): void {
  guestCloudMigrationInProgress = true;
}

export function endGuestCloudMigration(): void {
  guestCloudMigrationInProgress = false;
}

export function isGuestCloudMigrationInProgress(): boolean {
  return guestCloudMigrationInProgress;
}
