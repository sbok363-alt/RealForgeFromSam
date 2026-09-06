import React from 'react';
import { motion } from 'motion/react';
import { Button } from './ui/Button';
import { CheckCircle2, TrendingUp, Medal, Star } from 'lucide-react';
import { Workout } from '../types';

interface WorkoutCelebrationProps {
  workout: Workout;
  onClose: () => void;
}

export function WorkoutCelebration({ workout, onClose }: WorkoutCelebrationProps) {
  const totalVolume = (workout.sets || []).reduce((sum, s) => sum + (s.weight * s.reps), 0);
  const totalSets = (workout.sets || []).filter(s => s.completed).length;

  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      transition={{ type: "spring", damping: 25, stiffness: 300 }}
      className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-background/95 backdrop-blur-md"
    >
      <div className="bg-card w-full max-w-md p-8 rounded-3xl border border-border shadow-[0_0_50px_-12px_rgba(16,185,129,0.3)] flex flex-col items-center text-center relative overflow-hidden">
        {/* Background glow */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-emerald-500/20 blur-3xl rounded-full pointer-events-none" />

        <motion.div 
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: "spring", delay: 0.1, bounce: 0.5 }}
          className="w-20 h-20 bg-emerald-500 rounded-full flex items-center justify-center text-white mb-6 shadow-xl shadow-emerald-500/30"
        >
          <CheckCircle2 size={40} />
        </motion.div>

        <h2 className="text-3xl font-display font-black mb-2 text-foreground">Workout Complete!</h2>
        <p className="text-muted-foreground mb-8 font-medium">Excellent work pushing your limits today.</p>

        <div className="grid grid-cols-2 gap-4 w-full mb-8">
          <motion.div 
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.2 }}
            className="bg-secondary/50 p-4 rounded-2xl border border-border/50 flex flex-col items-center justify-center"
          >
            <span className="text-muted-foreground text-xs font-bold uppercase tracking-wider mb-1">Volume</span>
            <span className="text-2xl font-mono font-black text-foreground">{totalVolume.toLocaleString()} kg</span>
          </motion.div>
          
          <motion.div 
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.3 }}
            className="bg-secondary/50 p-4 rounded-2xl border border-border/50 flex flex-col items-center justify-center"
          >
            <span className="text-muted-foreground text-xs font-bold uppercase tracking-wider mb-1">Sets Completed</span>
            <span className="text-2xl font-mono font-black text-foreground">{totalSets}</span>
          </motion.div>
        </div>

        {/* PR / Rank Badge Placeholder */}
        <motion.div 
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.4 }}
          className="w-full bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-transparent border border-amber-500/20 rounded-2xl p-4 mb-8 flex items-center gap-4 text-left"
        >
          <div className="w-12 h-12 rounded-xl bg-amber-500/20 text-amber-500 flex items-center justify-center shrink-0">
            <Medal size={24} />
          </div>
          <div className="flex-1">
            <div className="text-sm font-bold text-amber-600 dark:text-amber-400 mb-1 flex items-center gap-1.5">
              <Star size={12} className="fill-current" /> Bronze Tier III
            </div>
            <div className="w-full h-2 bg-secondary rounded-full overflow-hidden">
              <motion.div 
                initial={{ width: '45%' }}
                animate={{ width: '65%' }}
                transition={{ delay: 0.8, duration: 1, ease: "easeOut" }}
                className="h-full bg-amber-500 rounded-full"
              />
            </div>
            <div className="text-[10px] text-muted-foreground mt-1.5 font-medium">+150 XP for Progressive Overload</div>
          </div>
        </motion.div>

        <Button 
          size="lg" 
          className="w-full font-bold h-12 bg-foreground text-background hover:bg-foreground/90"
          onClick={onClose}
        >
          Continue
        </Button>
      </div>
    </motion.div>
  );
}
