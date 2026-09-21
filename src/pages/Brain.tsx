import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAuthStore } from '../store/useAuthStore';
import { 
  Thread, 
  ThreadMessage, 
  Proposal, 
  Workout, 
  UserPermissions, 
  AutonomyLevel 
} from '../types';
import { 
  getThreads, 
  createThread, 
  saveThread, 
  deleteThread,
  deleteAllThreads,
  getWorkouts, 
  getWorkout,
  getUserPermissions, 
  updateUserPermissions,
  executeProposal,
  discardProposal,
  createProposal,
  seedForgeData
} from '../lib/api';
import { ProposalDiffCard } from '../components/ProposalDiffCard';
import { AutonomyBadge } from '../components/AutonomyBadge';
import { AutonomyModal } from '../components/AutonomyModal';
import { OCCVersionBadge } from '../components/OCCVersionBadge';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Card, CardContent } from '../components/ui/Card';
import { 
  Brain as BrainIcon, 
  Send, 
  Plus, 
  Sparkles, 
  MessageSquare, 
  Layers, 
  ChevronDown, 
  Settings2,
  RefreshCw,
  Dumbbell,
  CheckCircle2,
  History,
  Info,
  Trash2,
  AlertTriangle
} from 'lucide-react';
import { useLocation } from 'react-router-dom';
import { cn } from '../lib/utils';
import { useGeminiStore } from '../store/useGeminiStore';

const TypingMessage = ({ content, timestamp, onScroll }: { content: string, timestamp?: string, onScroll: (smooth?: boolean) => void }) => {
  const [displayedContent, setDisplayedContent] = useState('');
  const [isTyping, setIsTyping] = useState(false);

  useEffect(() => {
    const messageAge = timestamp ? Date.now() - new Date(timestamp).getTime() : 0;
    const isNew = messageAge < 5000;

    if (!isNew) {
      setDisplayedContent(content);
      return;
    }

    setIsTyping(true);
    let i = 0;
    let frames = 0;
    const interval = setInterval(() => {
      i += 3;
      frames++;
      setDisplayedContent(content.substring(0, i));
      
      // Auto-scroll instantly every few frames to avoid queuing smooth animations
      if (frames % 4 === 0) {
        onScroll(false);
      }
      
      if (i >= content.length) {
        clearInterval(interval);
        setIsTyping(false);
        onScroll(true); // Final smooth scroll when done
      }
    }, 15);
    
    return () => clearInterval(interval);
  }, [content, timestamp, onScroll]);

  return (
    <>
      {displayedContent}
      {isTyping && <span className="inline-block w-1.5 h-3.5 ml-0.5 bg-current animate-pulse align-middle" />}
    </>
  );
};

export default function Brain() {
  const { user } = useAuthStore();
  const location = useLocation();
  
  const [threads, setThreads] = useState<Thread[]>([]);
  const [activeThread, setActiveThread] = useState<Thread | null>(null);
  const [threadToDelete, setThreadToDelete] = useState<Thread | null>(null);
  const [showClearAllConfirm, setShowClearAllConfirm] = useState(false);
  const [deletingThread, setDeletingThread] = useState(false);
  const [workouts, setWorkouts] = useState<Workout[]>([]);
  const [permissions, setPermissions] = useState<UserPermissions>({
    userId: user?.uid || '',
    autonomyLevel: 'L2_GUIDED_AUTONOMY',
    permissionEpoch: 1
  });
  
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [toolStatus, setToolStatus] = useState<string | null>(null);
  const [isAutonomyModalOpen, setIsAutonomyModalOpen] = useState(false);
  const [showThreadList, setShowThreadList] = useState(false);
  const { apiKey: geminiApiKey, openModal: openBYOKModal } = useGeminiStore();
  
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = useCallback((smooth = true) => {
    messagesEndRef.current?.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto' });
  }, []);

  const autoPromptRef = useRef<string | null>(null);

  // Initial load
  useEffect(() => {
    if (!user) return;

    const loadData = async () => {
      const perms = await getUserPermissions(user.uid);
      setPermissions(perms);

      const wList = await getWorkouts(user.uid);
      setWorkouts(wList);

      const tList = await getThreads(user.uid);
      setThreads(tList);

      // Check if navigated with a specific target workout
      const stateTargetWorkoutId = (location.state as any)?.targetWorkoutId;
      const stateAutoPrompt = (location.state as any)?.autoPrompt;
      let threadToActivate: Thread | null = null;

      if (stateTargetWorkoutId) {
        // Find or create thread for this workout
        const existing = tList.find(t => t.targetWorkoutId === stateTargetWorkoutId && t.status === 'ACTIVE');
        if (existing) {
          setActiveThread(existing);
          threadToActivate = existing;
        } else {
          const targetW = wList.find(w => w.id === stateTargetWorkoutId);
          const newT = await createThread(
            user.uid, 
            `Optimize: ${targetW?.title || 'Workout'}`, 
            stateTargetWorkoutId
          );
          setThreads(prev => [newT, ...prev]);
          setActiveThread(newT);
          threadToActivate = newT;
        }
      } else if (tList.length > 0) {
        setActiveThread(tList[0]);
        threadToActivate = tList[0];
      } else {
        // Chat history is empty (e.g., cleared by user or new thread).
        // Create a clean conversation thread without touching or clobbering user workouts.
        const freshThread = await createThread(user.uid, 'Workout Coach Chat');
        setThreads([freshThread]);
        setActiveThread(freshThread);
        threadToActivate = freshThread;
      }

      // If autoPrompt was provided and not triggered yet for this navigation
      if (stateAutoPrompt && threadToActivate) {
        const promptKey = `${stateTargetWorkoutId || 'general'}-${stateAutoPrompt}`;
        if (autoPromptRef.current !== promptKey) {
          autoPromptRef.current = promptKey;
          setTimeout(() => {
            handleSend(stateAutoPrompt, threadToActivate!);
          }, 150);
        }
      }
    };

    loadData();
  }, [user, location.state]);

  useEffect(() => {
    scrollToBottom();
  }, [activeThread?.messages, toolStatus, loading]);

  const refreshWorkouts = async () => {
    if (!user) return;
    const wList = await getWorkouts(user.uid);
    setWorkouts(wList);
  };

  const handleNewThread = async () => {
    if (!user) return;
    const newT = await createThread(user.uid, `Session #${threads.length + 1}`);
    setThreads(prev => [newT, ...prev]);
    setActiveThread(newT);
    setShowThreadList(false);
  };

  const handleDeleteThread = async (targetThread: Thread) => {
    if (!user) return;
    setDeletingThread(true);
    try {
      await deleteThread(targetThread.id, user.uid);
      const remaining = threads.filter(t => t.id !== targetThread.id);
      setThreads(remaining);

      if (activeThread?.id === targetThread.id) {
        if (remaining.length > 0) {
          setActiveThread(remaining[0]);
        } else {
          // If no threads left, create a fresh one automatically
          const fresh = await createThread(user.uid, 'Session #1');
          setThreads([fresh]);
          setActiveThread(fresh);
        }
      }
      setThreadToDelete(null);
    } catch (e) {
      console.error("Failed to delete thread:", e);
    } finally {
      setDeletingThread(false);
    }
  };

  const handleClearAllThreads = async () => {
    if (!user) return;
    setDeletingThread(true);
    try {
      await deleteAllThreads(user.uid);
      const fresh = await createThread(user.uid, 'Session #1');
      setThreads([fresh]);
      setActiveThread(fresh);
      setShowClearAllConfirm(false);
      setShowThreadList(false);
    } catch (e) {
      console.error("Failed to clear all threads:", e);
    } finally {
      setDeletingThread(false);
    }
  };

  const handleUpdateAutonomy = async (level: AutonomyLevel) => {
    if (!user) return;
    const updated = await updateUserPermissions(user.uid, level);
    setPermissions(updated);
  };

  const handleSend = async (customPrompt?: string, customThread?: Thread) => {
    const thread = customThread || activeThread;
    const textToSend = customPrompt || input;
    if (!textToSend.trim() || !user || !thread) return;

    const userMessage: ThreadMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: textToSend.trim(),
      timestamp: new Date().toISOString()
    };

    const updatedMessages = [...thread.messages, userMessage];
    const updatedThread: Thread = {
      ...thread,
      messages: updatedMessages,
      updatedAt: new Date().toISOString()
    };

    setActiveThread(updatedThread);
    setThreads(prev => prev.map(t => t.id === updatedThread.id ? updatedThread : t));
    setInput('');
    setLoading(true);
    setToolStatus(null);
    await saveThread(updatedThread);

    try {
      const idToken = await user.getIdToken();
      
      // Send chat history and current target workout context
      const messagesPayload = updatedMessages.slice(-10).map(m => ({
        role: m.role,
        content: m.content
      }));

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${idToken}`
      };
      if (geminiApiKey) {
        headers['x-gemini-api-key'] = geminiApiKey;
      }

      const res = await fetch('/api/forge-brain', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          messages: messagesPayload,
          targetWorkoutId: thread.targetWorkoutId,
          autonomyLevel: permissions.autonomyLevel,
          geminiApiKey: geminiApiKey || undefined
        })
      });

      if (res.status === 401 || res.status === 403) {
         openBYOKModal();
         if (activeThread) {
           setActiveThread({
             ...activeThread,
             messages: activeThread.messages.slice(0, -1)
           });
         }
         return;
      }
      if (!res.ok) throw new Error("Failed to connect to FORGE Brain");
      if (!res.body) throw new Error("No stream returned");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const data = JSON.parse(line);

            if (data.type === 'tool') {
              const toolMap: Record<string, string> = {
                get_user_profile: "Reading user profile & autonomy settings...",
                get_workouts: "Inspecting workout schedules & OCC versions...",
                get_recent_workouts: "Analyzing recent training history...",
                get_exercise_history: "Reviewing progressive overload logs...",
                get_progress: "Evaluating consistency and volume...",
                get_personal_records: "Checking 1RM thresholds..."
              };
              setToolStatus(toolMap[data.name] || `Analyzing via ${data.name}...`);
            } else if (data.type === 'done') {
              setToolStatus(null);
              
              let proposalObj: Proposal | undefined = undefined;
              if (data.proposal) {
                // Save proposal to Firestore & local
                proposalObj = await createProposal(user.uid, {
                  id: data.proposal.id || crypto.randomUUID(),
                  threadId: thread.id,
                  targetEntityType: 'WORKOUT',
                  targetEntityId: data.proposal.targetEntityId,
                  baseVersion: data.proposal.baseVersion,
                  status: 'PENDING_APPROVAL',
                  summary: data.proposal.summary,
                  beforeState: data.proposal.beforeState,
                  afterState: data.proposal.afterState
                });
              }

              const assistantMessage: ThreadMessage = {
                id: crypto.randomUUID(),
                role: 'assistant',
                content: data.response || "I have formulated a recommendation for you.",
                timestamp: new Date().toISOString(),
                proposalId: proposalObj?.id,
                proposal: proposalObj
              };

              const finalThread: Thread = {
                ...updatedThread,
                messages: [...updatedMessages, assistantMessage],
                updatedAt: new Date().toISOString()
              };

              setActiveThread(finalThread);
              setThreads(prev => prev.map(t => t.id === finalThread.id ? finalThread : t));
              await saveThread(finalThread);
            } else if (data.type === 'error') {
              throw new Error(data.error);
            }
          } catch (e) {
            console.error("Error parsing stream line:", line, e);
          }
        }
      }
    } catch (err: any) {
      console.error("FORGE Brain error:", err);
      const errorMessage: ThreadMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: `I encountered an issue analyzing your training: ${err.message || 'Please try again'}.`,
        timestamp: new Date().toISOString()
      };
      const errorThread = {
        ...updatedThread,
        messages: [...updatedMessages, errorMessage]
      };
      setActiveThread(errorThread);
      await saveThread(errorThread);
    } finally {
      setLoading(false);
      setToolStatus(null);
    }
  };

  const handleApproveProposal = async (proposalId: string) => {
    if (!user) return;
    const res = await executeProposal(proposalId, user.uid, 'USER');
    
    if (res.success && res.workout) {
      await refreshWorkouts();
      // Update proposal state in thread
      if (activeThread) {
        const updatedMsgs = activeThread.messages.map(m => {
          if (m.proposal?.id === proposalId) {
            return {
              ...m,
              proposal: res.proposal
            };
          }
          return m;
        });

        // Append system confirmation
        updatedMsgs.push({
          id: crypto.randomUUID(),
          role: 'system',
          content: `✓ Proposal executed cleanly with Optimistic Concurrency Control. ${res.workout.title} updated to OCC version v${res.workout.version}. Mutation recorded in audit trail with reversible inverse delta.`,
          timestamp: new Date().toISOString()
        });

        const updatedT = { ...activeThread, messages: updatedMsgs };
        setActiveThread(updatedT);
        await saveThread(updatedT);
      }
    } else {
      throw new Error(res.error || "Failed to execute proposal");
    }
  };

  const handleDiscardProposal = async (proposalId: string) => {
    if (!user) return;
    const discarded = await discardProposal(proposalId, user.uid);
    if (activeThread) {
      const updatedMsgs = activeThread.messages.map(m => {
        if (m.proposal?.id === proposalId) {
          return {
            ...m,
            proposal: { ...m.proposal, status: 'DISCARDED' } as Proposal
          };
        }
        return m;
      });
      const updatedT = { ...activeThread, messages: updatedMsgs };
      setActiveThread(updatedT);
      await saveThread(updatedT);
    }
  };

  const handleRebaseProposal = (proposal: Proposal) => {
    const targetW = workouts.find(w => w.id === proposal.targetEntityId);
    handleSend(`Please re-evaluate and rebase your recommendations for ${targetW?.title || 'this workout'} against its current live state at v${targetW?.version || proposal.baseVersion + 1}.`);
  };

  const targetWorkout = activeThread?.targetWorkoutId 
    ? workouts.find(w => w.id === activeThread.targetWorkoutId) 
    : workouts[0];

  const quickPrompts = [
    {
      label: "⚡ Progressive Overload",
      text: targetWorkout 
        ? `Analyze "${targetWorkout.title}" (currently at OCC v${targetWorkout.version}) and propose progressive overload adjustments to weights and sets.` 
        : "Analyze my scheduled workouts and propose progressive overload increments."
    },
    {
      label: "📈 Volume Ramp",
      text: "Propose adding an extra accessory set to target upper chest and lateral deltoids."
    },
    {
      label: "🔄 Shift Schedule",
      text: "Propose shifting my next workout by +1 day for optimal muscular recovery."
    },
    {
      label: "🛡️ Check Plateaus",
      text: "Audit my recent performance data and advise if any lifts are showing a potential plateau."
    }
  ];

  return (
    <div className="flex flex-col h-full min-h-0 flex-1 overflow-hidden w-full max-w-5xl mx-auto">
      {/* Top Header Bar */}
      <header className="mb-1.5 sm:mb-3 flex items-center justify-between gap-2 sm:gap-3 pb-1.5 sm:pb-3 border-b border-border/60 shrink-0">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <div className="p-1.5 sm:p-2 rounded-xl bg-primary/10 text-primary shrink-0">
            <BrainIcon size={18} className="sm:w-[22px] sm:h-[22px]" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 sm:gap-2">
              <h1 className="text-base sm:text-2xl font-display font-black truncate tracking-widest text-[#FF7A32] drop-shadow-[0_0_12px_rgba(255,122,50,0.5)]">
                FORGE AI TERMINAL
              </h1>
              <span className="text-[9px] sm:text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-[#FF7A32]/10 text-[#FF7A32] border border-[#FF7A32]/20">
                Active
              </span>
            </div>
            <div className="hidden sm:flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
              <span>Optimistic Concurrency Control (OCC)</span>
              <span>•</span>
              <span>Reversible Mutations</span>
            </div>
          </div>
        </div>

        {/* Header Badges & Actions */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          <div className="hidden sm:block">
            <AutonomyBadge 
              level={permissions.autonomyLevel} 
              onClick={() => setIsAutonomyModalOpen(true)}
            />
          </div>
          <Button 
            variant="outline" 
            size="sm" 
            className="h-7 sm:h-8 text-xs gap-1 sm:gap-1.5 px-2 sm:px-3"
            onClick={handleNewThread}
          >
            <Plus size={13} /> <span className="hidden sm:inline">New Thread</span><span className="sm:hidden">New</span>
          </Button>
        </div>
      </header>

      {/* Main Chat & Copilot Canvas */}
      <Card className="flex-1 min-h-0 flex flex-col overflow-hidden bg-[#101012] border-white/[0.08] shadow-[0_4px_24px_rgba(255,122,50,0.1)] rounded-2xl">
        {/* Active Thread Meta Strip */}
        <div className="px-2.5 py-1.5 sm:px-4 sm:py-2 bg-black/40 border-b border-white/[0.08] flex items-center justify-between text-xs shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <div className="relative">
              <button 
                onClick={() => setShowThreadList(!showThreadList)}
                className="flex items-center gap-1 font-semibold text-foreground hover:text-primary transition-colors py-0.5 px-1.5 sm:py-1 sm:px-2 rounded-md hover:bg-secondary text-xs"
              >
                <MessageSquare size={12} className="text-primary shrink-0" />
                <span className="truncate max-w-[130px] sm:max-w-[280px]">
                  {activeThread?.title || 'Main Conversation'}
                </span>
                <ChevronDown size={12} className="text-muted-foreground shrink-0" />
              </button>

              {/* Thread Dropdown */}
              {showThreadList && (
                <div className="absolute left-0 top-full mt-1 w-72 bg-card border border-border rounded-xl shadow-xl z-30 p-2 space-y-1 animate-in fade-in">
                  <div className="flex items-center justify-between px-2 py-1 text-[11px] font-semibold text-muted-foreground border-b border-border/40 pb-1.5 mb-1">
                    <span>AI Threads ({threads.length})</span>
                    <button onClick={handleNewThread} className="text-primary hover:underline flex items-center gap-0.5">
                      <Plus size={12} /> New
                    </button>
                  </div>
                  <div className="max-h-56 overflow-y-auto space-y-1">
                    {threads.map(t => (
                      <div 
                        key={t.id}
                        onClick={() => {
                          setActiveThread(t);
                          setShowThreadList(false);
                        }}
                        className={cn(
                          "group px-2.5 py-1.5 rounded-lg text-xs cursor-pointer transition-colors flex items-center justify-between gap-1.5",
                          activeThread?.id === t.id ? "bg-primary/10 text-primary font-semibold" : "hover:bg-secondary text-foreground"
                        )}
                      >
                        <div className="min-w-0 flex-1 flex flex-col">
                          <span className="truncate">{t.title}</span>
                          <span className="text-[10px] text-muted-foreground">{t.messages.length} messages</span>
                        </div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setThreadToDelete(t);
                          }}
                          className="opacity-0 group-hover:opacity-100 p-1 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded transition-all shrink-0"
                          title="Delete thread"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    ))}
                  </div>

                  {threads.length > 1 && (
                    <div className="pt-1.5 border-t border-border/40 mt-1">
                      <button
                        onClick={() => {
                          setShowThreadList(false);
                          setShowClearAllConfirm(true);
                        }}
                        className="w-full text-center text-[11px] text-destructive hover:bg-destructive/10 py-1 rounded transition-colors font-medium flex items-center justify-center gap-1"
                      >
                        <Trash2 size={11} /> Clear all conversations
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>

            {targetWorkout && (
              <div className="hidden md:flex items-center gap-1 text-muted-foreground">
                <span>• Target:</span>
                <span className="font-semibold text-foreground truncate max-w-[180px]">
                  {targetWorkout.title}
                </span>
                <OCCVersionBadge version={targetWorkout.version} />
              </div>
            )}
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {activeThread && (
              <button 
                onClick={() => setThreadToDelete(activeThread)}
                className="text-[11px] text-muted-foreground hover:text-destructive p-1 rounded hover:bg-destructive/10 transition-colors flex items-center gap-1"
                title="Delete current conversation"
              >
                <Trash2 size={13} />
                <span className="hidden sm:inline">Delete Chat</span>
              </button>
            )}
            <button 
              onClick={() => setIsAutonomyModalOpen(true)}
              className="text-[11px] text-muted-foreground hover:text-primary flex items-center gap-1 p-1 rounded hover:bg-secondary transition-colors"
            >
              <Settings2 size={12} /> <span className="hidden sm:inline">Settings</span>
            </button>
          </div>
        </div>

        {/* Message Stream */}
        <div className="flex-1 min-h-0 overflow-y-auto p-2.5 sm:p-4 space-y-3 sm:space-y-4 overscroll-contain">
          {activeThread?.messages.map((msg, i) => {
            const isUser = msg.role === 'user';
            const isSystem = msg.role === 'system';

            if (isSystem) {
              return (
                <div key={msg.id || i} className="flex justify-center my-2">
                  <div className="max-w-[90%] rounded-xl px-3 py-2 text-xs bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 flex items-center gap-2">
                    <CheckCircle2 size={14} className="shrink-0" />
                    <span>{msg.content}</span>
                  </div>
                </div>
              );
            }

            return (
              <div key={msg.id || i} className={cn("flex flex-col gap-2", isUser ? "items-end" : "items-start")}>
                <div className={cn(
                  "max-w-[88%] md:max-w-[80%] rounded-2xl px-4 py-3 text-xs sm:text-sm leading-relaxed shadow-lg whitespace-pre-wrap transition-all",
                  isUser 
                    ? "bg-primary text-white font-medium rounded-tr-xs shadow-[0_4px_16px_rgba(255,107,0,0.2)]" 
                    : "bg-[#141418] text-zinc-100 rounded-tl-xs border border-zinc-800/80 shadow-md"
                )}>
                  {isUser ? (
                    msg.content
                  ) : (
                    <TypingMessage content={msg.content} timestamp={msg.timestamp} onScroll={scrollToBottom} />
                  )}
                </div>

                {/* Embedded Proposal Diff Card */}
                {msg.proposal && (
                  <div className="w-full max-w-[95%] md:max-w-[85%] mt-1">
                    <ProposalDiffCard 
                      proposal={msg.proposal}
                      currentWorkout={workouts.find(w => w.id === msg.proposal?.targetEntityId)}
                      onApprove={handleApproveProposal}
                      onDiscard={handleDiscardProposal}
                      onRebase={handleRebaseProposal}
                    />
                  </div>
                )}
              </div>
            );
          })}

          {/* Real-time Tool Status Indicator */}
          {loading && (
            <div className="flex justify-start">
              <div className="max-w-[85%] sm:max-w-[80%] rounded-2xl px-4 py-3 text-xs bg-[#141418] text-zinc-300 rounded-tl-xs border border-zinc-800 flex items-center gap-2.5 shadow-md">
                <BrainIcon size={15} className="text-primary animate-pulse shrink-0" />
                <span className="font-medium">
                  {toolStatus || "FORGE Brain is thinking..."}
                </span>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Prompt Input & Suggestions */}
        <div className="p-2 sm:p-3 md:p-4 border-t border-border bg-background/90 backdrop-blur-sm space-y-2 sm:space-y-3 shrink-0">
          {/* Quick Prompts Bar */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 no-scrollbar">
            {quickPrompts.map((qp, idx) => (
              <button
                key={idx}
                onClick={() => handleSend(qp.text)}
                disabled={loading}
                className="whitespace-nowrap px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-lg text-[11px] sm:text-xs font-medium bg-secondary/60 hover:bg-secondary text-foreground border border-border/50 transition-colors shrink-0 flex items-center gap-1"
              >
                <span>{qp.label}</span>
              </button>
            ))}
          </div>

          <div className="flex gap-1.5 sm:gap-2">
            <Input 
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleSend()}
              placeholder="Ask FORGE Brain to optimize..."
              disabled={loading}
              className="flex-1 bg-secondary/40 border-secondary focus:bg-background text-xs sm:text-sm h-9 sm:h-10"
            />
            <Button 
              size="icon" 
              onClick={() => handleSend()} 
              disabled={loading || !input.trim()}
              className="h-9 w-9 sm:h-10 sm:w-10 shrink-0 font-bold shadow-sm"
            >
              <Send size={15} />
            </Button>
          </div>
        </div>
      </Card>

      {/* Autonomy Modal */}
      <AutonomyModal 
        isOpen={isAutonomyModalOpen}
        onClose={() => setIsAutonomyModalOpen(false)}
        permissions={permissions}
        onUpdateAutonomy={handleUpdateAutonomy}
      />

      {/* Delete Single Thread Confirmation Modal */}
      {threadToDelete && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
          <div className="bg-card border border-destructive/30 rounded-2xl p-5 max-w-md w-full shadow-2xl space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center gap-3 text-destructive">
              <div className="p-2 rounded-xl bg-destructive/10">
                <AlertTriangle size={22} />
              </div>
              <div>
                <h3 className="font-bold text-base text-foreground">Delete Conversation?</h3>
                <p className="text-xs text-muted-foreground">This action will remove this chat session.</p>
              </div>
            </div>

            <div className="p-3 bg-secondary/30 rounded-xl border border-border/60 text-xs space-y-1">
              <div className="font-semibold text-foreground truncate">{threadToDelete.title}</div>
              <div className="text-muted-foreground">{threadToDelete.messages.length} messages in this thread</div>
            </div>

            <p className="text-xs text-muted-foreground leading-relaxed">
              Deleting this chat thread is permanent. Any proposed workout mutations will remain stored in your workouts.
            </p>

            <div className="flex gap-2 justify-end pt-1">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setThreadToDelete(null)}
                disabled={deletingThread}
                className="h-9 text-xs"
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => handleDeleteThread(threadToDelete)}
                disabled={deletingThread}
                className="h-9 text-xs font-bold gap-1.5 bg-destructive hover:bg-destructive/90"
              >
                <Trash2 size={14} />
                {deletingThread ? 'Deleting...' : 'Delete Chat'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Clear All Threads Confirmation Modal */}
      {showClearAllConfirm && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
          <div className="bg-card border border-destructive/30 rounded-2xl p-5 max-w-md w-full shadow-2xl space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center gap-3 text-destructive">
              <div className="p-2 rounded-xl bg-destructive/10">
                <AlertTriangle size={22} />
              </div>
              <div>
                <h3 className="font-bold text-base text-foreground">Clear All Conversations?</h3>
                <p className="text-xs text-muted-foreground">This will wipe all {threads.length} chat threads from your history.</p>
              </div>
            </div>

            <p className="text-xs text-muted-foreground leading-relaxed">
              Are you sure you want to delete all AI chat conversations? A fresh, empty session will be started for you.
            </p>

            <div className="flex gap-2 justify-end pt-1">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowClearAllConfirm(false)}
                disabled={deletingThread}
                className="h-9 text-xs"
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={handleClearAllThreads}
                disabled={deletingThread}
                className="h-9 text-xs font-bold gap-1.5 bg-destructive hover:bg-destructive/90"
              >
                <Trash2 size={14} />
                {deletingThread ? 'Clearing...' : 'Clear All'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
