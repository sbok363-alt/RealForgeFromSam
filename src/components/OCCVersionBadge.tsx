import React from 'react';
import { Layers } from 'lucide-react';
import { cn } from '../lib/utils';

interface OCCVersionBadgeProps {
  version: number;
  className?: string;
  onClick?: () => void;
  showIcon?: boolean;
}

export function OCCVersionBadge({
  version,
  className,
  onClick,
  showIcon = true
}: OCCVersionBadgeProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1 px-2 py-0.5 rounded font-mono text-[11px] font-semibold bg-secondary/80 text-foreground border border-border/60 transition-colors",
        onClick && "hover:bg-secondary cursor-pointer hover:border-primary/40",
        className
      )}
      title={`Optimistic Concurrency Control Version: ${version}`}
    >
      {showIcon && <Layers size={11} className="text-primary" />}
      <span>v{version}</span>
    </button>
  );
}
