import React, { useState } from 'react';
import { Volume2, VolumeX } from 'lucide-react';
import { soundFx } from '../../lib/soundFx';
import { cn } from '../../lib/utils';

export const VolumeAudioToggle: React.FC<{ className?: string }> = ({ className }) => {
  const [enabled, setEnabled] = useState(() => soundFx.isEnabled());

  const handleToggle = () => {
    const next = soundFx.toggle();
    setEnabled(next);
  };

  return (
    <button
      onClick={handleToggle}
      className={cn(
        "p-1.5 rounded-lg border transition-all flex items-center gap-1 text-xs font-mono",
        enabled 
          ? "bg-[#FF7A32]/10 border-[#FF7A32]/30 text-[#FF7A32] hover:bg-[#FF7A32]/20" 
          : "bg-secondary/40 border-border/50 text-muted-foreground hover:text-foreground",
        className
      )}
      title={enabled ? "Sound FX Enabled (Click to Mute)" : "Sound FX Muted (Click to Enable)"}
    >
      {enabled ? (
        <>
          <Volume2 size={13} className="animate-pulse" />
          <span className="hidden sm:inline text-[10px]">SFX</span>
        </>
      ) : (
        <>
          <VolumeX size={13} />
          <span className="hidden sm:inline text-[10px]">Mute</span>
        </>
      )}
    </button>
  );
};
