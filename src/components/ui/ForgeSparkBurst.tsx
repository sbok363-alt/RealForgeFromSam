import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';

interface ForgeSparkBurstProps {
  active: boolean;
  onComplete?: () => void;
}

interface Spark {
  id: number;
  x: number;
  y: number;
  scale: number;
  color: string;
  delay: number;
}

export function ForgeSparkBurst({ active, onComplete }: ForgeSparkBurstProps) {
  const [sparks, setSparks] = useState<Spark[]>([]);

  useEffect(() => {
    if (!active) return;

    const colors = ['#f59e0b', '#f97316', '#06b6d4', '#10b981', '#fbbf24'];
    const newSparks: Spark[] = Array.from({ length: 14 }).map((_, i) => {
      const angle = (i / 14) * 2 * Math.PI + (Math.random() - 0.5) * 0.4;
      const distance = Math.random() * 45 + 25;
      return {
        id: i,
        x: Math.cos(angle) * distance,
        y: Math.sin(angle) * distance,
        scale: Math.random() * 0.6 + 0.5,
        color: colors[Math.floor(Math.random() * colors.length)],
        delay: Math.random() * 0.05
      };
    });

    setSparks(newSparks);
    const timer = setTimeout(() => {
      setSparks([]);
      onComplete?.();
    }, 700);

    return () => clearTimeout(timer);
  }, [active, onComplete]);

  return (
    <AnimatePresence>
      {sparks.length > 0 && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none overflow-visible z-20">
          {/* Radial shockwave */}
          <motion.div
            initial={{ scale: 0.2, opacity: 0.9 }}
            animate={{ scale: 2.2, opacity: 0 }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
            className="absolute w-12 h-12 rounded-full border-2 border-cyan-400 bg-cyan-400/20 shadow-[0_0_15px_rgba(6,182,212,0.8)]"
          />

          {/* Flying embers */}
          {sparks.map((spark) => (
            <motion.div
              key={spark.id}
              initial={{ x: 0, y: 0, scale: spark.scale, opacity: 1 }}
              animate={{
                x: spark.x,
                y: spark.y,
                scale: 0,
                opacity: 0
              }}
              transition={{
                duration: 0.55,
                ease: 'easeOut',
                delay: spark.delay
              }}
              style={{ backgroundColor: spark.color }}
              className="absolute w-2 h-2 rounded-full shadow-[0_0_8px_currentColor]"
            />
          ))}

          {/* Floating +1 Locked Badge */}
          <motion.div
            initial={{ opacity: 0, y: 0, scale: 0.7 }}
            animate={{ opacity: [0, 1, 1, 0], y: -28, scale: 1 }}
            transition={{ duration: 0.65, times: [0, 0.2, 0.8, 1] }}
            className="absolute font-black font-mono text-[11px] tracking-wider text-emerald-400 drop-shadow-[0_0_8px_rgba(16,185,129,0.9)] uppercase px-2 py-0.5 rounded-full bg-black/80 border border-emerald-500/50"
          >
            +1 SET LOCKED
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
