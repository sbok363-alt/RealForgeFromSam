import React from 'react';
import { AutonomyLevel, UserPermissions } from '../types';
import { Button } from './ui/Button';
import { Card, CardContent } from './ui/Card';
import { Shield, Check, Lock, Zap, Cpu, Sparkles, X } from 'lucide-react';
import { cn } from '../lib/utils';

interface AutonomyModalProps {
  isOpen: boolean;
  onClose: () => void;
  permissions: UserPermissions;
  onUpdateAutonomy: (level: AutonomyLevel) => Promise<void>;
}

export function AutonomyModal({
  isOpen,
  onClose,
  permissions,
  onUpdateAutonomy
}: AutonomyModalProps) {
  if (!isOpen) return null;

  const levels: Array<{
    id: AutonomyLevel;
    title: string;
    badge: string;
    icon: any;
    desc: string;
    permissionsDesc: string[];
    color: string;
  }> = [
    {
      id: 'L0_READ_ONLY',
      title: 'L0: Read-Only Copilot',
      badge: 'L0 Read-Only',
      icon: Lock,
      desc: 'AI acts strictly in advisory mode. Reads historical sets, PRs, and volume trends, but produces zero executable proposals.',
      permissionsDesc: [
        'Read workout logs & personal records',
        'Answer fitness & form questions',
        'Proposals disabled'
      ],
      color: 'text-muted-foreground'
    },
    {
      id: 'L1_MICRO_ACTIONS',
      title: 'L1: Micro-Actions',
      badge: 'L1 Micro-Actions',
      icon: Sparkles,
      desc: 'AI can formulate granular in-session adjustments (+2.5kg load, +1 rep) for user approval before writing.',
      permissionsDesc: [
        'Propose weight & rep progressive overload',
        'Suggest set rest timer adjustments',
        'Requires 1-tap approval'
      ],
      color: 'text-blue-500'
    },
    {
      id: 'L2_GUIDED_AUTONOMY',
      title: 'L2: Guided Autonomy (Recommended)',
      badge: 'L2 Guided',
      icon: Shield,
      desc: 'AI formulates comprehensive workout modifications, volume ramps, and schedule adjustments with before/after diffs and OCC conflict protection.',
      permissionsDesc: [
        'Propose comprehensive workout restructure',
        'Reschedule & adjust exercise orders',
        'Generates full OCC diffs for explicit approval',
        'Reversible audit logs recorded on every action'
      ],
      color: 'text-primary'
    },
    {
      id: 'L3_FULL_AUTONOMY',
      title: 'L3: Full Autonomy',
      badge: 'L3 Full Autonomy',
      icon: Cpu,
      desc: 'AI can execute non-destructive micro-adjustments autonomously with an append-only audit trail, while queuing macro changes for review.',
      permissionsDesc: [
        'Automatic progressive overload increments',
        'Autonomous schedule sync & recovery de-loads',
        'Instant 1-click contiguous undo rollback available'
      ],
      color: 'text-amber-500'
    }
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm animate-in fade-in">
      <div className="bg-card border border-border w-full max-w-lg rounded-2xl shadow-xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-5 border-b border-border flex items-center justify-between bg-secondary/20">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-primary/10 text-primary">
              <Shield size={20} />
            </div>
            <div>
              <h2 className="font-bold text-lg">AI Autonomy & Safety Level</h2>
              <div className="text-xs text-muted-foreground">
                Permission Epoch: #{permissions.permissionEpoch || 1} • Strict User Control
              </div>
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X size={18} />
          </Button>
        </div>

        {/* Level Selector */}
        <div className="p-5 overflow-y-auto space-y-3">
          {levels.map((lvl) => {
            const Icon = lvl.icon;
            const isSelected = permissions.autonomyLevel === lvl.id;
            return (
              <div
                key={lvl.id}
                onClick={() => onUpdateAutonomy(lvl.id)}
                className={cn(
                  "p-4 rounded-xl border transition-all cursor-pointer relative",
                  isSelected 
                    ? "border-primary bg-primary/5 shadow-sm ring-1 ring-primary/30" 
                    : "border-border/60 hover:border-border hover:bg-secondary/20"
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <div className={cn("p-1.5 rounded-md bg-secondary", lvl.color)}>
                      <Icon size={16} />
                    </div>
                    <div>
                      <div className="font-semibold text-sm flex items-center gap-2">
                        {lvl.title}
                        {isSelected && (
                          <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-primary text-primary-foreground">
                            Active
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                        {lvl.desc}
                      </p>
                    </div>
                  </div>
                  {isSelected && (
                    <div className="w-5 h-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center shrink-0">
                      <Check size={12} strokeWidth={3} />
                    </div>
                  )}
                </div>

                <div className="mt-3 pt-2.5 border-t border-border/40 text-[11px] text-muted-foreground grid grid-cols-1 gap-1">
                  {lvl.permissionsDesc.map((p, i) => (
                    <div key={i} className="flex items-center gap-1.5">
                      <span className="w-1 h-1 rounded-full bg-primary shrink-0" />
                      <span>{p}</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-border bg-secondary/10 flex justify-end">
          <Button onClick={onClose}>Done</Button>
        </div>
      </div>
    </div>
  );
}
