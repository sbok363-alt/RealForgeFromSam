import React, { useState } from 'react';
import { Button } from '../components/ui/Button';
import { createGuestUser, useAuthStore } from '../store/useAuthStore';
import { useThemeStore } from '../store/useThemeStore';
import { auth } from '../lib/firebase';
import { signInWithPopup, GoogleAuthProvider } from 'firebase/auth';
import { getUserProfile, getWorkouts, saveUserProfile, saveWorkout } from '../lib/api';
import {
  isGuestUserId,
  setGuestSessionActive,
  updateGuestDisplayName,
} from '../lib/guest-session';
import { LogOut, Moon, Sun, Sparkles, ShieldCheck, RefreshCw, AlertCircle, Volume2, VolumeX, Pencil } from 'lucide-react';
import { Card, CardContent } from '../components/ui/Card';
import { soundFx } from '../lib/soundFx';

export default function Profile() {
  const { user, setUser } = useAuthStore();
  const { theme, toggleTheme } = useThemeStore();
  const [connectingGoogle, setConnectingGoogle] = useState(false);
  const [googleError, setGoogleError] = useState<string | null>(null);
  const [soundEnabled, setSoundEnabled] = useState(soundFx.isEnabled());
  const [editingName, setEditingName] = useState(false);
  const [guestName, setGuestName] = useState(user?.displayName || 'Gast');

  const handleSignOut = async () => {
    localStorage.removeItem('forge_demo_session');
    setGuestSessionActive(false);
    try {
      await auth.signOut();
    } catch (e) {
      console.warn("Sign out notice:", e);
    }
    setUser(null);
  };

  const handleConnectGoogle = async () => {
    if (!user || !isGuestUserId(user.uid)) return;
    setConnectingGoogle(true);
    setGoogleError(null);

    const guestUid = user.uid;
    const guestWorkouts = await getWorkouts(guestUid);
    const guestProfile = await getUserProfile(guestUid);

    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      const result = await signInWithPopup(auth, provider);
      if (!result?.user) throw new Error('Google sign-in did not return a user');

      if (guestProfile) {
        await saveUserProfile({
          ...guestProfile,
          userId: result.user.uid,
          name: guestProfile.name || user.displayName || 'Athlete',
        });
      }

      for (const workout of guestWorkouts) {
        await saveWorkout(
          { ...workout, userId: result.user.uid },
          'USER',
          'Migrated from local guest account'
        );
      }

      setGuestSessionActive(false);
      localStorage.removeItem('forge_demo_session');
      setUser(result.user);
    } catch (err: any) {
      console.error("Connect Google migration error:", err);
      setGuestSessionActive(true);
      try {
        await auth.signOut();
      } catch {}
      setUser(createGuestUser());
      setGoogleError(
        'Google sync was not completed. Your local guest data is still on this device.'
      );
    } finally {
      setConnectingGoogle(false);
    }
  };

  const isGuest = Boolean(user && isGuestUserId(user.uid));

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      <header>
        <h1 className="text-3xl font-display font-bold">Profile</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Manage your athlete account credentials and preferences.
        </p>
      </header>

      {/* Account Info Card */}
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center space-x-4">
              <div className="h-16 w-16 rounded-full bg-secondary flex items-center justify-center overflow-hidden border border-border ring-2 ring-primary/80 shadow-[0_0_16px_rgba(255,107,0,0.35)]">
                {user?.photoURL ? (
                  <img src={user.photoURL} alt="Profile" className="h-full w-full object-cover" referrerPolicy="no-referrer" />
                ) : (
                  <span className="text-2xl font-bold">{user?.email?.charAt(0).toUpperCase() || 'A'}</span>
                )}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  {isGuest && editingName ? (
                    <div className="flex items-center gap-2">
                      <input
                        value={guestName}
                        onChange={(event) => setGuestName(event.target.value)}
                        maxLength={40}
                        autoFocus
                        className="h-9 min-w-0 rounded-lg border border-border bg-background px-2 text-sm font-semibold"
                      />
                      <Button
                        size="sm"
                        onClick={() => {
                          const identity = updateGuestDisplayName(guestName);
                          setUser(createGuestUser());
                          setGuestName(identity.displayName);
                          setEditingName(false);
                        }}
                      >
                        Save
                      </Button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <h2 className="text-lg font-bold">{user?.displayName || "Athlete"}</h2>
                      {isGuest && (
                        <button
                          type="button"
                          onClick={() => setEditingName(true)}
                          className="rounded-lg p-1.5 text-muted-foreground hover:bg-secondary"
                          aria-label="Edit guest name"
                        >
                          <Pencil size={14} />
                        </button>
                      )}
                    </div>
                  )}
                  {isGuest ? (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/15 text-amber-500 border border-amber-500/30 flex items-center gap-1">
                      <Sparkles size={11} />
                      Local only
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-500 border border-emerald-500/30 flex items-center gap-1">
                      <ShieldCheck size={11} />
                      Cloud synced
                    </span>
                  )}
                </div>
                <p className="text-sm text-muted-foreground">
                  {isGuest ? 'Stored on this device only' : user?.email || "No email associated"}
                </p>
                <p className="text-[11px] text-muted-foreground font-mono mt-0.5">UID: {user?.uid}</p>
              </div>
            </div>

            {/* If in demo mode, provide Save & sync with Google button */}
            {isGuest && (
              <div className="w-full sm:w-auto">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleConnectGoogle}
                  disabled={connectingGoogle}
                  className="flex items-center gap-2 text-xs font-semibold"
                >
                  {connectingGoogle ? (
                    <RefreshCw size={13} className="animate-spin" />
                  ) : (
                    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24">
                      <path
                        fill="currentColor"
                        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                      />
                      <path
                        fill="currentColor"
                        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                      />
                      <path
                        fill="currentColor"
                        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                      />
                      <path
                        fill="currentColor"
                        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                      />
                    </svg>
                  )}
                  <span>Save & sync with Google</span>
                </Button>
                {googleError && (
                  <p className="text-[11px] text-destructive mt-1 flex items-center gap-1">
                    <AlertCircle size={12} />
                    {googleError}
                  </p>
                )}
              </div>
            )}
          </div>
        </CardContent>
      </Card>
      
      {/* Preferences Card */}
      <Card>
        <CardContent className="p-6 flex flex-col gap-6">
          <div className="flex items-center justify-between">
            <div className="flex flex-col">
              <span className="font-semibold">Appearance Theme</span>
              <span className="text-sm text-muted-foreground">Switch between light and dark visual presentation</span>
            </div>
            <Button variant="outline" size="icon" onClick={toggleTheme}>
              {theme === 'dark' ? <Moon size={20} /> : <Sun size={20} />}
            </Button>
          </div>
          
          <div className="flex items-center justify-between">
            <div className="flex flex-col">
              <span className="font-semibold text-[#FF7A32]">Cyber-Forge Haptics</span>
              <span className="text-sm text-muted-foreground">Synthesized cybernetic feedback & metallic lock sounds</span>
            </div>
            <Button 
              variant="outline" 
              size="icon" 
              className={soundEnabled ? 'text-[#FF7A32] border-[#FF7A32]/50 hover:bg-[#FF7A32]/10' : ''}
              onClick={() => {
                const newState = soundFx.toggle();
                setSoundEnabled(newState);
              }}
            >
              {soundEnabled ? <Volume2 size={20} /> : <VolumeX size={20} />}
            </Button>
          </div>
        </CardContent>
      </Card>
      
      {/* Sign Out Action */}
      <div className="pt-2">
        <Button variant="danger" className="w-full flex items-center justify-center gap-2" onClick={handleSignOut}>
          <LogOut size={18} />
          {isGuest ? 'Exit Local only' : 'Sign Out'}
        </Button>
      </div>
    </div>
  );
}
