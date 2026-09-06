import React, { useState, useEffect } from 'react';
import { MutationAuditLog, Workout } from '../types';
import { useAuthStore } from '../store/useAuthStore';
import { getMutationAuditLogs, getWorkouts, undoMutation } from '../lib/api';
import { Button } from '../components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card';
import { 
  History, 
  RotateCcw, 
  User, 
  Brain, 
  Cpu, 
  ArrowRight, 
  AlertCircle, 
  CheckCircle2, 
  ShieldCheck,
  Layers,
  Calendar
} from 'lucide-react';
import { cn } from '../lib/utils';

export default function AuditLogsPage() {
  const { user } = useAuthStore();
  const [logs, setLogs] = useState<MutationAuditLog[]>([]);
  const [workouts, setWorkouts] = useState<Workout[]>([]);
  const [loading, setLoading] = useState(true);
  const [undoingId, setUndoingId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [actorFilter, setActorFilter] = useState<string>('ALL');

  const fetchData = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const l = await getMutationAuditLogs(user.uid);
      const w = await getWorkouts(user.uid);
      setLogs(l);
      setWorkouts(w);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [user]);

  const handleUndo = async (log: MutationAuditLog) => {
    if (!user) return;
    setUndoingId(log.id);
    setMessage(null);
    try {
      const res = await undoMutation(log.id, user.uid);
      if (res.success) {
        setMessage({
          type: 'success',
          text: `Successfully rolled back mutation! ${res.workout?.title || 'Workout'} restored to OCC v${res.workout?.version}.`
        });
        await fetchData();
      } else {
        setMessage({
          type: 'error',
          text: res.error || 'Failed to perform contiguous rollback'
        });
      }
    } catch (err: any) {
      setMessage({
        type: 'error',
        text: err.message || 'Error rolling back'
      });
    } finally {
      setUndoingId(null);
    }
  };

  const getActorBadge = (actor: string) => {
    switch (actor) {
      case 'AI_BRAIN':
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-primary/15 text-primary border border-primary/20">
            <Brain size={11} /> AI Brain
          </span>
        );
      case 'SYSTEM_AUTONOMOUS':
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/20">
            <Cpu size={11} /> Autonomous
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-secondary text-foreground border border-border">
            <User size={11} /> User Edit
          </span>
        );
    }
  };

  const filteredLogs = logs.filter(l => {
    if (actorFilter === 'ALL') return true;
    return l.actor === actorFilter;
  });

  return (
    <div className="space-y-6 max-w-4xl mx-auto pb-12">
      {/* Header */}
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl md:text-3xl font-display font-bold">Mutation Audit Trail</h1>
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
              <ShieldCheck size={13} /> Append-Only
            </span>
          </div>
          <p className="text-muted-foreground text-sm mt-1">
            Complete cryptographic audit log of all manual edits, AI proposals, and autonomous adjustments with contiguous rollback support.
          </p>
        </div>
      </header>

      {/* Message Banner */}
      {message && (
        <div className={cn(
          "p-4 rounded-xl text-sm flex items-start gap-2.5 border",
          message.type === 'success' ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-300" : "bg-destructive/10 border-destructive/30 text-destructive"
        )}>
          {message.type === 'success' ? <CheckCircle2 size={18} className="shrink-0 mt-0.5" /> : <AlertCircle size={18} className="shrink-0 mt-0.5" />}
          <span>{message.text}</span>
        </div>
      )}

      {/* Filter Tabs */}
      <div className="flex items-center gap-2 border-b border-border pb-2 text-xs">
        <button
          onClick={() => setActorFilter('ALL')}
          className={cn(
            "px-3 py-1.5 rounded-lg font-semibold transition-colors",
            actorFilter === 'ALL' ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-secondary"
          )}
        >
          All Actors ({logs.length})
        </button>
        <button
          onClick={() => setActorFilter('AI_BRAIN')}
          className={cn(
            "px-3 py-1.5 rounded-lg font-semibold transition-colors",
            actorFilter === 'AI_BRAIN' ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-secondary"
          )}
        >
          AI Brain ({logs.filter(l => l.actor === 'AI_BRAIN').length})
        </button>
        <button
          onClick={() => setActorFilter('USER')}
          className={cn(
            "px-3 py-1.5 rounded-lg font-semibold transition-colors",
            actorFilter === 'USER' ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-secondary"
          )}
        >
          User Edits ({logs.filter(l => l.actor === 'USER').length})
        </button>
      </div>

      {/* Audit Log Timeline */}
      {loading ? (
        <div className="text-center py-16 text-muted-foreground text-sm">
          Loading audit entries...
        </div>
      ) : filteredLogs.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground space-y-3 bg-secondary/10 rounded-2xl border border-dashed border-border p-8">
          <History size={40} className="mx-auto opacity-30 text-primary" />
          <h3 className="font-semibold text-base text-foreground">No audit entries recorded</h3>
          <p className="text-xs max-w-sm mx-auto">
            Every workout set modification or AI proposal approval records an immutable record here with full inverse delta snapshots.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredLogs.map((log) => {
            const targetWorkout = workouts.find(w => w.id === log.targetEntityId);
            const isContiguousLatest = targetWorkout ? targetWorkout.version === log.resultVersion : false;

            return (
              <Card 
                key={log.id} 
                className="overflow-hidden border border-border/70 shadow-2xs hover:border-border transition-colors"
              >
                <CardHeader className="p-4 bg-secondary/20 border-b border-border/40 pb-3 flex flex-row items-center justify-between gap-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    {getActorBadge(log.actor)}
                    <span className="font-mono text-xs font-semibold px-2 py-0.5 rounded bg-background border border-border/60">
                      v{log.baseVersion} <ArrowRight size={10} className="inline mx-0.5 text-primary" /> v{log.resultVersion}
                    </span>
                    <span className="text-xs font-semibold text-foreground truncate max-w-[200px]">
                      {targetWorkout?.title || `Workout (${log.targetEntityId.slice(0, 8)})`}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Calendar size={12} />
                    <span>{new Date(log.createdAt).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}</span>
                  </div>
                </CardHeader>

                <CardContent className="p-4 space-y-3">
                  <p className="text-sm font-medium text-foreground">
                    {log.summary}
                  </p>

                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2 border-t border-border/40 text-xs">
                    <div className="font-mono text-[11px] text-muted-foreground">
                      <span>Log ID: {log.id}</span>
                      {log.proposalId && (
                        <span className="ml-2">• Proposal: {log.proposalId.slice(0, 8)}...</span>
                      )}
                    </div>

                    <div>
                      {isContiguousLatest ? (
                        <Button 
                          size="sm" 
                          variant="outline"
                          className="h-8 text-xs font-semibold hover:bg-primary hover:text-primary-foreground transition-all"
                          onClick={() => handleUndo(log)}
                          disabled={undoingId === log.id}
                        >
                          <RotateCcw size={13} className="mr-1.5" />
                          {undoingId === log.id ? 'Rolling back...' : `Rollback to v${log.baseVersion}`}
                        </Button>
                      ) : (
                        <span className="text-muted-foreground text-[11px] italic">
                          Locked (interim mutations applied)
                        </span>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
