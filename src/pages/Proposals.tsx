import React, { useState, useEffect } from 'react';
import { Proposal, Workout } from '../types';
import { useAuthStore } from '../store/useAuthStore';
import { 
  getProposals, 
  getWorkouts, 
  executeProposal, 
  discardProposal 
} from '../lib/api';
import { ProposalDiffCard } from '../components/ProposalDiffCard';
import { Button } from '../components/ui/Button';
import { Card, CardContent, CardHeader } from '../components/ui/Card';
import { Skeleton } from '../components/ui/Skeleton';
import { 
  Sparkles, 
  CheckCircle2, 
  Clock, 
  AlertTriangle, 
  XCircle, 
  Layers, 
  ArrowRight,
  Brain
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { cn } from '../lib/utils';

export default function Proposals() {
  const { user } = useAuthStore();
  const navigate = useNavigate();

  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [workouts, setWorkouts] = useState<Workout[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>('ALL');

  const fetchData = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const pList = await getProposals(user.uid);
      const wList = await getWorkouts(user.uid);
      setProposals(pList);
      setWorkouts(wList);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [user]);

  const handleApprove = async (proposalId: string) => {
    if (!user) return;
    const res = await executeProposal(proposalId, user.uid, 'USER');
    if (res.success) {
      await fetchData();
    } else {
      throw new Error(res.error || "Failed to execute proposal");
    }
  };

  const handleDiscard = async (proposalId: string) => {
    if (!user) return;
    await discardProposal(proposalId, user.uid);
    await fetchData();
  };

  const handleRebase = (proposal: Proposal) => {
    navigate('/brain', { state: { targetWorkoutId: proposal.targetEntityId } });
  };

  const filteredProposals = proposals.filter(p => {
    if (filter === 'ALL') return true;
    return p.status === filter;
  });

  const pendingCount = proposals.filter(p => p.status === 'PENDING_APPROVAL').length;
  const conflictCount = proposals.filter(p => p.status === 'REJECTED_CONFLICT').length;

  return (
    <div className="space-y-6 max-w-4xl mx-auto pb-12">
      {/* Header */}
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl md:text-3xl font-display font-bold">Coach Recommendations</h1>
            {pendingCount > 0 && (
              <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-primary text-primary-foreground">
                {pendingCount} waiting
              </span>
            )}
          </div>
          <p className="text-muted-foreground text-sm mt-1">
            FORGE never changes your plan alone. Review each recommendation, then accept or dismiss.
          </p>
        </div>

        <Button 
          onClick={() => navigate('/brain')}
          className="text-xs font-semibold gap-1.5 shrink-0"
        >
          <Brain size={15} /> Ask for a new one
        </Button>
      </header>

      {/* Filter Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 border-b border-border text-xs">
        {[
          { id: 'ALL', label: `All (${proposals.length})` },
          { id: 'PENDING_APPROVAL', label: `Needs you (${pendingCount})` },
          { id: 'EXECUTED', label: `Accepted (${proposals.filter(p => p.status === 'EXECUTED').length})` },
          { id: 'REJECTED_CONFLICT', label: `Conflicts (${conflictCount})` },
          { id: 'DISCARDED', label: `Dismissed (${proposals.filter(p => p.status === 'DISCARDED').length})` }
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setFilter(tab.id)}
            className={cn(
              "px-3 py-1.5 rounded-lg font-semibold transition-colors whitespace-nowrap",
              filter === tab.id 
                ? "bg-primary text-primary-foreground" 
                : "text-muted-foreground hover:bg-secondary"
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Proposals Stream */}
      {loading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((n) => (
            <Card key={n} className="border border-border/70 overflow-hidden shadow-sm">
              {/* Header Skeleton */}
              <CardHeader className="p-4 bg-secondary/30 border-b border-border/50 flex flex-row items-center justify-between gap-2">
                <div className="flex items-center gap-2.5 min-w-0 flex-1">
                  <Skeleton className="h-8 w-8 rounded-md shrink-0" />
                  <div className="space-y-1.5 flex-1 min-w-0">
                    <Skeleton className="h-4 w-48 max-w-[220px]" />
                    <div className="flex items-center gap-2">
                      <Skeleton className="h-3 w-20" />
                      <Skeleton className="h-3 w-16" />
                    </div>
                  </div>
                </div>
                <Skeleton className="h-6 w-28 rounded-full shrink-0" />
              </CardHeader>

              <CardContent className="p-4 space-y-4">
                {/* Summary / Rationale Skeleton */}
                <div className="bg-secondary/20 rounded-lg p-3 border border-border/40 space-y-2">
                  <Skeleton className="h-3 w-32" />
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-4/5" />
                </div>

                {/* Diff Set Rows Skeleton */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between p-2.5 rounded-md bg-secondary/20 border border-border/40">
                    <Skeleton className="h-4 w-36" />
                    <div className="flex items-center gap-2">
                      <Skeleton className="h-5 w-20 rounded" />
                      <Skeleton className="h-4 w-4" />
                      <Skeleton className="h-5 w-20 rounded" />
                    </div>
                  </div>
                  <div className="flex items-center justify-between p-2.5 rounded-md bg-secondary/20 border border-border/40">
                    <Skeleton className="h-4 w-40" />
                    <div className="flex items-center gap-2">
                      <Skeleton className="h-5 w-20 rounded" />
                      <Skeleton className="h-4 w-4" />
                      <Skeleton className="h-5 w-20 rounded" />
                    </div>
                  </div>
                </div>

                {/* Action Buttons Skeleton */}
                <div className="pt-2 flex flex-col sm:flex-row gap-2">
                  <Skeleton className="h-9 flex-1 rounded-md" />
                  <Skeleton className="h-9 sm:w-28 rounded-md" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : filteredProposals.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground space-y-3 bg-secondary/10 rounded-2xl border border-dashed border-border p-8">
          <Sparkles size={36} className="mx-auto opacity-30 text-primary" />
          <h3 className="font-semibold text-base text-foreground">No proposals found</h3>
          <p className="text-xs max-w-sm mx-auto">
            When FORGE Brain recommends progressive overload or adjustments, its structured diff proposals will appear here for your approval.
          </p>
          <Button size="sm" onClick={() => navigate('/brain')}>
            Chat with FORGE Brain
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredProposals.map(proposal => {
            const targetWorkout = workouts.find(w => w.id === proposal.targetEntityId);

            return (
              <ProposalDiffCard 
                key={proposal.id}
                proposal={proposal}
                currentWorkout={targetWorkout}
                onApprove={handleApprove}
                onDiscard={handleDiscard}
                onRebase={handleRebase}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
