import React, { useState } from 'react';
import { useGeminiStore } from '../store/useGeminiStore';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import { Eye, EyeOff, Key, X, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import { cn } from '../lib/utils';
import { auth } from '../lib/firebase';
import { useAuthStore } from '../store/useAuthStore';

export function BYOKModal() {
  const { isModalOpen, closeModal, apiKey, setApiKey, status, setStatus } = useGeminiStore();
  const { user } = useAuthStore();
  const [inputValue, setInputValue] = useState(apiKey || '');
  const [showKey, setShowKey] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  if (!isModalOpen) return null;

  const handleTestAndSave = async () => {
    const epoch = useAuthStore.getState().identityEpoch;
    if (!inputValue.trim()) {
      setErrorMsg('API Key is required.');
      return;
    }

    setStatus('TESTING');
    setErrorMsg('');

    try {
      const userApiKey = inputValue.trim();

      // First try our server test endpoint (bypasses browser CORS & header restrictions)
      let testSuccess = false;
      let serverErrorMessage = '';

      try {
        const token = await (user?.getIdToken ? user.getIdToken() : auth.currentUser?.getIdToken());
        const proxyRes = await fetch('/api/test-gemini-key', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
          body: JSON.stringify({ apiKey: userApiKey })
        });
        const proxyData = await proxyRes.json();
        if (proxyRes.ok && proxyData.success) {
          testSuccess = true;
        } else {
          serverErrorMessage = proxyData.error || 'Server validation failed';
        }
      } catch (proxyErr) {
        console.warn('Proxy test unreachable.', proxyErr);
      }

      if (!testSuccess) throw new Error(serverErrorMessage || 'Server validation failed');
      if (useAuthStore.getState().identityEpoch !== epoch) return;
      
      setApiKey(userApiKey);
      
      setTimeout(() => {
        closeModal();
      }, 1500);
    } catch (error: any) {
      if (useAuthStore.getState().identityEpoch !== epoch) return;
      console.error('API Key Test Error:', error);
      setStatus('ERROR');
      setErrorMsg(error.message || 'Invalid API Key or rate limit exceeded');
    }
  };

  const handleRemove = () => {
    setApiKey(null);
    setInputValue('');
    setStatus('UNCONFIGURED');
    setErrorMsg('');
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-background/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-md bg-zinc-950/80 backdrop-blur-xl border border-zinc-800 rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
        
        {/* Decorative Top Glow */}
        <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-cyan-500/50 to-transparent" />
        <div className="absolute top-0 inset-x-0 h-[200px] bg-cyan-500/10 blur-[100px] pointer-events-none" />

        <div className="p-6 relative z-10">
          {/* Header */}
          <div className="flex items-start justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-zinc-900 border border-zinc-800 flex items-center justify-center shadow-inner">
                <Key className="w-5 h-5 text-cyan-400" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-foreground font-display">Activate FORGE Brain Copilot</h2>
                <p className="text-xs text-muted-foreground mt-0.5 max-w-[240px]">
                  Enter your personal Google Gemini API key to enable instant plan optimization and L2 autonomy.
                </p>
              </div>
            </div>
            <button 
              onClick={closeModal}
              className="text-muted-foreground hover:text-foreground transition-colors p-1"
            >
              <X size={20} />
            </button>
          </div>

          {/* Steps */}
          <div className="bg-zinc-900/50 rounded-2xl p-4 border border-zinc-800/50 mb-6 text-sm">
            <ol className="space-y-3 text-zinc-300">
              <li className="flex gap-2">
                <span className="flex items-center justify-center h-5 w-5 rounded-full bg-zinc-800 text-[10px] font-bold text-zinc-400 shrink-0 border border-zinc-700">1</span>
                <span>Visit <a href="https://aistudio.google.com" target="_blank" rel="noreferrer" className="text-cyan-400 hover:underline">Google AI Studio</a></span>
              </li>
              <li className="flex gap-2">
                <span className="flex items-center justify-center h-5 w-5 rounded-full bg-zinc-800 text-[10px] font-bold text-zinc-400 shrink-0 border border-zinc-700">2</span>
                <span>Click <strong>Get API Key</strong> → <strong>Create API key</strong></span>
              </li>
              <li className="flex gap-2">
                <span className="flex items-center justify-center h-5 w-5 rounded-full bg-zinc-800 text-[10px] font-bold text-zinc-400 shrink-0 border border-zinc-700">3</span>
                <span>Paste your key below</span>
              </li>
            </ol>
          </div>

          {/* Input */}
          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider pl-1">
                Gemini API Key
              </label>
              <div className="relative">
                <Input
                  type={showKey ? 'text' : 'password'}
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  placeholder="AIzaSy..."
                  className="bg-zinc-900 border-zinc-700 h-12 pr-12 font-mono text-sm focus-visible:ring-cyan-500/50"
                  disabled={status === 'TESTING'}
                />
                <button
                  type="button"
                  onClick={() => setShowKey(!showKey)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-1"
                >
                  {showKey ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              
              {status === 'ERROR' && errorMsg && (
                <div className="flex items-center gap-1.5 text-destructive text-xs font-medium pl-1 mt-1 animate-in fade-in slide-in-from-top-1">
                  <AlertCircle size={14} />
                  {errorMsg}
                </div>
              )}
              
              {status === 'CONNECTED' && !errorMsg && (
                <div className="flex items-center gap-1.5 text-emerald-400 text-xs font-medium pl-1 mt-1 animate-in fade-in slide-in-from-top-1">
                  <CheckCircle2 size={14} />
                  Connected to FORGE Brain successfully.
                </div>
              )}
            </div>

            <div className="flex gap-3 pt-2">
              <Button 
                variant="outline" 
                className="flex-1 h-11 border-zinc-700 bg-zinc-900/50 hover:bg-zinc-800 text-zinc-300"
                onClick={handleRemove}
                disabled={!apiKey || status === 'TESTING'}
              >
                Remove Key
              </Button>
              <Button 
                className={cn(
                  "flex-[2] h-11 font-bold shadow-lg transition-all",
                  status === 'CONNECTED' 
                    ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20" 
                    : "bg-cyan-600 text-white hover:bg-cyan-500"
                )}
                onClick={handleTestAndSave}
                disabled={status === 'TESTING'}
              >
                {status === 'TESTING' ? (
                  <>
                    <Loader2 size={16} className="animate-spin mr-2" />
                    Testing connection...
                  </>
                ) : status === 'CONNECTED' ? (
                  <>
                    <CheckCircle2 size={16} className="mr-2" />
                    Saved
                  </>
                ) : (
                  'Test & Save Key'
                )}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
