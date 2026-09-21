import React from 'react';
import { MuscleGroup } from '../../lib/exercises';
import { Sparkles, ArrowRight, ShieldAlert, Cpu } from 'lucide-react';
import { cn } from '../../lib/utils';

interface KineticSynergyBadgeProps {
  muscle: MuscleGroup;
  className?: string;
}

interface MuscleBiomechanicalData {
  agonist: string;
  synergists: { name: string; pct: number }[];
  antagonist: string;
  primaryDriver: string;
}

const KINETIC_DATA: Record<MuscleGroup, MuscleBiomechanicalData> = {
  CHEST: {
    agonist: 'Pectoralis Major (Clavicular & Sternal)',
    synergists: [
      { name: 'Anterior Deltoids', pct: 60 },
      { name: 'Triceps Brachii', pct: 50 },
      { name: 'Serratus Anterior', pct: 30 }
    ],
    antagonist: 'Latissimus Dorsi & Rhomboids',
    primaryDriver: 'Horizontal Adduction / Press'
  },
  BACK: {
    agonist: 'Latissimus Dorsi, Trapezius & Rhomboids',
    synergists: [
      { name: 'Biceps Brachii', pct: 65 },
      { name: 'Posterior Deltoids', pct: 55 },
      { name: 'Forearms / Brachioradialis', pct: 40 }
    ],
    antagonist: 'Pectoralis Major',
    primaryDriver: 'Vertical & Horizontal Pull'
  },
  SHOULDERS: {
    agonist: 'Deltoids (Anterior, Lateral, Posterior)',
    synergists: [
      { name: 'Upper Trapezius', pct: 60 },
      { name: 'Triceps Brachii (Overhead)', pct: 45 },
      { name: 'Rotator Cuff (Supraspinatus)', pct: 40 }
    ],
    antagonist: 'Latissimus Dorsi',
    primaryDriver: 'Vertical Abduction & Elevation'
  },
  LEGS: {
    agonist: 'Quadriceps, Hamstrings, Gluteus Maximus',
    synergists: [
      { name: 'Adductor Magnus', pct: 55 },
      { name: 'Erector Spinae', pct: 50 },
      { name: 'Gastrocnemius & Soleus', pct: 40 }
    ],
    antagonist: 'Quadriceps vs. Hamstrings Ratio',
    primaryDriver: 'Triple Extension (Hip/Knee/Ankle)'
  },
  ARMS: {
    agonist: 'Biceps Brachii & Triceps Brachii',
    synergists: [
      { name: 'Brachialis', pct: 70 },
      { name: 'Brachioradialis', pct: 55 },
      { name: 'Wrist Flexors / Extensors', pct: 45 }
    ],
    antagonist: 'Biceps vs. Triceps Reciprocal Pair',
    primaryDriver: 'Elbow Flexion & Extension'
  },
  CORE: {
    agonist: 'Rectus Abdominis, Transverse Abdominis, Obliques',
    synergists: [
      { name: 'Quadratus Lumborum', pct: 50 },
      { name: 'Iliopsoas', pct: 40 },
      { name: 'Gluteal Complex', pct: 35 }
    ],
    antagonist: 'Erector Spinae & Lumbar Extensors',
    primaryDriver: 'Anti-Extension, Anti-Rotation & Flexion'
  },
  FULL_BODY: {
    agonist: 'Compound Kinetic Chain',
    synergists: [
      { name: 'Core Stabilizers', pct: 80 },
      { name: 'Posterior Chain', pct: 80 }
    ],
    antagonist: 'Global Antagonist Pairs',
    primaryDriver: 'Total System Power'
  }
};

export const KineticSynergyBadge: React.FC<KineticSynergyBadgeProps> = ({ muscle, className }) => {
  const data = KINETIC_DATA[muscle];
  if (!data) return null;

  return (
    <div className={cn("p-3 rounded-xl bg-secondary/30 border border-border/60 text-xs space-y-2", className)}>
      <div className="flex items-center justify-between">
        <span className="font-bold text-foreground flex items-center gap-1.5">
          <Cpu size={13} className="text-[#FF7A32]" />
          Kinetic Synergies & Co-Activation
        </span>
        <span className="text-[10px] font-mono text-[#FF7A32] font-semibold px-1.5 py-0.2 rounded bg-[#FF7A32]/10 border border-[#FF7A32]/20">
          {data.primaryDriver}
        </span>
      </div>

      <div className="space-y-1.5 font-mono text-[11px]">
        <div className="flex items-center justify-between text-muted-foreground">
          <span>Agonist:</span>
          <span className="text-foreground font-semibold">{data.agonist}</span>
        </div>

        <div className="space-y-1 pt-1 border-t border-border/40">
          <span className="text-muted-foreground block text-[10px] uppercase font-bold tracking-wider">
            Primary Synergists:
          </span>
          <div className="grid grid-cols-1 gap-1">
            {data.synergists.map(syn => (
              <div key={syn.name} className="flex items-center justify-between">
                <span className="text-muted-foreground flex items-center gap-1">
                  <ArrowRight size={10} className="text-[#FF7A32]" /> {syn.name}
                </span>
                <span className="text-[#FF7A32] font-bold">~{syn.pct}% load</span>
              </div>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between pt-1 border-t border-border/40 text-[10px] text-muted-foreground">
          <span>Antagonist Balance:</span>
          <span className="text-foreground/80 font-sans">{data.antagonist}</span>
        </div>
      </div>
    </div>
  );
};
