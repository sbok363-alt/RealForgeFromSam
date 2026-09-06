import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Search, X, Check, Plus, Dumbbell, Filter, Sparkles, ChevronRight } from 'lucide-react';
import { EXERCISE_DATABASE, ExerciseDef, MuscleGroup, EquipmentType, MUSCLE_COLORS } from '../../lib/exercises';
import { ExerciseThumbnail } from './ExerciseThumbnail';
import { Button } from '../ui/Button';
import { cn } from '../../lib/utils';

interface ExercisePickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectExercises: (selectedExercises: ExerciseDef[]) => void;
  alreadyAddedNames?: string[];
}

const MUSCLE_TABS: { id: 'ALL' | MuscleGroup; label: string }[] = [
  { id: 'ALL', label: 'All' },
  { id: 'CHEST', label: 'Chest' },
  { id: 'BACK', label: 'Back' },
  { id: 'SHOULDERS', label: 'Shoulders' },
  { id: 'LEGS', label: 'Legs' },
  { id: 'ARMS', label: 'Arms' },
  { id: 'CORE', label: 'Core' },
];

const EQUIPMENT_FILTERS: { id: 'ALL' | EquipmentType; label: string }[] = [
  { id: 'ALL', label: 'All Equipment' },
  { id: 'BARBELL', label: 'Barbell' },
  { id: 'DUMBBELL', label: 'Dumbbell' },
  { id: 'MACHINE', label: 'Machine' },
  { id: 'CABLE', label: 'Cable' },
  { id: 'BODYWEIGHT', label: 'Bodyweight' },
];

export function ExercisePickerModal({
  isOpen,
  onClose,
  onSelectExercises,
  alreadyAddedNames = []
}: ExercisePickerModalProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedMuscle, setSelectedMuscle] = useState<'ALL' | MuscleGroup>('ALL');
  const [selectedEquipment, setSelectedEquipment] = useState<'ALL' | EquipmentType>('ALL');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  // Filtered exercises
  const filteredExercises = useMemo(() => {
    return EXERCISE_DATABASE.filter(ex => {
      // Search match
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchName = ex.name.toLowerCase().includes(q);
        const matchMuscle = ex.primaryMuscle.toLowerCase().includes(q);
        const matchEquip = ex.equipment.toLowerCase().includes(q);
        if (!matchName && !matchMuscle && !matchEquip) return false;
      }

      // Muscle group match
      if (selectedMuscle !== 'ALL' && ex.primaryMuscle !== selectedMuscle) {
        return false;
      }

      // Equipment match
      if (selectedEquipment !== 'ALL' && ex.equipment !== selectedEquipment) {
        return false;
      }

      return true;
    });
  }, [searchQuery, selectedMuscle, selectedEquipment]);

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => 
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    );
  };

  const handleConfirm = () => {
    const chosen = EXERCISE_DATABASE.filter(ex => selectedIds.includes(ex.id));
    if (chosen.length > 0) {
      onSelectExercises(chosen);
      setSelectedIds([]);
      onClose();
    }
  };

  const handleQuickAddSingle = (ex: ExerciseDef) => {
    onSelectExercises([ex]);
    setSelectedIds([]);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center bg-background/80 backdrop-blur-md p-0 sm:p-4">
        <motion.div
          initial={{ y: '100%', opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: '100%', opacity: 0 }}
          transition={{ type: 'spring', damping: 25, stiffness: 220 }}
          className="bg-card w-full h-[88vh] sm:h-[80vh] max-w-2xl rounded-t-3xl sm:rounded-3xl border border-border shadow-2xl flex flex-col overflow-hidden"
        >
          {/* Header */}
          <div className="p-4 sm:p-5 border-b border-border bg-secondary/20 flex items-center justify-between gap-3 shrink-0">
            <div>
              <h3 className="text-lg font-bold font-display text-foreground flex items-center gap-2">
                <Dumbbell size={20} className="text-primary" />
                Add Exercises
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Select movements across muscle groups to add to your workout session.
              </p>
            </div>

            <button
              onClick={onClose}
              className="p-2 rounded-full text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
            >
              <X size={20} />
            </button>
          </div>

          {/* Search Bar */}
          <div className="p-3 sm:px-5 sm:pt-4 space-y-3 shrink-0 bg-card border-b border-border/40">
            <div className="relative">
              <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search exercise by name, muscle, equipment..."
                className="w-full h-10 pl-10 pr-9 rounded-xl bg-secondary/50 border border-border/80 text-sm placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all"
                autoFocus
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X size={14} />
                </button>
              )}
            </div>

            {/* Muscle Group Horizontal Filter Tabs */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar text-xs">
              {MUSCLE_TABS.map((tab) => {
                const isActive = selectedMuscle === tab.id;
                const tabColors = tab.id !== 'ALL' ? MUSCLE_COLORS[tab.id] : null;

                return (
                  <button
                    key={tab.id}
                    onClick={() => setSelectedMuscle(tab.id)}
                    className={cn(
                      "px-3 py-1.5 rounded-full font-bold whitespace-nowrap transition-all border shrink-0 text-[11px]",
                      isActive
                        ? "bg-primary text-primary-foreground border-primary shadow-xs"
                        : "bg-secondary/40 text-muted-foreground hover:bg-secondary hover:text-foreground border-border/60"
                    )}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </div>

            {/* Equipment Sub-Filter Bar */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar text-[11px]">
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground shrink-0 mr-1">
                Equipment:
              </span>
              {EQUIPMENT_FILTERS.map((filter) => (
                <button
                  key={filter.id}
                  onClick={() => setSelectedEquipment(filter.id)}
                  className={cn(
                    "px-2.5 py-0.5 rounded-md font-medium whitespace-nowrap transition-colors border shrink-0",
                    selectedEquipment === filter.id
                      ? "bg-foreground text-background border-foreground font-bold"
                      : "bg-transparent text-muted-foreground hover:text-foreground border-border/50"
                  )}
                >
                  {filter.label}
                </button>
              ))}
            </div>
          </div>

          {/* Exercise List */}
          <div className="flex-1 overflow-y-auto p-3 sm:p-5 space-y-2">
            {filteredExercises.length === 0 ? (
              <div className="text-center py-16 text-muted-foreground space-y-2">
                <Dumbbell size={36} className="mx-auto opacity-20" />
                <p className="text-sm font-semibold text-foreground">No exercises found</p>
                <p className="text-xs">Try adjusting your search query or filter tags.</p>
              </div>
            ) : (
              <div className="space-y-1.5">
                {filteredExercises.map((exercise) => {
                  const isSelected = selectedIds.includes(exercise.id);
                  const isAlreadyInWorkout = alreadyAddedNames.some(
                    name => name.toLowerCase() === exercise.name.toLowerCase()
                  );
                  const colors = MUSCLE_COLORS[exercise.primaryMuscle];

                  return (
                    <div
                      key={exercise.id}
                      onClick={() => toggleSelect(exercise.id)}
                      className={cn(
                        "p-2.5 sm:p-3 rounded-2xl border transition-all flex items-center justify-between gap-3 cursor-pointer group select-none",
                        isSelected 
                          ? "bg-primary/10 border-primary shadow-xs ring-1 ring-primary/30" 
                          : "bg-card hover:bg-secondary/40 border-border/70"
                      )}
                    >
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        {/* 40x40px Rounded Thumbnail */}
                        <ExerciseThumbnail
                          exerciseName={exercise.name}
                          muscle={exercise.primaryMuscle}
                          equipment={exercise.equipment}
                          size="md"
                        />

                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-bold text-foreground truncate group-hover:text-primary transition-colors">
                              {exercise.name}
                            </span>
                            {isAlreadyInWorkout && (
                              <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-muted text-muted-foreground uppercase shrink-0">
                                In Workout
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-2 text-[11px] text-muted-foreground mt-0.5">
                            <span className={cn("font-bold px-1.5 py-0.2 rounded border text-[10px]", colors.bg, colors.text, colors.border)}>
                              {exercise.primaryMuscle}
                            </span>
                            <span>•</span>
                            <span className="capitalize">{exercise.equipment.toLowerCase()}</span>
                            <span>•</span>
                            <span className="capitalize">{exercise.movementPattern.toLowerCase()}</span>
                          </div>
                        </div>
                      </div>

                      {/* Right Action / Checkbox */}
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleQuickAddSingle(exercise);
                          }}
                          className="hidden sm:inline-flex items-center gap-1 text-[11px] font-bold px-2 py-1 rounded-lg text-primary hover:bg-primary/10 transition-colors"
                          title="Add single immediately"
                        >
                          <Plus size={13} /> Add
                        </button>

                        <div
                          className={cn(
                            "w-6 h-6 rounded-lg flex items-center justify-center border transition-all",
                            isSelected
                              ? "bg-primary text-primary-foreground border-primary"
                              : "border-border/80 bg-secondary/40 group-hover:border-primary/50"
                          )}
                        >
                          {isSelected && <Check size={14} strokeWidth={3} />}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Footer Bar */}
          <div className="p-3 sm:p-4 border-t border-border bg-secondary/30 flex items-center justify-between gap-3 shrink-0">
            <div className="text-xs text-muted-foreground">
              {selectedIds.length > 0 ? (
                <span className="font-bold text-foreground">
                  {selectedIds.length} exercise{selectedIds.length > 1 ? 's' : ''} selected
                </span>
              ) : (
                <span>Tap to select one or multiple exercises</span>
              )}
            </div>

            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={onClose} className="h-9 text-xs">
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleConfirm}
                disabled={selectedIds.length === 0}
                className="h-9 text-xs font-bold gap-1.5 shadow-sm"
              >
                <Plus size={14} />
                Add ({selectedIds.length})
              </Button>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
