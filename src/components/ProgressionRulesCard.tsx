import React, { useMemo, useState, useEffect } from 'react';
import { Card, CardContent } from './ui/Card';
import { Button } from './ui/Button';
import {
  loadRules,
  evaluateProgressionRules,
  RuleFireResult,
} from '../lib/progressionRules';
import { evaluateDeload } from '../lib/deload';
import { Workout } from '../types';
import { TrendingUp, Sparkles, ArrowRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface ProgressionRulesCardProps {
  userId: string;
  workouts: Workout[];
}

export function ProgressionRulesCard({ userId, workouts }: ProgressionRulesCardProps) {
  const navigate = useNavigate();
  const [fires, setFires] = useState<RuleFireResult[]>([]);

  useEffect(() => {
    // Don't push overload when a strong deload signal is active
    const deload = evaluateDeload(workouts);
    if (deload.shouldDeload && deload.confidence === 'high') {
      setFires([]);
      return;
    }
    const rules = loadRules(userId);
    setFires(evaluateProgressionRules(workouts, rules));
  }, [userId, workouts]);

  if (!fires.length) return null;

  return (
    <Card className="border-emerald-500/30 bg-gradient-to-br from-emerald-500/10 via-card to-card">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
            <TrendingUp size={16} />
          </div>
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
              Progression ready
            </p>
            <p className="text-sm font-bold">
              {fires.length} rule{fires.length > 1 ? 's' : ''} ready to apply
            </p>
          </div>
        </div>

        <div className="space-y-2">
          {fires.slice(0, 3).map((f) => (
            <div
              key={f.exercise}
              className="rounded-xl border border-border/50 bg-background/50 px-3 py-2.5 text-xs space-y-1"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold truncate">{f.exercise}</span>
                <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400 shrink-0">
                  {f.lastTop.weight} → {f.suggestedWeight} kg
                </span>
              </div>
              <p className="text-muted-foreground leading-snug">{f.reason}</p>
            </div>
          ))}
        </div>

        <Button
          size="sm"
          className="w-full h-10 text-xs font-bold gap-1.5"
          onClick={() => {
            const summary = fires
              .map(
                (f) =>
                  `${f.exercise}: ${f.lastTop.weight}kg → ${f.suggestedWeight}kg (${f.reason})`
              )
              .join('\n');
            navigate('/brain', {
              state: {
                autoPrompt: `Progression rules fired:\n${summary}\n\nCreate proposals to apply these load increases on the next planned sessions for each lift. Keep OCC — propose only, do not silent-write.`,
              },
            });
          }}
        >
          <Sparkles size={14} />
          Ask Brain to propose these
          <ArrowRight size={14} />
        </Button>
      </CardContent>
    </Card>
  );
}
