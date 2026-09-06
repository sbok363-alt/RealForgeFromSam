import React from 'react';
import { AutonomyLevel } from '../types';
import { Shield, Sparkles, Lock, Cpu } from 'lucide-react';
import { cn } from '../lib/utils';

interface AutonomyBadgeProps {
  level: AutonomyLevel;
  onClick?: () => void;
  className?: string;
}

export function AutonomyBadge({ level, onClick, className }: AutonomyBadgeProps) {
  const configs: Record<AutonomyLevel, { label: string; icon: any; color: string }> = {
    'L0_READ_ONLY': {
      label: 'L0 Read-Only',
      icon: Lock,
      color: 'bg-secondary text-muted-foreground border-border'
    },
    'L1_MICRO_ACTIONS': {
      label: 'L1 Micro-Actions',
      icon: Sparkles,
      color: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20'
    },
    'L2_GUIDED_AUTONOMY': {
      label: 'L2 Guided Autonomy',
      icon: Shield,
      color: 'bg-primary/10 text-primary border-primary/20'
    },
    'L3_FULL_AUTONOMY': {
      label: 'L3 Full Autonomy',
      icon: Cpu,
      color: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20'
    }
  };

  const config = configs[level] || configs['L2_GUIDED_AUTONOMY'];
  const Icon = config.icon;

  return (
    <button
      onClick={onClick}
      type="button"
      className={cn(
        "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border transition-all cursor-pointer hover:opacity-90 active:scale-95 shadow-2xs",
        config.color,
        className
      )}
      title="Click to adjust AI Autonomy Level"
    >
      <Icon size={12} />
      <span>{config.label}</span>
    </button>
  );
}
