import React from 'react';
import { MuscleGroup } from '../../lib/exercises';
import { VolumeAudioToggle } from './VolumeAudioToggle';

interface HoloScannerOverlayProps {
  active: boolean;
  selectedMuscle: MuscleGroup | null;
  hoveredMuscle: MuscleGroup | null;
  isDark?: boolean;
}

export const HoloScannerOverlay: React.FC<HoloScannerOverlayProps> = ({
  active,
  selectedMuscle,
  hoveredMuscle,
  isDark = true
}) => {
  if (!active) return null;

  const target = hoveredMuscle || selectedMuscle;

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden rounded-2xl z-10 select-none">
      {/* Laser Scanning Line Sweep */}
      <div className="absolute inset-x-0 h-1 bg-gradient-to-r from-transparent via-cyan-400 to-transparent shadow-[0_0_15px_#06b6d4] animate-holo-scan pointer-events-none opacity-80" />
      <div className="absolute inset-x-0 h-16 bg-gradient-to-b from-cyan-500/10 to-transparent animate-holo-scan pointer-events-none opacity-50" />

      {/* Cybernetic Tech Grid Backdrop */}
      <div 
        className="absolute inset-0 opacity-[0.07] pointer-events-none"
        style={{
          backgroundImage: isDark
            ? `radial-gradient(circle at 1px 1px, rgba(6,182,212,0.8) 1px, transparent 0)`
            : `radial-gradient(circle at 1px 1px, rgba(14,116,144,0.6) 1px, transparent 0)`,
          backgroundSize: '20px 20px'
        }}
      />

      {/* Corner Tech Calipers */}
      <div className="absolute top-2 left-2 w-3.5 h-3.5 border-t-2 border-l-2 border-cyan-500/60" />
      <div className="absolute top-2 right-2 w-3.5 h-3.5 border-t-2 border-r-2 border-cyan-500/60" />
      <div className="absolute bottom-2 left-2 w-3.5 h-3.5 border-b-2 border-l-2 border-cyan-500/60" />
      <div className="absolute bottom-2 right-2 w-3.5 h-3.5 border-b-2 border-r-2 border-cyan-500/60" />

      {/* Top HUD Telemetry Coordinates */}
      <div className="absolute top-2 left-7 text-[9px] font-mono text-cyan-400/80 tracking-widest uppercase flex items-center gap-2">
        <span className="inline-block w-1.5 h-1.5 rounded-full bg-cyan-400 animate-ping" />
        <span>SYS.BIOMETRIC.SCAN // HUD v3.8</span>
      </div>

      <div className="absolute top-2 right-7 text-[9px] font-mono text-cyan-400/80 tracking-wider">
        {target ? `LOCK: [${target}]` : 'STANDBY // OPTICAL TRACK'}
      </div>

      {/* Bottom Crosshairs */}
      <div className="absolute bottom-2 left-7 text-[9px] font-mono text-muted-foreground/60 tracking-wider">
        GRID: 240x510nm
      </div>
    </div>
  );
};
