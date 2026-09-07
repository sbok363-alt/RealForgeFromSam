import React, { useMemo } from 'react';
import { Card, CardContent } from './ui/Card';
import { Button } from './ui/Button';
import { evaluateDeload } from '../lib/deload';
import { Workout } from '../types';
import { AlertTriangle, Sparkles, ArrowRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { cn } from '../lib/utils';

interface DeloadCardProps {
  workouts: Workout[];
}

export function DeloadCard({ workouts }: DeloadCardProps) {
  const navigate = useNavigate();
  const rec = useMemo(() => evaluateDeload(workouts), [workouts]);

  if (!rec.shouldDeload) return null;

  return (
    <Card
      className={cn(
        'border overflow-hidden',
        rec.confidence === 'high' && 'border-amber-500/40 bg-gradient-to-br from-amber-500/15 via-card to-card',
        rec.confidence === 'medium' && 'border-amber-500/30 bg-gradient-to-br from-amber-500/10 via-card to-card',
        rec.confidence === 'low' && 'border-border bg-card'
      )}
    >
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-xl bg-amber-500/15 text-amber-600 dark:text-amber-400 shrink-0">
            <AlertTriangle size={18} />
          </div>
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400">
              Deload · {rec.confidence} confidence
            </p>
            <h3 className="font-bold text-sm leading-snug">{rec.headline}</h3>
          </div>
        </div>

        <p className="text-sm text-foreground/90 leading-relaxed">{rec.coachNote}</p>

        {rec.reasons.length > 0 && (
          <ul className="space-y-1">
            {rec.reasons.map((r, i) => (
              <li key={i} className="text-xs text-muted-foreground flex gap-2">
                <span className="text-amber-500 shrink-0">•</span>
                <span>{r}</span>
              </li>
            ))}
          </ul>
        )}

        {rec.affectedLifts.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {rec.affectedLifts.map((lift) => (
              <span
                key={lift}
                className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-secondary border border-border"
              >
                {lift}
              </span>
            ))}
          </div>
        )}

        <Button
          size="sm"
          className="w-full h-10 text-xs font-bold gap-1.5 bg-amber-600 hover:bg-amber-700 text-white"
          onClick={() => {
            navigate('/brain', {
              state: {
                autoPrompt: `Deload recommended (${rec.confidence} confidence). Reasons: ${rec.reasons.join(' ')} Affected: ${rec.affectedLifts.join(', ')}. Propose a ${rec.durationDays}-day deload: cut volume ~${rec.volumeCutPct}% and loads ~${rec.loadCutPct}% on planned sessions. OCC only — create proposals, do not silent-write.`,
              },
            });
          }}
        >
          <Sparkles size={14} />
          Ask Brain for deload proposals
          <ArrowRight size={14} />
        </Button>
      </CardContent>
    </Card>
  );
}
