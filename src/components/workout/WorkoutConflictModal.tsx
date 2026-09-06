import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Button } from '../ui/Button';
import { AlertTriangle, Dumbbell, Play } from 'lucide-react';
import { Workout } from '../../types';

interface WorkoutConflictModalProps {
  isOpen: boolean;
  activeWorkout: Workout;
  newWorkout: Workout;
  onCancel: () => void;
  onConfirm: () => void;
}

export function WorkoutConflictModal({
  isOpen,
  activeWorkout,
  newWorkout,
  onCancel,
  onConfirm
}: WorkoutConflictModalProps) {
  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs">
        <motion.div
          initial={{ scale: 0.94, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.94, opacity: 0 }}
          className="bg-card border border-border/80 rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-4 text-card-foreground"
        >
          <div className="flex items-start gap-3.5">
            <div className="p-2.5 rounded-xl bg-amber-500/15 text-amber-600 dark:text-amber-400 shrink-0">
              <AlertTriangle size={24} />
            </div>
            <div>
              <h3 className="font-bold text-lg text-foreground">
                Active Workout in Progress
              </h3>
              <p className="text-xs text-muted-foreground mt-1">
                You already have an active workout session running in the background.
              </p>
            </div>
          </div>

          <div className="space-y-2 bg-secondary/30 rounded-xl p-3.5 border border-border/40 text-xs">
            <div className="flex justify-between items-center text-muted-foreground pb-2 border-b border-border/40">
              <span>Current Session:</span>
              <strong className="text-foreground">{activeWorkout.title}</strong>
            </div>
            <div className="flex justify-between items-center text-muted-foreground pt-1">
              <span>New Session:</span>
              <strong className="text-primary">{newWorkout.title}</strong>
            </div>
          </div>

          <p className="text-xs text-muted-foreground leading-relaxed">
            Starting <strong>{newWorkout.title}</strong> will end and replace your currently running workout session. Do you wish to continue?
          </p>

          <div className="flex flex-col-reverse sm:flex-row gap-2 justify-end pt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={onCancel}
              className="font-semibold"
            >
              Keep Current Workout
            </Button>
            <Button
              variant="default"
              size="sm"
              onClick={onConfirm}
              className="bg-amber-600 hover:bg-amber-700 text-white font-bold gap-1.5"
            >
              <Play size={14} fill="currentColor" /> End & Start New
            </Button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
