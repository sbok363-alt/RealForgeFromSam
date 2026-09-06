import React, { useState, useEffect } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { Button } from '../components/ui/Button';
import { Card, CardContent } from '../components/ui/Card';
import { 
  signInWithPopup, 
  signInWithRedirect, 
  getRedirectResult, 
  GoogleAuthProvider 
} from 'firebase/auth';
import { auth } from '../lib/firebase';
import { useAuthStore, DEMO_USER } from '../store/useAuthStore';
import { 
  Dumbbell, 
  AlertCircle, 
  ExternalLink, 
  Copy, 
  Check, 
  Sparkles, 
  RefreshCw, 
  LogIn, 
  ShieldAlert,
  ArrowRight
} from 'lucide-react';
import firebaseConfig from '../../firebase-applet-config.json';

interface AuthErrorState {
  type: 'popup_blocked' | 'unauthorized_domain' | 'canceled' | 'network' | 'operation_disabled' | 'general';
  title: string;
  message: string;
  code?: string;
}

export default function Auth() {
  const { user, setUser } = useAuthStore();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(false);
  const [redirecting, setRedirecting] = useState(false);
  const [errorState, setErrorState] = useState<AuthErrorState | null>(null);
  const [copiedDomain, setCopiedDomain] = useState(false);

  const isInIframe = typeof window !== 'undefined' && window.self !== window.top;
  const currentHostname = typeof window !== 'undefined' ? window.location.hostname : '';
  const currentUrl = typeof window !== 'undefined' ? window.location.href : '';

  // 1. If user is already authenticated or becomes authenticated, immediately redirect to app root
  useEffect(() => {
    if (user) {
      navigate('/', { replace: true });
    }
  }, [user, navigate]);

  // 2. Check for redirect result in case signInWithRedirect was used
  useEffect(() => {
    let isMounted = true;
    getRedirectResult(auth)
      .then((result) => {
        if (!isMounted) return;
        if (result?.user) {
          localStorage.removeItem('forge_demo_session');
          setUser(result.user);
          navigate('/', { replace: true });
        }
      })
      .catch((err: any) => {
        if (!isMounted) return;
        console.warn("Firebase redirect auth notice:", err);
        handleAuthError(err);
      });

    return () => {
      isMounted = false;
    };
  }, [navigate, setUser]);

  const handleAuthError = (err: any) => {
    const code = err?.code || '';
    const msg = err?.message || '';

    if (code === 'auth/popup-blocked') {
      setErrorState({
        type: 'popup_blocked',
        title: 'Sign-In Popup Blocked',
        message: 'Your browser or the preview frame blocked the Google sign-in popup. You can open FORGE in a new browser tab or use redirect sign-in.',
        code,
      });
    } else if (code === 'auth/unauthorized-domain') {
      setErrorState({
        type: 'unauthorized_domain',
        title: 'Firebase Domain Not Authorized',
        message: `The domain "${currentHostname}" must be added to Authorized Domains in your Firebase Console project settings to complete OAuth sign-in.`,
        code,
      });
    } else if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
      setErrorState({
        type: 'canceled',
        title: 'Sign-In Window Closed',
        message: 'The Google sign-in window was closed before completing. Click below to try again.',
        code,
      });
    } else if (code === 'auth/network-request-failed') {
      setErrorState({
        type: 'network',
        title: 'Network Connection Issue',
        message: 'Unable to connect to Google Firebase authentication servers. Please verify your internet connection.',
        code,
      });
    } else if (code === 'auth/operation-not-allowed') {
      setErrorState({
        type: 'operation_disabled',
        title: 'Google Sign-In Disabled',
        message: 'Google Sign-In is not enabled for this Firebase project. Enable the Google provider in Firebase Console under Authentication > Sign-in method.',
        code,
      });
    } else {
      setErrorState({
        type: 'general',
        title: 'Authentication Error',
        message: msg || 'An unexpected error occurred during login. Please try again.',
        code,
      });
    }
  };

  const handleGooglePopupLogin = async () => {
    setLoading(true);
    setErrorState(null);
    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      const result = await signInWithPopup(auth, provider);
      if (result.user) {
        localStorage.removeItem('forge_demo_session');
        setUser(result.user);
        navigate('/', { replace: true });
      }
    } catch (err: any) {
      console.error("Google popup sign-in error:", err);
      handleAuthError(err);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleRedirectLogin = async () => {
    setRedirecting(true);
    setErrorState(null);
    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      await signInWithRedirect(auth, provider);
    } catch (err: any) {
      console.error("Google redirect sign-in error:", err);
      handleAuthError(err);
      setRedirecting(false);
    }
  };

  const handleDemoLogin = () => {
    localStorage.setItem('forge_demo_session', 'true');
    setUser(DEMO_USER);
    navigate('/', { replace: true });
  };

  const handleOpenInNewTab = () => {
    if (typeof window !== 'undefined') {
      window.open(window.location.origin + window.location.pathname, '_blank');
    }
  };

  const copyDomainToClipboard = () => {
    if (typeof navigator !== 'undefined' && currentHostname) {
      navigator.clipboard.writeText(currentHostname);
      setCopiedDomain(true);
      setTimeout(() => setCopiedDomain(false), 2500);
    }
  };

  // If already logged in, redirect
  if (user) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4 relative">
      <Card className="w-full max-w-md border-border/70 shadow-lg">
        <CardContent className="pt-8 pb-8 px-6 flex flex-col items-center space-y-6">
          
          {/* Brand Icon */}
          <div className="h-16 w-16 bg-primary/10 text-primary rounded-2xl flex items-center justify-center shadow-xs">
            <Dumbbell size={34} className="stroke-[2.2]" />
          </div>
          
          {/* Header */}
          <div className="text-center space-y-1.5">
            <h1 className="text-3xl font-display font-extrabold tracking-tight text-foreground">FORGE</h1>
            <p className="text-muted-foreground text-sm max-w-xs">
              Autonomous Hypertrophy & Strength Intelligence System
            </p>
          </div>

          {/* Iframe Hint Banner */}
          {isInIframe && (
            <div className="w-full p-3 rounded-xl bg-secondary/40 border border-border/60 flex items-start gap-2.5 text-xs text-muted-foreground">
              <ExternalLink size={15} className="shrink-0 mt-0.5 text-primary" />
              <div className="flex-1 leading-relaxed">
                <span>Running inside preview frame. If popups are blocked by your browser, open in a dedicated tab:</span>
                <button
                  onClick={handleOpenInNewTab}
                  className="block mt-1 font-semibold text-primary hover:underline"
                >
                  Open FORGE in New Tab &rarr;
                </button>
              </div>
            </div>
          )}

          {/* Error Feedback Panel */}
          {errorState && (
            <div className="w-full p-4 rounded-xl bg-destructive/10 border border-destructive/30 text-destructive text-xs space-y-2.5 animate-in fade-in duration-200">
              <div className="flex items-center gap-2 font-bold text-sm">
                <AlertCircle size={16} className="shrink-0" />
                <span>{errorState.title}</span>
              </div>
              <p className="text-muted-foreground leading-relaxed">
                {errorState.message}
              </p>

              {/* Action Buttons based on error type */}
              {errorState.type === 'popup_blocked' && (
                <div className="pt-2 flex flex-col gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="w-full flex items-center justify-center gap-1.5 font-semibold text-foreground"
                    onClick={handleOpenInNewTab}
                  >
                    <ExternalLink size={13} />
                    Open in New Tab to Sign In
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    className="w-full flex items-center justify-center gap-1.5"
                    onClick={handleGoogleRedirectLogin}
                    disabled={redirecting}
                  >
                    <RefreshCw size={13} className={redirecting ? "animate-spin" : ""} />
                    Try Redirect Sign-In
                  </Button>
                </div>
              )}

              {errorState.type === 'unauthorized_domain' && (
                <div className="pt-2 space-y-2">
                  <div className="p-2 rounded bg-background/80 border border-border/50 flex items-center justify-between font-mono text-[11px] text-foreground">
                    <span className="truncate">{currentHostname}</span>
                    <button
                      onClick={copyDomainToClipboard}
                      className="flex items-center gap-1 text-primary hover:underline font-sans text-xs ml-2 shrink-0"
                    >
                      {copiedDomain ? <Check size={12} /> : <Copy size={12} />}
                      <span>{copiedDomain ? 'Copied' : 'Copy'}</span>
                    </button>
                  </div>
                  <a
                    href={`https://console.firebase.google.com/project/${firebaseConfig.projectId}/authentication/settings`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center gap-1 text-[11px] text-primary font-semibold hover:underline"
                  >
                    <span>Add to Firebase Console Authorized Domains</span>
                    <ExternalLink size={11} />
                  </a>
                </div>
              )}
            </div>
          )}

          {/* Primary Action: Google OAuth */}
          <div className="w-full space-y-3">
            <Button 
              size="lg" 
              className="w-full flex items-center justify-center gap-2.5 font-semibold shadow-sm" 
              onClick={handleGooglePopupLogin}
              disabled={loading || redirecting}
            >
              {loading ? (
                <>
                  <RefreshCw size={17} className="animate-spin" />
                  <span>Connecting to Google...</span>
                </>
              ) : (
                <>
                  {/* Google G SVG */}
                  <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24">
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
                  <span>Continue with Google</span>
                </>
              )}
            </Button>

            {/* Divider */}
            <div className="relative flex items-center justify-center my-2">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-border/60" />
              </div>
              <span className="relative px-3 bg-card text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                or preview mode
              </span>
            </div>

            {/* Instant Demo Athlete Access */}
            <Button
              variant="outline"
              size="lg"
              className="w-full flex items-center justify-center gap-2 border-border/80 hover:bg-secondary/60 hover:text-foreground group"
              onClick={handleDemoLogin}
            >
              <Sparkles size={16} className="text-amber-500 group-hover:scale-110 transition-transform" />
              <span className="font-semibold">Explore as Demo Athlete</span>
              <ArrowRight size={14} className="text-muted-foreground group-hover:translate-x-0.5 transition-transform" />
            </Button>
            <p className="text-[11px] text-center text-muted-foreground">
              Instant access with pre-configured workout logs, muscle heatmaps, and AI copilot.
            </p>
          </div>

        </CardContent>
      </Card>
    </div>
  );
}
