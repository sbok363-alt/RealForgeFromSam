import React from 'react';
import { MuscleGroup } from '../../lib/exercises';
import { cn } from '../../lib/utils';

export interface MuscleSvgStyle {
  fill: string;
  stroke: string;
  strokeWidth: number;
  opacity: number;
  isActive: boolean;
  isOptimal?: boolean;
  isDeficit: boolean;
}

interface AnteriorPhysiqueSvgProps {
  getMuscleStyle: (muscle: MuscleGroup) => MuscleSvgStyle;
  selectedMuscle: MuscleGroup | null;
  hoveredMuscle: MuscleGroup | null;
  onSelectMuscle: (muscle: MuscleGroup) => void;
  onHoverMuscle: (muscle: MuscleGroup | null, event?: React.MouseEvent) => void;
  focusRegion?: 'ALL' | 'UPPER' | 'LOWER';
  className?: string;
  isDark?: boolean;
}

export const AnteriorPhysiqueSvg: React.FC<AnteriorPhysiqueSvgProps> = ({
  getMuscleStyle,
  selectedMuscle,
  hoveredMuscle,
  onSelectMuscle,
  onHoverMuscle,
  focusRegion = 'ALL',
  className,
  isDark = false
}) => {
  let viewBox = "0 0 240 510";
  if (focusRegion === 'UPPER') {
    viewBox = "20 15 200 270";
  } else if (focusRegion === 'LOWER') {
    viewBox = "20 220 200 285";
  }

  const isSelected = (m: MuscleGroup) => selectedMuscle === m;
  const isHovered = (m: MuscleGroup) => hoveredMuscle === m;

  // Solid unified body background silhouette (dark muted grey)
  const bodySilhouetteFill = isDark ? "#1e242d" : "#2b323e";
  const bodySilhouetteStroke = isDark ? "#2c3543" : "#3c4656";

  const getPartAttrs = (muscle: MuscleGroup) => {
    const style = getMuscleStyle(muscle);
    const selected = isSelected(muscle);
    const hovered = isHovered(muscle);

    let fill = style.fill;
    let stroke = style.stroke;
    let strokeWidth = style.strokeWidth;
    let opacity = style.opacity;

    if (selected) {
      stroke = '#38bdf8';
      strokeWidth = 2.2;
      opacity = 1;
    } else if (hovered) {
      stroke = style.isActive ? '#ffffff' : '#38bdf8';
      strokeWidth = 1.8;
      opacity = Math.min(1, opacity + 0.15);
    }

    return {
      fill,
      stroke,
      strokeWidth,
      opacity,
      filter: style.isDeficit && style.isActive
        ? "url(#glow-deficit)"
        : selected
          ? "url(#glow-selected)"
          : style.isOptimal && style.isActive
            ? "url(#glow-optimal)"
            : undefined,
      className: cn(
        "transition-all duration-200 cursor-pointer",
        style.isDeficit && style.isActive && "animate-pulse"
      )
    };
  };

  const chestAttrs = getPartAttrs('CHEST');
  const backAttrs = getPartAttrs('BACK');
  const shoulderAttrs = getPartAttrs('SHOULDERS');
  const armsAttrs = getPartAttrs('ARMS');
  const coreAttrs = getPartAttrs('CORE');
  const legsAttrs = getPartAttrs('LEGS');

  const chestStyle = getMuscleStyle('CHEST');
  const shoulderStyle = getMuscleStyle('SHOULDERS');
  const armsStyle = getMuscleStyle('ARMS');
  const coreStyle = getMuscleStyle('CORE');
  const legsStyle = getMuscleStyle('LEGS');

  return (
    <svg
      viewBox={viewBox}
      className={cn("w-full h-auto max-h-[460px] select-none transition-all duration-300 drop-shadow-md", className)}
      onMouseLeave={() => onHoverMuscle(null)}
    >
      <defs>
        <filter id="glow-deficit" x="-30%" y="-30%" width="160%" height="160%">
          <feDropShadow dx="0" dy="0" stdDeviation="3.5" floodColor="#ef4444" floodOpacity="0.9" />
        </filter>
        <filter id="glow-optimal" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="0" stdDeviation="2.5" floodColor="#10b981" floodOpacity="0.75" />
        </filter>
        <filter id="glow-selected" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="0" stdDeviation="3" floodColor="#38bdf8" floodOpacity="0.85" />
        </filter>
      </defs>

      {/* =========================================================================
          1. SLIM, ATHLETIC UNIFIED BODY SILHOUETTE SHELL LAYER (Dark Muted Grey)
          A single unified anatomical body shell mapping the realistic V-taper,
          natural arms hanging close to sides, and clean waist and hip proportions.
          ========================================================================= */}
      <g id="body-background-silhouette" className="pointer-events-none">
        <path
          d={`
            M 120,18
            C 108,18 100,28 100,44
            C 100,56 106,68 111,74
            C 111,76 112,80 112,84
            C 104,87 90,92 76,96
            C 66,99 56,108 56,122
            C 56,136 57,156 58,178
            C 58,182 57,192 57,202
            C 57,214 59,236 61,262
            C 61,265 60,268 59,272
            C 57,276 56,284 57,294
            C 58,302 62,304 65,300
            C 67,294 68,284 68,274
            C 68,268 69,264 69,260
            C 70,242 71,220 72,198
            C 73,186 73,174 74,162
            C 75,152 76,144 77,138
            C 78,138 78,142 79,148
            C 80,158 83,176 87,195
            C 86,206 84,218 82,228
            C 80,244 76,274 76,308
            C 76,334 78,354 82,370
            C 83,374 83,378 82,384
            C 79,396 76,412 77,432
            C 78,448 81,464 83,476
            C 83,482 82,492 80,498
            C 82,504 88,504 90,498
            C 91,492 90,482 91,476
            C 93,460 97,440 98,418
            C 98,400 96,386 94,374
            C 93,370 93,366 94,360
            C 96,340 102,308 108,274
            C 112,252 116,242 120,240
            C 124,242 128,252 132,274
            C 138,308 144,340 146,360
            C 147,366 147,370 146,374
            C 144,386 142,400 142,418
            C 143,440 147,460 149,476
            C 150,482 149,492 150,498
            C 152,504 158,504 160,498
            C 158,492 157,482 157,476
            C 159,464 162,448 163,432
            C 164,412 161,396 158,384
            C 157,378 157,374 158,370
            C 162,354 164,334 164,308
            C 164,274 160,244 158,228
            C 156,218 154,206 153,195
            C 157,176 160,158 161,148
            C 162,142 162,138 163,138
            C 164,144 165,152 166,162
            C 167,174 167,186 168,198
            C 169,220 170,242 171,260
            C 171,264 172,268 172,274
            C 172,284 173,294 175,300
            C 178,304 182,302 183,294
            C 184,284 183,276 181,272
            C 180,268 179,265 179,262
            C 181,236 183,214 183,202
            C 183,192 182,182 182,178
            C 183,156 184,136 184,122
            C 184,108 174,99 164,96
            C 150,92 136,87 128,84
            C 128,80 129,76 129,74
            C 134,68 140,56 140,44
            C 140,28 132,18 120,18
            Z
          `}
          fill={bodySilhouetteFill}
          stroke={bodySilhouetteStroke}
          strokeWidth="1.2"
        />

        {/* Clavicular Notch / Sternal Line */}
        <line x1="120" y1="90" x2="120" y2="142" stroke={isDark ? "rgba(255, 255, 255, 0.15)" : "rgba(255, 255, 255, 0.25)"} strokeWidth="1" strokeDasharray="2 3" />

        {/* Patella Kneecap Guides */}
        <ellipse cx="88" cy="370" rx="4" ry="5" fill={isDark ? "#161b22" : "#242a35"} opacity="0.6" />
        <ellipse cx="152" cy="370" rx="4" ry="5" fill={isDark ? "#161b22" : "#242a35"} opacity="0.6" />
      </g>

      {/* =========================================================================
          2. ANATOMICAL MUSCLE GROUPS (DUAL-TONE LAYER SYSTEM)
          Untargeted muscles render in faint muted grey/pink; active muscles light up!
          ========================================================================= */}

      {/* --- UPPER TRAPEZIUS (Neck / Clavicular slope) --- */}
      <g
        id="muscle-anterior-traps"
        onClick={() => onSelectMuscle('BACK')}
        onMouseEnter={(e) => onHoverMuscle('BACK', e)}
        onMouseMove={(e) => onHoverMuscle('BACK', e)}
      >
        {/* Left Upper Trap */}
        <path
          d="M 113,75 L 113,85 L 98,91 C 90,93 84,95 78,96 C 84,87 97,79 113,75 Z"
          {...backAttrs}
        />
        {/* Right Upper Trap */}
        <path
          d="M 127,75 C 143,79 156,87 162,96 C 156,95 150,93 142,91 L 127,85 L 127,75 Z"
          {...backAttrs}
        />
      </g>

      {/* --- SHOULDERS (DELTOIDS: Lateral & Anterior Heads - Athletic Proportions) --- */}
      <g
        id="muscle-anterior-shoulders"
        onClick={() => onSelectMuscle('SHOULDERS')}
        onMouseEnter={(e) => onHoverMuscle('SHOULDERS', e)}
        onMouseMove={(e) => onHoverMuscle('SHOULDERS', e)}
      >
        {/* Left Lateral Deltoid (Outer Cap) */}
        <path
          d="M 77,96 C 66,99 57,108 57,118 C 56,128 60,138 66,140 C 70,135 72,124 74,111 Z"
          {...shoulderAttrs}
        />
        {/* Left Anterior Deltoid (Front Head) */}
        <path
          d="M 77,96 L 74,111 C 72,124 70,135 66,140 C 70,141 74,136 77,126 C 79,118 82,108 83,101 Z"
          {...shoulderAttrs}
        />
        {/* Right Lateral Deltoid (Outer Cap) */}
        <path
          d="M 163,96 C 174,99 183,108 183,118 C 184,128 180,138 174,140 C 170,135 168,124 166,111 Z"
          {...shoulderAttrs}
        />
        {/* Right Anterior Deltoid (Front Head) */}
        <path
          d="M 163,96 L 166,111 C 168,124 170,135 174,140 C 170,141 166,136 163,126 C 161,118 158,108 157,101 Z"
          {...shoulderAttrs}
        />
      </g>

      {/* --- CHEST (PECTORALIS MAJOR: Clavicular & Sternal Heads) --- */}
      <g
        id="muscle-anterior-chest"
        onClick={() => onSelectMuscle('CHEST')}
        onMouseEnter={(e) => onHoverMuscle('CHEST', e)}
        onMouseMove={(e) => onHoverMuscle('CHEST', e)}
      >
        {/* Left Clavicular Head (Upper Chest) */}
        <path
          d="M 85,99 C 96,98 108,98 117,100 L 117,113 C 105,113 93,114 83,117 C 82,110 83,104 85,99 Z"
          {...chestAttrs}
        />
        {/* Left Sternal Head (Mid & Lower Chest) */}
        <path
          d="M 83,119 C 93,116 105,115 117,115 L 117,142 C 104,144 92,143 83,136 C 79,129 79,122 83,119 Z"
          {...chestAttrs}
        />
        {/* Right Clavicular Head (Upper Chest) */}
        <path
          d="M 155,99 C 144,98 132,98 123,100 L 123,113 C 135,113 147,114 157,117 C 158,110 157,104 155,99 Z"
          {...chestAttrs}
        />
        {/* Right Sternal Head (Mid & Lower Chest) */}
        <path
          d="M 157,119 C 147,116 135,115 123,115 L 123,142 C 136,144 148,143 157,136 C 161,129 161,122 157,119 Z"
          {...chestAttrs}
        />
      </g>

      {/* --- ARMS (BICEPS, BRACHIALIS & FOREARMS - Natural Arm Stance) --- */}
      <g
        id="muscle-anterior-arms"
        onClick={() => onSelectMuscle('ARMS')}
        onMouseEnter={(e) => onHoverMuscle('ARMS', e)}
        onMouseMove={(e) => onHoverMuscle('ARMS', e)}
      >
        {/* Left Bicep (Long & Short Heads) */}
        <path
          d="M 66,142 C 60,150 59,164 61,178 C 65,183 71,182 74,174 C 76,164 74,152 66,142 Z"
          {...armsAttrs}
        />
        {/* Left Brachialis (Lateral arm) */}
        <path
          d="M 59,152 C 56,160 56,168 58,176 C 60,176 61,170 61,162 Z"
          {...armsAttrs}
        />
        {/* Left Forearm (Upper Brachioradialis) */}
        <path
          d="M 59,178 C 56,192 56,208 58,226 C 61,227 64,220 66,208 C 68,196 68,185 65,180 Z"
          {...armsAttrs}
        />
        {/* Left Forearm (Flexor Belly) */}
        <path
          d="M 62,182 C 65,196 68,214 67,234 C 63,235 59,233 58,225 C 58,209 60,193 62,182 Z"
          {...armsAttrs}
        />
        {/* Left Forearm (Tendon Taper to Wrist) */}
        <path
          d="M 59,235 C 59,245 60,254 61,262 L 67,263 C 67,255 67,246 66,236 Z"
          {...armsAttrs}
        />

        {/* Right Bicep (Long & Short Heads) */}
        <path
          d="M 174,142 C 180,150 181,164 179,178 C 175,183 169,182 166,174 C 164,164 166,152 174,142 Z"
          {...armsAttrs}
        />
        {/* Right Brachialis */}
        <path
          d="M 181,152 C 184,160 184,168 182,176 C 180,176 179,170 179,162 Z"
          {...armsAttrs}
        />
        {/* Right Forearm (Upper Brachioradialis) */}
        <path
          d="M 181,178 C 184,192 184,208 182,226 C 179,227 176,220 174,208 C 172,196 172,185 175,180 Z"
          {...armsAttrs}
        />
        {/* Right Forearm (Flexor Belly) */}
        <path
          d="M 178,182 C 175,196 172,214 173,234 C 177,235 181,233 182,225 C 182,209 180,193 178,182 Z"
          {...armsAttrs}
        />
        {/* Right Forearm (Tendon Taper to Wrist) */}
        <path
          d="M 181,235 C 181,245 180,254 179,262 L 173,263 C 173,255 173,246 174,236 Z"
          {...armsAttrs}
        />
      </g>

      {/* --- CORE (RECTUS ABDOMINIS, OBLIQUES & SERRATUS - Slim Waist) --- */}
      <g
        id="muscle-anterior-core"
        onClick={() => onSelectMuscle('CORE')}
        onMouseEnter={(e) => onHoverMuscle('CORE', e)}
        onMouseMove={(e) => onHoverMuscle('CORE', e)}
      >
        {/* Upper Abs (Left & Right Pair) */}
        <path
          d="M 106,146 C 110,145 114,145 117,147 C 118,152 118,157 117,161 C 113,162 109,162 106,160 C 104,155 104,150 106,146 Z"
          {...coreAttrs}
        />
        <path
          d="M 123,147 C 126,145 130,145 134,146 C 136,150 136,155 134,160 C 131,162 127,162 123,161 C 122,157 122,152 123,147 Z"
          {...coreAttrs}
        />

        {/* Mid Abs (Left & Right Pair) */}
        <path
          d="M 105,164 C 110,163 114,163 117,165 C 118,170 118,175 117,180 C 113,181 109,181 105,179 C 103,174 103,169 105,164 Z"
          {...coreAttrs}
        />
        <path
          d="M 123,165 C 126,163 130,163 135,164 C 137,169 137,174 135,179 C 131,181 127,181 123,180 C 122,175 122,170 123,165 Z"
          {...coreAttrs}
        />

        {/* Lower Abs (Left & Right Pair) */}
        <path
          d="M 105,183 C 109,182 114,182 117,184 C 118,190 118,195 117,199 C 112,201 107,199 104,193 C 103,189 104,185 105,183 Z"
          {...coreAttrs}
        />
        <path
          d="M 123,184 C 126,182 131,182 135,183 C 136,185 137,189 136,193 C 133,199 128,201 123,199 C 122,195 122,190 123,184 Z"
          {...coreAttrs}
        />

        {/* Pyramidalis / Pelvic Lower V-Cut */}
        <path
          d="M 111,202 C 114,201 117,200 120,200 C 123,200 126,201 129,202 C 127,210 125,219 124,224 C 122,227 118,227 116,224 C 115,219 113,210 111,202 Z"
          {...coreAttrs}
        />

        {/* Left External Oblique (Waist / Flank curve - slimmed to natural athletic taper) */}
        <path
          d="M 84,146 C 93,146 100,150 102,162 C 102,178 101,194 103,208 C 95,208 89,203 87,192 C 85,178 84,162 84,146 Z"
          {...coreAttrs}
        />
        {/* Right External Oblique (Waist / Flank curve) */}
        <path
          d="M 156,146 C 147,146 140,150 138,162 C 138,178 139,194 137,208 C 145,208 151,203 153,192 C 155,178 156,162 156,146 Z"
          {...coreAttrs}
        />

        {/* Left Serratus Anterior (Ribcage slips) */}
        <path
          d="M 79,141 C 82,143 82,150 78,154 C 76,149 76,144 79,141 Z"
          {...coreAttrs}
        />
        {/* Right Serratus Anterior (Ribcage slips) */}
        <path
          d="M 161,141 C 158,143 158,150 162,154 C 164,149 164,144 161,141 Z"
          {...coreAttrs}
        />
      </g>

      {/* --- LEGS (QUADS, ADDUCTORS & ANTERIOR SHINS/CALVES) --- */}
      <g
        id="muscle-anterior-legs"
        onClick={() => onSelectMuscle('LEGS')}
        onMouseEnter={(e) => onHoverMuscle('LEGS', e)}
        onMouseMove={(e) => onHoverMuscle('LEGS', e)}
      >
        {/* Left Vastus Lateralis (Outer Quad Sweep) */}
        <path
          d="M 84,238 C 76,256 74,284 75,316 C 76,338 78,356 82,367 C 84,366 85,356 85,342 C 84,316 85,285 88,257 Z"
          {...legsAttrs}
        />
        {/* Left Rectus Femoris (Center Quad Spindle) */}
        <path
          d="M 89,254 C 85,282 85,314 86,342 C 87,356 87,365 88,368 C 90,368 91,359 92,343 C 93,313 93,281 91,254 Z"
          {...legsAttrs}
        />
        {/* Left Vastus Medialis (Inner Teardrop above Patella) */}
        <path
          d="M 93,320 C 93,336 92,354 91,368 C 94,372 98,372 100,366 C 102,356 102,341 99,329 C 96,322 94,320 93,320 Z"
          {...legsAttrs}
        />
        {/* Left Adductors / Gracilis (Inner Thigh) */}
        <path
          d="M 104,238 C 99,256 96,284 96,314 C 99,318 102,328 104,338 C 107,322 109,292 112,254 Z"
          {...legsAttrs}
        />

        {/* Right Vastus Lateralis (Outer Quad Sweep) */}
        <path
          d="M 156,238 C 164,256 166,284 165,316 C 164,338 162,356 158,367 C 156,366 155,356 155,342 C 156,316 155,285 152,257 Z"
          {...legsAttrs}
        />
        {/* Right Rectus Femoris (Center Quad Spindle) */}
        <path
          d="M 151,254 C 155,282 155,314 154,342 C 153,356 153,365 152,368 C 150,368 149,359 148,343 C 147,313 147,281 149,254 Z"
          {...legsAttrs}
        />
        {/* Right Vastus Medialis (Inner Teardrop above Patella) */}
        <path
          d="M 147,320 C 147,336 148,354 149,368 C 146,372 142,372 140,366 C 138,356 138,341 141,329 C 144,322 146,320 147,320 Z"
          {...legsAttrs}
        />
        {/* Right Adductors / Gracilis (Inner Thigh) */}
        <path
          d="M 136,238 C 141,256 144,284 144,314 C 141,318 138,328 136,338 C 133,322 131,292 128,254 Z"
          {...legsAttrs}
        />

        {/* Left Tibialis Anterior (Outer Shin) */}
        <path
          d="M 81,384 C 77,400 76,424 78,450 C 80,464 81,470 82,472 C 83,472 84,464 84,446 C 84,420 84,398 84,384 Z"
          {...legsAttrs}
        />
        {/* Left Gastrocnemius (Medial Belly Bulge) */}
        <path
          d="M 86,384 C 86,400 88,418 92,434 C 94,446 95,448 95,442 C 96,432 94,410 91,392 C 89,386 87,384 86,384 Z"
          {...legsAttrs}
        />

        {/* Right Tibialis Anterior (Outer Shin) */}
        <path
          d="M 159,384 C 163,400 164,424 162,450 C 160,464 159,470 158,472 C 157,472 156,464 156,446 C 156,420 156,398 156,384 Z"
          {...legsAttrs}
        />
        {/* Right Gastrocnemius (Medial Belly Bulge) */}
        <path
          d="M 154,384 C 154,400 152,418 148,434 C 146,446 145,448 145,442 C 144,432 146,410 149,392 C 151,386 153,384 154,384 Z"
          {...legsAttrs}
        />
      </g>

      {/* =========================================================================
          3. 2-WEEK DEFICIT WARNING BEACON MARKERS (Only shown on active deficits)
          ========================================================================= */}
      {chestStyle.isDeficit && chestStyle.isActive && (
        <g transform="translate(112, 115)" className="animate-bounce pointer-events-none">
          <circle cx="8" cy="8" r="8" fill="#ef4444" className="shadow-lg" />
          <text x="8" y="12" textAnchor="middle" fill="#ffffff" fontSize="10" fontWeight="900" fontFamily="sans-serif">!</text>
        </g>
      )}
      {shoulderStyle.isDeficit && shoulderStyle.isActive && (
        <g transform="translate(164, 108)" className="animate-bounce pointer-events-none">
          <circle cx="8" cy="8" r="8" fill="#ef4444" className="shadow-lg" />
          <text x="8" y="12" textAnchor="middle" fill="#ffffff" fontSize="10" fontWeight="900" fontFamily="sans-serif">!</text>
        </g>
      )}
      {armsStyle.isDeficit && armsStyle.isActive && (
        <g transform="translate(56, 165)" className="animate-bounce pointer-events-none">
          <circle cx="8" cy="8" r="8" fill="#ef4444" className="shadow-lg" />
          <text x="8" y="12" textAnchor="middle" fill="#ffffff" fontSize="10" fontWeight="900" fontFamily="sans-serif">!</text>
        </g>
      )}
      {coreStyle.isDeficit && coreStyle.isActive && (
        <g transform="translate(112, 168)" className="animate-bounce pointer-events-none">
          <circle cx="8" cy="8" r="8" fill="#ef4444" className="shadow-lg" />
          <text x="8" y="12" textAnchor="middle" fill="#ffffff" fontSize="10" fontWeight="900" fontFamily="sans-serif">!</text>
        </g>
      )}
      {legsStyle.isDeficit && legsStyle.isActive && (
        <g transform="translate(112, 280)" className="animate-bounce pointer-events-none">
          <circle cx="8" cy="8" r="8" fill="#ef4444" className="shadow-lg" />
          <text x="8" y="12" textAnchor="middle" fill="#ffffff" fontSize="10" fontWeight="900" fontFamily="sans-serif">!</text>
        </g>
      )}
    </svg>
  );
};
