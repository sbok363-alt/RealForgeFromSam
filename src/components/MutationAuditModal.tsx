import React, { useEffect, useState } from 'react';
import { MutationAuditLog, Workout } from '../types';
import { getMutationAuditLogs, undoMutation } from '../lib/api';
import { Button } from './ui/Button';
import { Card, CardContent } from './ui/Card';
import { History, RotateCcw, User, Brain, Cpu, ArrowRight, Check, AlertCircle, X } from 'lucide-react';
import { cn } from '../lib/utils';

interface MutationAuditModalProps {
  isOpen: boolean;
  onClose: () => void;
  userId: string;
  targetWorkout?: Workout | null;
  onWorkoutRestored?: (workout: Workout) => void;
}

export function MutationAuditModal({
  isOpen,
  onClose,
  userId,
  targetWorkout,
  onWorkoutRestored
}: MutationAuditModalProps) {
  const [logs, setLogs] = useState<MutationAuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [undoingId, setUndoingId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const fetchLogs = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const data = await getMutationAuditLogs(userId, targetWorkout?.id);
      setLogs(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchLogs();
    }
  }, [isOpen, userId, targetWorkout?.id]);

  if (!isOpen) return null;

  const handleUndo = async (log: MutationAuditLog) => {
    setUndoingId(log.id);
    setErrorMsg(null);
    try {
      const res = await undoMutation(log.id, userId);
      if (res.success && res.workout) {
        if (onWorkoutRestored) onWorkoutRestored(res.workout);
        await fetchLogs();
      } else {
        setErrorMsg(res.error || 'Failed to perform contiguous undo');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Error during mutation rollback');
    } finally {
      setUndoingId(null);
    }
  };

  const getActorBadge = (actor: string) => {
    switch (actor) {
      case 'AI_BRAIN':
        return (
          <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-primary/15 text-primary border border-primary/20">
            <Brain size={10} /> AI Brain
          </span>
        );
      case 'SYSTEM_AUTONOMOUS':
        return (
          <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/20">
            <Cpu size={10} /> Autonomous
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-secondary text-foreground border border-border">
            <User size={10} /> User Edit
          </span>
        );
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm animate-in fade-in">
      <div className="bg-card border border-border w-full max-w-xl rounded-2xl shadow-xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-5 border-b border-border flex items-center justify-between bg-secondary/20">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-primary/10 text-primary">
              <History size={20} />
            </div>
            <div>
              <h2 className="font-bold text-lg">Mutation Audit Trail</h2>
              <div className="text-xs text-muted-foreground">
                {targetWorkout ? `Targeting: ${targetWorkout.title} (Live v${targetWorkout.version})` : 'Append-Only History & Reversible Deltas'}
              </div>
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X size={18} />
          </Button>
        </div>

        {/* Content */}
        <div className="p-5 overflow-y-auto space-y-4">
          {errorMsg && (
            <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/30 text-destructive text-xs flex items-start gap-2">
              <AlertCircle size={15} className="shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          {loading ? (
            <div className="text-center py-10 text-muted-foreground text-sm">
              Loading audit records...
            </div>
          ) : logs.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground space-y-2">
              <History size={36} className="mx-auto opacity-30" />
              <p className="text-sm font-medium">No mutations recorded yet.</p>
              <p className="text-xs max-w-xs mx-auto">
                Every user edit, AI proposal execution, and autonomous adjustment is appended here with full undo capabilities.
              </p>
            </div>
          ) : (
            <div className="relative border-l-2 border-border/80 ml-3 pl-4 space-y-4">
              {logs.map((log, index) => {
                const isLatest = index === 0;
                const canUndo = targetWorkout ? targetWorkout.version === log.resultVersion : isLatest;

                return (
                  <div key={log.id} className="relative group">
                    {/* Timeline bullet */}
                    <div className={cn(
                      "absolute -left-[23px] top-1.5 w-3.5 h-3.5 rounded-full border-2 bg-card",
                      isLatest ? "border-primary bg-primary" : "border-muted-foreground/40"
                    )} />

                    <div className="bg-secondary/30 hover:bg-secondary/40 border border-border/50 rounded-xl p-3.5 space-y-2.5 transition-colors">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <div className="flex items-center gap-2">
                          {getActorBadge(log.actor)}
                          <span className="font-mono text-xs font-semibold px-2 py-0.5 rounded bg-background border border-border/60">
                            v{log.baseVersion} <ArrowRight size={10} className="inline mx-0.5" /> v{log.resultVersion}
                          </span>
                        </div>
                        <span className="text-[11px] text-muted-foreground">
                          {new Date(log.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} • {new Date(log.createdAt).toLocaleDateString()}
                        </span>
                      </div>

                      <div>
                        <p className="text-sm font-medium text-foreground">
                          {log.summary}
                        </p>
                      </div>

                      {/* Inverse Delta Snapshot */}
                      {log.inverseDelta && (
                        <div className="text-[11px] bg-background/60 p-2 rounded border border-border/40 font-mono text-muted-foreground">
                          <span className="text-primary font-semibold">Inverse Delta Available: </span>
                          <span>
                            {log.inverseDelta.sets ? `${log.inverseDelta.sets.length} sets snapshot` : 'State snapshot preserved'}
                          </span>
                        </div>
                      )}

                      {/* Undo Action */}
                      <div className="flex items-center justify-between pt-1">
                        <span className="text-[10px] text-muted-foreground font-mono">
                          ID: {log.id.slice(0, 8)}...
                        </span>
                        {canUndo ? (
                          <Button 
                            variant="outline" 
                            size="sm" 
                            className="h-7 text-xs hover:bg-primary hover:text-primary-foreground font-semibold"
                            onClick={() => handleUndo(log)}
                            disabled={undoingId === log.id}
                          >
                            <RotateCcw size={12} className="mr-1" />
                            {undoingId === log.id ? 'Rolling back...' : 'Undo Mutation'}
                          </Button>
                        ) : (
                          <span className="text-[10px] text-muted-foreground italic">
                            Non-contiguous (earlier step)
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-border bg-secondary/10 flex justify-between items-center text-xs text-muted-foreground">
          <span>Append-Only Concurrency Log</span>
          <Button variant="outline" size="sm" onClick={onClose}>Close</Button>
        </div>
      </div>
    </div>
  );
}
