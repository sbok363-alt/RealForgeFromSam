import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { Workout, WorkoutSetItem } from '../../types';
import { useWorkoutStore } from '../../store/useWorkoutStore';
import { useAuthStore } from '../../store/useAuthStore';

interface WorkoutSessionContextType {
  activeWorkout: Workout | null;
  isModalOpen: boolean;
  startedAt: number | null;
  elapsedSeconds: number;
  restTimeLeft: number;
  isResting: boolean;
  startWorkout: (workout: Workout) => void;
  resumeWorkout: () => void;
  pauseWorkout: () => void;
  finishWorkout: () => void;
  discardWorkout: () => void;
  updateSet: (setId: string, updates: Partial<WorkoutSetItem>) => void;
  addSet: (setItem: WorkoutSetItem) => void;
  removeSet: (setId: string) => void;
  setRestTimer: (seconds: number) => void;
  clearRestTimer: () => void;
}

const WorkoutSessionContext = createContext<WorkoutSessionContextType | undefined>(undefined);

export function WorkoutSessionProvider({ children }: { children: React.ReactNode }) {
  const {
    activeWorkout,
    isModalOpen,
    startedAt,
    restEndTime,
    startWorkout: startInStore,
    openWorkoutModal,
    closeWorkoutModal,
    updateSetItem,
    addSetItem,
    removeSetItem,
    finishWorkout: finishInStore,
    discardWorkout: discardInStore,
    setRestTimer: setRestInStore,
    clearRestTimer: clearRestInStore
  } = useWorkoutStore();

  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [restTimeLeft, setRestTimeLeft] = useState(0);

  // Background timer ticker
  useEffect(() => {
    if (!activeWorkout || !startedAt) {
      setElapsedSeconds(0);
      return;
    }

    const calcElapsed = () => Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
    setElapsedSeconds(calcElapsed());

    const interval = setInterval(() => {
      setElapsedSeconds(calcElapsed());
    }, 1000);

    return () => clearInterval(interval);
  }, [activeWorkout, startedAt]);

  // Rest timer ticker
  useEffect(() => {
    if (!restEndTime) {
      setRestTimeLeft(0);
      return;
    }

    const calcRest = () => {
      const remaining = Math.max(0, Math.ceil((restEndTime - Date.now()) / 1000));
      setRestTimeLeft(remaining);
      if (remaining === 0) {
        clearRestInStore();
      }
    };

    calcRest();
    const interval = setInterval(calcRest, 1000);
    return () => clearInterval(interval);
  }, [restEndTime, clearRestInStore]);

  const value: WorkoutSessionContextType = {
    activeWorkout,
    isModalOpen,
    startedAt,
    elapsedSeconds,
    restTimeLeft,
    isResting: restTimeLeft > 0,
    startWorkout: startInStore,
    resumeWorkout: openWorkoutModal,
    pauseWorkout: closeWorkoutModal,
    finishWorkout: finishInStore,
    discardWorkout: discardInStore,
    updateSet: updateSetItem,
    addSet: addSetItem,
    removeSet: removeSetItem,
    setRestTimer: setRestInStore,
    clearRestTimer: clearRestInStore
  };

  return (
    <WorkoutSessionContext.Provider value={value}>
      {children}
    </WorkoutSessionContext.Provider>
  );
}

export function useWorkoutSession() {
  const context = useContext(WorkoutSessionContext);
  if (!context) {
    throw new Error('useWorkoutSession must be used within a WorkoutSessionProvider');
  }
  return context;
}
