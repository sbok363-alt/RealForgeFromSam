import React from 'react';
import { MuscleGroup } from '../../lib/exercises';
import { cn } from '../../lib/utils';
import { MuscleSvgStyle } from './AnteriorPhysiqueSvg';

interface PosteriorPhysiqueSvgProps {
  getMuscleStyle: (muscle: MuscleGroup) => MuscleSvgStyle;
  selectedMuscle: MuscleGroup | null;
  hoveredMuscle: MuscleGroup | null;
  onSelectMuscle: (muscle: MuscleGroup) => void;
  onHoverMuscle: (muscle: MuscleGroup | null, event?: React.MouseEvent) => void;
  focusRegion?: 'ALL' | 'UPPER' | 'LOWER';
  className?: string;
  isDark?: boolean;
}

export const PosteriorPhysiqueSvg: React.FC<PosteriorPhysiqueSvgProps> = ({
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
        ? "url(#glow-deficit-back)"
        : selected
          ? "url(#glow-selected-back)"
          : style.isOptimal && style.isActive
            ? "url(#glow-optimal-back)"
            : undefined,
      className: cn(
        "transition-all duration-200 cursor-pointer",
        style.isDeficit && style.isActive && "animate-pulse"
      )
    };
  };

  const backAttrs = getPartAttrs('BACK');
  const shoulderAttrs = getPartAttrs('SHOULDERS');
  const armsAttrs = getPartAttrs('ARMS');
  const legsAttrs = getPartAttrs('LEGS');

  const backStyle = getMuscleStyle('BACK');
  const shoulderStyle = getMuscleStyle('SHOULDERS');
  const armsStyle = getMuscleStyle('ARMS');
  const legsStyle = getMuscleStyle('LEGS');

  return (
    <svg
      viewBox={viewBox}
      className={cn("w-full h-auto max-h-[460px] select-none transition-all duration-300 drop-shadow-md", className)}
      onMouseLeave={() => onHoverMuscle(null)}
    >
      <defs>
        <filter id="glow-deficit-back" x="-30%" y="-30%" width="160%" height="160%">
          <feDropShadow dx="0" dy="0" stdDeviation="3.5" floodColor="#ef4444" floodOpacity="0.9" />
        </filter>
        <filter id="glow-optimal-back" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="0" stdDeviation="2.5" floodColor="#10b981" floodOpacity="0.75" />
        </filter>
        <filter id="glow-selected-back" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="0" stdDeviation="3" floodColor="#38bdf8" floodOpacity="0.85" />
        </filter>
      </defs>

      {/* =========================================================================
          1. SLIM, ATHLETIC UNIFIED BODY SILHOUETTE SHELL LAYER (Dark Muted Grey)
          A single unified anatomical body shell with realistic V-taper, natural arms
          dropping close to sides, and clean waist and hip proportions.
          ========================================================================= */}
      <g id="body-background-silhouette-back" className="pointer-events-none">
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

        {/* Anatomical Spine Centerline Furrow */}
        <line
          x1="120"
          y1="84"
          x2="120"
          y2="236"
          stroke={isDark ? "rgba(255, 255, 255, 0.15)" : "rgba(255, 255, 255, 0.25)"}
          strokeWidth="1"
          strokeDasharray="2 3"
        />

        {/* Popliteal Fossa (Back of Knees Joint Indentations) */}
        <ellipse cx="88" cy="372" rx="4" ry="2.5" fill={isDark ? "#161b22" : "#242a35"} opacity="0.6" />
        <ellipse cx="152" cy="372" rx="4" ry="2.5" fill={isDark ? "#161b22" : "#242a35"} opacity="0.6" />
      </g>

      {/* =========================================================================
          2. ANATOMICAL POSTERIOR MUSCLE GROUPS (DUAL-TONE LAYER SYSTEM)
          Layered precisely on top of the slim athletic body silhouette shell.
          ========================================================================= */}

      {/* --- BACK (TRAPEZIUS, LATS, INFRASPINATUS, FLANKS/OBLIQUES & ERECTOR SPINAE) --- */}
      <g
        id="muscle-posterior-back"
        onClick={() => onSelectMuscle('BACK')}
        onMouseEnter={(e) => onHoverMuscle('BACK', e)}
        onMouseMove={(e) => onHoverMuscle('BACK', e)}
      >
        {/* Upper Trapezius - Left (Neck slope to acromion process) */}
        <path
          d="M 114,72 C 108,76 100,81 92,86 C 85,90 79,93 75,96 C 81,90 91,83 102,77 C 108,74 112,72 114,72 Z"
          {...backAttrs}
        />
        {/* Upper Trapezius - Right */}
        <path
          d="M 126,72 C 132,76 140,81 148,86 C 155,90 161,93 165,96 C 159,90 149,83 138,77 C 132,74 128,72 126,72 Z"
          {...backAttrs}
        />

        {/* Middle & Lower Trapezius - Left (True Anatomical Diamond/Trapezoid tapering to T12) */}
        <path
          d="M 118,86 C 106,89 94,94 84,98 C 90,111 93,122 93,132 C 97,144 107,156 118,168 C 119,142 119,114 118,86 Z"
          {...backAttrs}
        />
        {/* Middle & Lower Trapezius - Right */}
        <path
          d="M 122,86 C 134,89 146,94 156,98 C 150,111 147,122 147,132 C 143,144 133,156 122,168 C 121,142 121,114 122,86 Z"
          {...backAttrs}
        />

        {/* Left Infraspinatus & Teres Major (Scapular Complex) */}
        <path
          d="M 83,101 C 76,108 72,116 70,125 C 75,131 84,136 93,137 C 91,127 89,116 85,105 C 84,103 83,102 83,101 Z"
          {...backAttrs}
        />
        {/* Right Infraspinatus & Teres Major */}
        <path
          d="M 157,101 C 164,108 168,116 170,125 C 165,131 156,136 147,137 C 149,127 151,116 155,105 C 156,103 157,102 157,101 Z"
          {...backAttrs}
        />

        {/* Left Latissimus Dorsi (Natural athletic taper: curves smoothly along ribcage into narrow waist) */}
        <path
          d="M 78,134 C 77,150 80,172 87,194 C 91,206 96,214 102,218 C 105,214 107,204 109,192 C 111,178 113,168 116,166 C 107,157 98,148 92,140 C 84,136 80,135 78,134 Z"
          {...backAttrs}
        />
        {/* Right Latissimus Dorsi */}
        <path
          d="M 162,134 C 163,150 160,172 153,194 C 149,206 144,214 138,218 C 135,214 133,204 131,192 C 129,178 127,168 124,166 C 133,157 142,148 148,140 C 156,136 160,135 162,134 Z"
          {...backAttrs}
        />

        {/* Left Posterior Flank / External Oblique (Curves naturally over the athletic waist and hip crest) */}
        <path
          d="M 87,194 C 83,204 82,216 84,226 C 90,225 96,221 101,216 C 96,208 91,200 87,194 Z"
          {...backAttrs}
        />
        {/* Right Posterior Flank / External Oblique */}
        <path
          d="M 153,194 C 157,204 158,216 156,226 C 150,225 144,221 139,216 C 144,208 149,200 153,194 Z"
          {...backAttrs}
        />

        {/* Left Erector Spinae (Contoured athletic lumbar columns along the spine furrow) */}
        <path
          d="M 117,166 C 112,172 108,184 108,198 C 108,209 111,218 115,224 C 117,224 118,218 118,208 C 118,193 118,178 117,166 Z"
          {...backAttrs}
        />
        {/* Right Erector Spinae */}
        <path
          d="M 123,166 C 128,172 132,184 132,198 C 132,209 129,218 125,224 C 123,224 122,218 122,208 C 122,193 122,178 123,166 Z"
          {...backAttrs}
        />
      </g>

      {/* --- SHOULDERS (POSTERIOR DELTOIDS) --- */}
      <g
        id="muscle-posterior-shoulders"
        onClick={() => onSelectMuscle('SHOULDERS')}
        onMouseEnter={(e) => onHoverMuscle('SHOULDERS', e)}
        onMouseMove={(e) => onHoverMuscle('SHOULDERS', e)}
      >
        {/* Left Posterior Deltoid (Rear Delt capping the shoulder) */}
        <path
          d="M 75,96 C 65,99 57,107 57,118 C 56,128 60,136 66,140 C 69,136 71,126 73,114 C 74,105 74,99 75,96 Z"
          {...shoulderAttrs}
        />
        {/* Right Posterior Deltoid (Rear Delt) */}
        <path
          d="M 165,96 C 175,99 183,107 183,118 C 184,128 180,136 174,140 C 171,136 169,126 167,114 C 166,105 166,99 165,96 Z"
          {...shoulderAttrs}
        />
      </g>

      {/* --- ARMS (TRICEPS HORSESHOE & POSTERIOR FOREARMS - Athletic & Natural Stance) --- */}
      <g
        id="muscle-posterior-arms"
        onClick={() => onSelectMuscle('ARMS')}
        onMouseEnter={(e) => onHoverMuscle('ARMS', e)}
        onMouseMove={(e) => onHoverMuscle('ARMS', e)}
      >
        {/* Left Triceps - Long Head (Inner) */}
        <path
          d="M 68,142 C 67,152 68,164 70,176 C 73,177 75,174 75,166 C 74,156 72,147 68,142 Z"
          {...armsAttrs}
        />
        {/* Left Triceps - Lateral Head (Outer Horseshoe Curve) */}
        <path
          d="M 60,144 C 57,154 57,166 60,176 C 63,176 65,170 65,160 C 64,152 62,146 60,144 Z"
          {...armsAttrs}
        />
        {/* Left Triceps - Medial Head */}
        <path
          d="M 62,178 C 61,182 62,187 65,187 C 67,187 68,182 67,178 Z"
          {...armsAttrs}
        />
        {/* Left Posterior Forearm (Extensor Complex) */}
        <path
          d="M 62,188 C 58,202 57,218 59,236 C 62,238 66,231 68,217 C 70,203 70,193 66,188 Z"
          {...armsAttrs}
        />
        <path
          d="M 60,238 C 59,247 60,256 61,263 L 67,264 C 67,256 66,247 65,238 Z"
          {...armsAttrs}
        />

        {/* Right Triceps - Long Head (Inner) */}
        <path
          d="M 172,142 C 173,152 172,164 170,176 C 167,177 165,174 165,166 C 166,156 168,147 172,142 Z"
          {...armsAttrs}
        />
        {/* Right Triceps - Lateral Head (Outer Horseshoe Curve) */}
        <path
          d="M 180,144 C 183,154 183,166 180,176 C 177,176 175,170 175,160 C 176,152 178,146 180,144 Z"
          {...armsAttrs}
        />
        {/* Right Triceps - Medial Head */}
        <path
          d="M 178,178 C 179,182 178,187 175,187 C 173,187 172,182 173,178 Z"
          {...armsAttrs}
        />
        {/* Right Posterior Forearm (Extensor Complex) */}
        <path
          d="M 178,188 C 182,202 183,218 181,236 C 178,238 174,231 172,217 C 170,203 170,193 174,188 Z"
          {...armsAttrs}
        />
        <path
          d="M 180,238 C 181,247 180,256 179,263 L 173,264 C 173,256 174,247 175,238 Z"
          {...armsAttrs}
        />
      </g>

      {/* --- LEGS (GLUTES, HAMSTRINGS & POSTERIOR CALVES) --- */}
      <g
        id="muscle-posterior-legs"
        onClick={() => onSelectMuscle('LEGS')}
        onMouseEnter={(e) => onHoverMuscle('LEGS', e)}
        onMouseMove={(e) => onHoverMuscle('LEGS', e)}
      >
        {/* Left Gluteus Medius (Upper lateral hip crest) */}
        <path
          d="M 83,224 C 80,230 79,238 80,244 C 85,245 90,240 96,230 C 94,226 91,224 83,224 Z"
          {...legsAttrs}
        />
        {/* Left Gluteus Maximus (Muscular dome with anatomical gluteal fold) */}
        <path
          d="M 85,226 C 79,239 77,256 78,272 C 80,284 89,286 98,284 C 109,282 115,270 118,248 C 118,234 112,226 102,224 Z"
          {...legsAttrs}
        />

        {/* Right Gluteus Medius (Upper lateral hip crest) */}
        <path
          d="M 157,224 C 160,230 161,238 160,244 C 155,245 150,240 144,230 C 146,226 149,224 157,224 Z"
          {...legsAttrs}
        />
        {/* Right Gluteus Maximus */}
        <path
          d="M 155,226 C 161,239 163,256 162,272 C 160,284 151,286 142,284 C 131,282 125,270 122,248 C 122,234 128,226 138,224 Z"
          {...legsAttrs}
        />

        {/* Left Hamstrings - Biceps Femoris (Outer Hamstring) */}
        <path
          d="M 77,286 C 74,304 74,330 77,362 C 80,362 83,352 84,336 C 85,314 85,296 82,286 Z"
          {...legsAttrs}
        />
        {/* Left Hamstrings - Semitendinosus / Semimembranosus (Inner Hamstring) */}
        <path
          d="M 85,286 C 87,306 87,332 86,362 C 90,362 94,354 97,340 C 101,320 102,300 99,286 Z"
          {...legsAttrs}
        />

        {/* Right Hamstrings - Biceps Femoris (Outer Hamstring) */}
        <path
          d="M 163,286 C 166,304 166,330 163,362 C 160,362 157,352 156,336 C 155,314 155,296 158,286 Z"
          {...legsAttrs}
        />
        {/* Right Hamstrings - Semitendinosus / Semimembranosus (Inner Hamstring) */}
        <path
          d="M 155,286 C 153,306 153,332 154,362 C 150,362 146,354 143,340 C 139,320 138,300 141,286 Z"
          {...legsAttrs}
        />

        {/* Left Calves - Gastrocnemius Lateral Head (Outer Diamond Bulge) */}
        <path
          d="M 81,380 C 76,394 76,412 78,430 C 80,438 82,440 84,440 C 84,434 84,420 84,404 C 84,392 83,384 81,380 Z"
          {...legsAttrs}
        />
        {/* Left Calves - Gastrocnemius Medial Head (Inner Diamond Bulge) */}
        <path
          d="M 85,380 C 87,394 91,412 94,430 C 95,438 93,440 91,440 C 88,436 86,422 85,404 C 85,392 84,384 85,380 Z"
          {...legsAttrs}
        />
        {/* Left Calves - Soleus (Underlying Calf Shelf) */}
        <path
          d="M 78,430 C 78,440 79,450 81,462 C 84,463 86,461 86,452 C 86,444 85,436 84,430 Z"
          {...legsAttrs}
        />

        {/* Right Calves - Gastrocnemius Lateral Head (Outer Diamond Bulge) */}
        <path
          d="M 159,380 C 164,394 164,412 162,430 C 160,438 158,440 156,440 C 156,434 156,420 156,404 C 156,392 157,384 159,380 Z"
          {...legsAttrs}
        />
        {/* Right Calves - Gastrocnemius Medial Head (Inner Diamond Bulge) */}
        <path
          d="M 155,380 C 153,394 149,412 146,430 C 145,438 147,440 149,440 C 152,436 154,422 155,404 C 155,392 156,384 155,380 Z"
          {...legsAttrs}
        />
        {/* Right Calves - Soleus (Underlying Calf Shelf) */}
        <path
          d="M 162,430 C 162,440 161,450 159,462 C 156,463 154,461 154,452 C 154,444 155,436 156,430 Z"
          {...legsAttrs}
        />
      </g>

      {/* =========================================================================
          3. 2-WEEK DEFICIT WARNING BEACON MARKERS
          ========================================================================= */}
      {backStyle.isDeficit && backStyle.isActive && (
        <g transform="translate(112, 145)" className="animate-bounce pointer-events-none">
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
      {legsStyle.isDeficit && legsStyle.isActive && (
        <g transform="translate(112, 310)" className="animate-bounce pointer-events-none">
          <circle cx="8" cy="8" r="8" fill="#ef4444" className="shadow-lg" />
          <text x="8" y="12" textAnchor="middle" fill="#ffffff" fontSize="10" fontWeight="900" fontFamily="sans-serif">!</text>
        </g>
      )}
    </svg>
  );
};
