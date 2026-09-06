export type MuscleGroup = 'CHEST' | 'BACK' | 'SHOULDERS' | 'LEGS' | 'ARMS' | 'CORE' | 'FULL_BODY';
export type MovementPattern = 'PUSH' | 'PULL' | 'HINGE' | 'SQUAT' | 'LUNGE' | 'CARRY' | 'ISOLATION';
export type EquipmentType = 'BARBELL' | 'DUMBBELL' | 'MACHINE' | 'CABLE' | 'BODYWEIGHT' | 'OTHER';

export interface ExerciseDef {
  id: string;
  name: string;
  primaryMuscle: MuscleGroup;
  secondaryMuscles?: MuscleGroup[];
  equipment: EquipmentType;
  movementPattern: MovementPattern;
  thumbnailUrl?: string;
  accentColor?: string;
  description?: string;
}

export const MUSCLE_COLORS: Record<MuscleGroup, { bg: string; text: string; border: string; accent: string }> = {
  CHEST: { bg: 'bg-rose-500/15', text: 'text-rose-600 dark:text-rose-400', border: 'border-rose-500/30', accent: '#f43f5e' },
  BACK: { bg: 'bg-blue-500/15', text: 'text-blue-600 dark:text-blue-400', border: 'border-blue-500/30', accent: '#3b82f6' },
  SHOULDERS: { bg: 'bg-amber-500/15', text: 'text-amber-600 dark:text-amber-400', border: 'border-amber-500/30', accent: '#f59e0b' },
  LEGS: { bg: 'bg-emerald-500/15', text: 'text-emerald-600 dark:text-emerald-400', border: 'border-emerald-500/30', accent: '#10b981' },
  ARMS: { bg: 'bg-purple-500/15', text: 'text-purple-600 dark:text-purple-400', border: 'border-purple-500/30', accent: '#a855f7' },
  CORE: { bg: 'bg-cyan-500/15', text: 'text-cyan-600 dark:text-cyan-400', border: 'border-cyan-500/30', accent: '#06b6d4' },
  FULL_BODY: { bg: 'bg-orange-500/15', text: 'text-orange-600 dark:text-orange-400', border: 'border-orange-500/30', accent: '#f97316' },
};

export const EXERCISE_DATABASE: ExerciseDef[] = [
  // CHEST
  { 
    id: 'bench_press', 
    name: 'Barbell Bench Press', 
    primaryMuscle: 'CHEST', 
    secondaryMuscles: ['SHOULDERS', 'ARMS'], 
    equipment: 'BARBELL', 
    movementPattern: 'PUSH',
    description: 'Flat barbell press focusing on overall pectoralis major mass and pushing strength.'
  },
  { 
    id: 'incline_bench_press', 
    name: 'Incline Barbell Bench Press', 
    primaryMuscle: 'CHEST', 
    secondaryMuscles: ['SHOULDERS', 'ARMS'], 
    equipment: 'BARBELL', 
    movementPattern: 'PUSH',
    description: '30-45 degree incline barbell press prioritizing upper clavicular chest fibers.'
  },
  { 
    id: 'dumbbell_bench_press', 
    name: 'Dumbbell Bench Press', 
    primaryMuscle: 'CHEST', 
    secondaryMuscles: ['SHOULDERS', 'ARMS'], 
    equipment: 'DUMBBELL', 
    movementPattern: 'PUSH',
    description: 'Free weight pressing providing greater range of motion and stabilizer activation.'
  },
  { 
    id: 'incline_dumbbell_press', 
    name: 'Incline Dumbbell Press', 
    primaryMuscle: 'CHEST', 
    secondaryMuscles: ['SHOULDERS', 'ARMS'], 
    equipment: 'DUMBBELL', 
    movementPattern: 'PUSH',
    description: 'Targeted upper chest hypertrophy with independent arm convergence.'
  },
  { 
    id: 'chest_dips', 
    name: 'Chest Dips', 
    primaryMuscle: 'CHEST', 
    secondaryMuscles: ['ARMS', 'SHOULDERS'], 
    equipment: 'BODYWEIGHT', 
    movementPattern: 'PUSH',
    description: 'Forward-leaning parallel bar dips emphasizing lower sternal pectoralis head.'
  },
  { 
    id: 'cable_fly', 
    name: 'Cable Crossover Fly', 
    primaryMuscle: 'CHEST', 
    equipment: 'CABLE', 
    movementPattern: 'ISOLATION',
    description: 'Constant tension chest fly maximizing adduction and peak contraction.'
  },
  { 
    id: 'pec_deck', 
    name: 'Pec Deck Machine', 
    primaryMuscle: 'CHEST', 
    equipment: 'MACHINE', 
    movementPattern: 'ISOLATION',
    description: 'Stable machine fly locking horizontal adduction without wrist strain.'
  },
  { 
    id: 'push_ups', 
    name: 'Push-Ups', 
    primaryMuscle: 'CHEST', 
    secondaryMuscles: ['ARMS', 'CORE'], 
    equipment: 'BODYWEIGHT', 
    movementPattern: 'PUSH',
    description: 'Foundational bodyweight pressing with scapular protraction and core tension.'
  },
  
  // BACK
  { 
    id: 'pull_up', 
    name: 'Pull-Up', 
    primaryMuscle: 'BACK', 
    secondaryMuscles: ['ARMS', 'CORE'], 
    equipment: 'BODYWEIGHT', 
    movementPattern: 'PULL',
    description: 'Overhand grip vertical pull for latissimus dorsi width and upper back density.'
  },
  { 
    id: 'chin_up', 
    name: 'Chin-Up', 
    primaryMuscle: 'BACK', 
    secondaryMuscles: ['ARMS'], 
    equipment: 'BODYWEIGHT', 
    movementPattern: 'PULL',
    description: 'Supinated grip vertical pull engaging both lats and biceps.'
  },
  { 
    id: 'lat_pulldown', 
    name: 'Lat Pulldown', 
    primaryMuscle: 'BACK', 
    secondaryMuscles: ['ARMS'], 
    equipment: 'CABLE', 
    movementPattern: 'PULL',
    description: 'Cable vertical pull allowing controlled overload of the lats across various grips.'
  },
  { 
    id: 'seated_cable_row', 
    name: 'Seated Cable Row', 
    primaryMuscle: 'BACK', 
    secondaryMuscles: ['ARMS'], 
    equipment: 'CABLE', 
    movementPattern: 'PULL',
    description: 'Horizontal cable pull building mid-back rhomboids and lower lats.'
  },
  { 
    id: 'chest_supported_row', 
    name: 'Chest Supported T-Bar Row', 
    primaryMuscle: 'BACK', 
    equipment: 'MACHINE', 
    movementPattern: 'PULL',
    description: 'Strict upper back rowing removing lower back spinal loading.'
  },
  { 
    id: 'barbell_row', 
    name: 'Barbell Bent Over Row', 
    primaryMuscle: 'BACK', 
    secondaryMuscles: ['ARMS', 'CORE', 'LEGS'], 
    equipment: 'BARBELL', 
    movementPattern: 'PULL',
    description: 'Heavy compound hinge-row building overall posterior chain and back thickness.'
  },
  { 
    id: 'single_arm_dumbbell_row', 
    name: 'Single Arm Dumbbell Row', 
    primaryMuscle: 'BACK', 
    secondaryMuscles: ['ARMS'], 
    equipment: 'DUMBBELL', 
    movementPattern: 'PULL',
    description: 'Unilateral rowing to eliminate imbalances and stretch lats fully.'
  },
  { 
    id: 'deadlift', 
    name: 'Conventional Deadlift', 
    primaryMuscle: 'BACK', 
    secondaryMuscles: ['LEGS', 'CORE'], 
    equipment: 'BARBELL', 
    movementPattern: 'HINGE',
    description: 'King of posterior chain exercises building full-body pulling power.'
  },

  // SHOULDERS
  { 
    id: 'overhead_press', 
    name: 'Standing Overhead Press', 
    primaryMuscle: 'SHOULDERS', 
    secondaryMuscles: ['ARMS', 'CORE'], 
    equipment: 'BARBELL', 
    movementPattern: 'PUSH',
    description: 'Strict vertical barbell press building anterior delts and triceps power.'
  },
  { 
    id: 'dumbbell_shoulder_press', 
    name: 'Seated Dumbbell Shoulder Press', 
    primaryMuscle: 'SHOULDERS', 
    secondaryMuscles: ['ARMS'], 
    equipment: 'DUMBBELL', 
    movementPattern: 'PUSH',
    description: 'Seated overhead press isolating anterior and lateral deltoids.'
  },
  { 
    id: 'lateral_raise', 
    name: 'Dumbbell Lateral Raise', 
    primaryMuscle: 'SHOULDERS', 
    equipment: 'DUMBBELL', 
    movementPattern: 'ISOLATION',
    description: 'Classic side delt isolation to build wide 3D shoulder caps.'
  },
  { 
    id: 'cable_lateral_raise', 
    name: 'Cable Lateral Raise', 
    primaryMuscle: 'SHOULDERS', 
    equipment: 'CABLE', 
    movementPattern: 'ISOLATION',
    description: 'Smooth resistance profile keeping constant tension on the side delts.'
  },
  { 
    id: 'rear_delt_fly', 
    name: 'Rear Delt Reverse Fly', 
    primaryMuscle: 'SHOULDERS', 
    secondaryMuscles: ['BACK'], 
    equipment: 'MACHINE', 
    movementPattern: 'ISOLATION',
    description: 'Reverse machine fly targeting posterior delts and postural integrity.'
  },
  { 
    id: 'face_pull', 
    name: 'Cable Face Pull', 
    primaryMuscle: 'SHOULDERS', 
    secondaryMuscles: ['BACK'], 
    equipment: 'CABLE', 
    movementPattern: 'PULL',
    description: 'Rope face pull for rotator cuff health and rear delts development.'
  },

  // LEGS
  { 
    id: 'squat', 
    name: 'Barbell Back Squat', 
    primaryMuscle: 'LEGS', 
    secondaryMuscles: ['CORE', 'BACK'], 
    equipment: 'BARBELL', 
    movementPattern: 'SQUAT',
    description: 'Primary compound quad and glute builder with spinal axial load.'
  },
  { 
    id: 'front_squat', 
    name: 'Barbell Front Squat', 
    primaryMuscle: 'LEGS', 
    secondaryMuscles: ['CORE'], 
    equipment: 'BARBELL', 
    movementPattern: 'SQUAT',
    description: 'Upright torso squat placing high quad demand and thoracic core tension.'
  },
  { 
    id: 'leg_press', 
    name: 'Leg Press 45°', 
    primaryMuscle: 'LEGS', 
    equipment: 'MACHINE', 
    movementPattern: 'SQUAT',
    description: 'High-load machine leg press for maximum quad and glute hypertrophy.'
  },
  { 
    id: 'romanian_deadlift', 
    name: 'Romanian Deadlift (RDL)', 
    primaryMuscle: 'LEGS', 
    secondaryMuscles: ['BACK', 'CORE'], 
    equipment: 'BARBELL', 
    movementPattern: 'HINGE',
    description: 'Pure hip-hinge exercise for deep hamstring and glute stretch under load.'
  },
  { 
    id: 'bulgarian_split_squat', 
    name: 'Bulgarian Split Squat', 
    primaryMuscle: 'LEGS', 
    secondaryMuscles: ['CORE'], 
    equipment: 'DUMBBELL', 
    movementPattern: 'LUNGE',
    description: 'Rear-foot elevated split squat for unilateral quad and glute development.'
  },
  { 
    id: 'leg_curl', 
    name: 'Seated Leg Curl', 
    primaryMuscle: 'LEGS', 
    equipment: 'MACHINE', 
    movementPattern: 'ISOLATION',
    description: 'Hamstring isolation loading hamstrings in their lengthened seated position.'
  },
  { 
    id: 'leg_extension', 
    name: 'Leg Extension', 
    primaryMuscle: 'LEGS', 
    equipment: 'MACHINE', 
    movementPattern: 'ISOLATION',
    description: 'Direct rectus femoris and quad isolation with continuous knee extension torque.'
  },
  { 
    id: 'calf_raise', 
    name: 'Standing Calf Raise', 
    primaryMuscle: 'LEGS', 
    equipment: 'MACHINE', 
    movementPattern: 'ISOLATION',
    description: 'Full ankle dorsiflexion and plantarflexion for gastrocnemius growth.'
  },

  // ARMS
  { 
    id: 'barbell_curl', 
    name: 'Barbell Bicep Curl', 
    primaryMuscle: 'ARMS', 
    equipment: 'BARBELL', 
    movementPattern: 'ISOLATION',
    description: 'Straight bar bicep curl for overall arm mass and peak overload.'
  },
  { 
    id: 'dumbbell_curl', 
    name: 'Incline Dumbbell Curl', 
    primaryMuscle: 'ARMS', 
    equipment: 'DUMBBELL', 
    movementPattern: 'ISOLATION',
    description: 'Incline bench position placing the long head of the bicep into deep stretch.'
  },
  { 
    id: 'hammer_curl', 
    name: 'Dumbbell Hammer Curl', 
    primaryMuscle: 'ARMS', 
    equipment: 'DUMBBELL', 
    movementPattern: 'ISOLATION',
    description: 'Neutral grip curl targeting brachialis and brachioradialis for forearm thickness.'
  },
  { 
    id: 'preacher_curl', 
    name: 'Preacher Curl Machine', 
    primaryMuscle: 'ARMS', 
    equipment: 'MACHINE', 
    movementPattern: 'ISOLATION',
    description: 'Fixed arm support preventing momentum and isolating the bicep short head.'
  },
  { 
    id: 'tricep_pushdown', 
    name: 'Cable Tricep Pushdown', 
    primaryMuscle: 'ARMS', 
    equipment: 'CABLE', 
    movementPattern: 'ISOLATION',
    description: 'Rope or bar tricep extension targeting lateral and medial tricep heads.'
  },
  { 
    id: 'overhead_tricep_extension', 
    name: 'Overhead Cable Tricep Extension', 
    primaryMuscle: 'ARMS', 
    equipment: 'CABLE', 
    movementPattern: 'ISOLATION',
    description: 'Overhead angle placing the long head of the tricep in loaded stretch.'
  },
  { 
    id: 'skull_crushers', 
    name: 'EZ-Bar Skull Crushers', 
    primaryMuscle: 'ARMS', 
    equipment: 'BARBELL', 
    movementPattern: 'ISOLATION',
    description: 'Lying tricep extension using EZ curl bar for intense triceps stretch.'
  },

  // CORE
  { 
    id: 'cable_crunch', 
    name: 'Kneeling Cable Crunch', 
    primaryMuscle: 'CORE', 
    equipment: 'CABLE', 
    movementPattern: 'ISOLATION',
    description: 'Progressively overloadable spinal flexion for rectus abdominis hypertrophy.'
  },
  { 
    id: 'hanging_leg_raise', 
    name: 'Hanging Leg Raise', 
    primaryMuscle: 'CORE', 
    equipment: 'BODYWEIGHT', 
    movementPattern: 'ISOLATION',
    description: 'Hanging knee/leg raises developing lower abs and hip flexor control.'
  },
  { 
    id: 'ab_wheel_rollout', 
    name: 'Ab Wheel Rollout', 
    primaryMuscle: 'CORE', 
    equipment: 'OTHER', 
    movementPattern: 'ISOLATION',
    description: 'Anti-extension core strength requiring immense anterior stability.'
  },
  { 
    id: 'plank', 
    name: 'Forearm Plank', 
    primaryMuscle: 'CORE', 
    equipment: 'BODYWEIGHT', 
    movementPattern: 'ISOLATION',
    description: 'Isometric core stability holding neutral pelvis and tight ribcage.'
  }
];

export function getExerciseById(id: string): ExerciseDef | undefined {
  if (!id) return undefined;
  const normalized = id.toLowerCase().trim().replace(/[-_]/g, '_');
  return EXERCISE_DATABASE.find(e => 
    e.id.toLowerCase() === normalized || 
    e.id.toLowerCase() === id.toLowerCase() ||
    e.name.toLowerCase() === id.toLowerCase() ||
    e.name.toLowerCase().replace(/\s+/g, '_') === normalized
  );
}

export function getExerciseByName(name: string): ExerciseDef | undefined {
  if (!name) return undefined;
  const lower = name.toLowerCase().trim();
  return EXERCISE_DATABASE.find(e => 
    e.name.toLowerCase() === lower || 
    e.id.toLowerCase() === lower ||
    e.name.toLowerCase().includes(lower) ||
    lower.includes(e.name.toLowerCase())
  );
}
