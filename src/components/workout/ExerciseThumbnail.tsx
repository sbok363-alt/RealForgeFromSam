import React from 'react';
import { MuscleGroup, EquipmentType, MUSCLE_COLORS, getExerciseByName } from '../../lib/exercises';
import { Dumbbell, Shield, Zap, Layers, Activity } from 'lucide-react';
import { cn } from '../../lib/utils';

interface ExerciseThumbnailProps {
  exerciseName?: string;
  muscle?: MuscleGroup;
  equipment?: EquipmentType;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

export function ExerciseThumbnail({
  exerciseName = '',
  muscle,
  equipment,
  className,
  size = 'md'
}: ExerciseThumbnailProps) {
  const def = getExerciseByName(exerciseName);
  const effectiveMuscle = muscle || def?.primaryMuscle || 'CHEST';
  const effectiveEquipment = equipment || def?.equipment || 'BARBELL';
  const colors = MUSCLE_COLORS[effectiveMuscle] || MUSCLE_COLORS.CHEST;

  const sizeClasses = {
    sm: 'w-8 h-8 rounded-lg text-xs',
    md: 'w-10 h-10 rounded-xl text-sm',
    lg: 'w-12 h-12 rounded-xl text-base'
  }[size];

  // Visual SVG badges customized per muscle category and equipment
  const renderMuscleGraphic = () => {
    switch (effectiveMuscle) {
      case 'CHEST':
        return (
          <svg viewBox="0 0 40 40" className="w-full h-full p-1" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect width="40" height="40" rx="10" fill={colors.accent} fillOpacity="0.15" />
            <path d="M12 16C12 14 15 13 20 13C25 13 28 14 28 16V22C28 26 24 28 20 28C16 28 12 26 12 22V16Z" stroke={colors.accent} strokeWidth="1.8" strokeLinecap="round" />
            <path d="M20 13V28" stroke={colors.accent} strokeWidth="1.5" strokeDasharray="2 2" />
            <circle cx="16" cy="19" r="2.5" fill={colors.accent} fillOpacity="0.8" />
            <circle cx="24" cy="19" r="2.5" fill={colors.accent} fillOpacity="0.8" />
          </svg>
        );
      case 'BACK':
        return (
          <svg viewBox="0 0 40 40" className="w-full h-full p-1" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect width="40" height="40" rx="10" fill={colors.accent} fillOpacity="0.15" />
            <path d="M14 13L20 16L26 13L28 20C28 25 24 28 20 28C16 28 12 25 12 20L14 13Z" stroke={colors.accent} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M20 16V28" stroke={colors.accent} strokeWidth="2" />
            <path d="M15 20L20 23L25 20" stroke={colors.accent} strokeWidth="1.5" />
          </svg>
        );
      case 'SHOULDERS':
        return (
          <svg viewBox="0 0 40 40" className="w-full h-full p-1" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect width="40" height="40" rx="10" fill={colors.accent} fillOpacity="0.15" />
            <circle cx="20" cy="14" r="3" stroke={colors.accent} strokeWidth="1.5" />
            <path d="M10 22C10 18 14 17 20 17C26 17 30 18 30 22" stroke={colors.accent} strokeWidth="2" strokeLinecap="round" />
            <circle cx="12" cy="23" r="3" fill={colors.accent} fillOpacity="0.8" />
            <circle cx="28" cy="23" r="3" fill={colors.accent} fillOpacity="0.8" />
          </svg>
        );
      case 'LEGS':
        return (
          <svg viewBox="0 0 40 40" className="w-full h-full p-1" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect width="40" height="40" rx="10" fill={colors.accent} fillOpacity="0.15" />
            <path d="M14 13H26V18L24 28H21L21 21H19L19 28H16L14 18V13Z" stroke={colors.accent} strokeWidth="1.8" strokeLinejoin="round" />
            <rect x="15" y="17" width="3" height="6" rx="1.5" fill={colors.accent} fillOpacity="0.8" />
            <rect x="22" y="17" width="3" height="6" rx="1.5" fill={colors.accent} fillOpacity="0.8" />
          </svg>
        );
      case 'ARMS':
        return (
          <svg viewBox="0 0 40 40" className="w-full h-full p-1" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect width="40" height="40" rx="10" fill={colors.accent} fillOpacity="0.15" />
            <path d="M12 24C12 20 15 15 20 15C23 15 26 17 27 20C28 23 27 26 24 27C21 28 14 28 12 24Z" stroke={colors.accent} strokeWidth="1.8" strokeLinecap="round" />
            <path d="M17 19C18 17.5 21 17.5 23 19" stroke={colors.accent} strokeWidth="2" strokeLinecap="round" />
            <circle cx="20" cy="21" r="2.5" fill={colors.accent} fillOpacity="0.9" />
          </svg>
        );
      case 'CORE':
        return (
          <svg viewBox="0 0 40 40" className="w-full h-full p-1" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect width="40" height="40" rx="10" fill={colors.accent} fillOpacity="0.15" />
            <rect x="15" y="13" width="4.5" height="4" rx="1" stroke={colors.accent} strokeWidth="1.4" fill={colors.accent} fillOpacity="0.4" />
            <rect x="20.5" y="13" width="4.5" height="4" rx="1" stroke={colors.accent} strokeWidth="1.4" fill={colors.accent} fillOpacity="0.4" />
            <rect x="15" y="18" width="4.5" height="4" rx="1" stroke={colors.accent} strokeWidth="1.4" fill={colors.accent} fillOpacity="0.6" />
            <rect x="20.5" y="18" width="4.5" height="4" rx="1" stroke={colors.accent} strokeWidth="1.4" fill={colors.accent} fillOpacity="0.6" />
            <rect x="15" y="23" width="4.5" height="4" rx="1" stroke={colors.accent} strokeWidth="1.4" fill={colors.accent} fillOpacity="0.8" />
            <rect x="20.5" y="23" width="4.5" height="4" rx="1" stroke={colors.accent} strokeWidth="1.4" fill={colors.accent} fillOpacity="0.8" />
          </svg>
        );
      default:
        return (
          <div className="w-full h-full flex items-center justify-center">
            <Dumbbell size={18} className={colors.text} />
          </div>
        );
    }
  };

  return (
    <div 
      className={cn(
        "relative shrink-0 flex items-center justify-center overflow-hidden border shadow-xs transition-transform",
        colors.bg,
        colors.border,
        sizeClasses,
        className
      )}
      style={{ width: size === 'md' ? '40px' : undefined, height: size === 'md' ? '40px' : undefined }}
      title={`${def?.name || exerciseName} (${effectiveMuscle} • ${effectiveEquipment})`}
    >
      {renderMuscleGraphic()}
      
      {/* Tiny equipment badge indicator in corner */}
      <span className="absolute bottom-0.5 right-0.5 text-[8px] font-black uppercase font-mono px-0.5 rounded bg-background/90 text-foreground/80 leading-none shadow-2xs">
        {effectiveEquipment === 'BARBELL' ? 'BB' :
         effectiveEquipment === 'DUMBBELL' ? 'DB' :
         effectiveEquipment === 'CABLE' ? 'CB' :
         effectiveEquipment === 'MACHINE' ? 'MC' : 'BW'}
      </span>
    </div>
  );
}
