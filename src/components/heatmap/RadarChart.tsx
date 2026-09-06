import React from 'react';
import { MuscleGroup } from '../../lib/exercises';
import { MuscleVolumeWeekly } from '../../lib/hypertrophy';
import { soundFx } from '../../lib/soundFx';

interface RadarChartProps {
  muscles: Record<MuscleGroup, MuscleVolumeWeekly>;
  selectedMuscle: MuscleGroup | null;
  onSelectMuscle: (muscle: MuscleGroup) => void;
  isDark?: boolean;
}

export const RadarChart: React.FC<RadarChartProps> = ({
  muscles,
  selectedMuscle,
  onSelectMuscle,
  isDark = true
}) => {
  const axes: MuscleGroup[] = ['CHEST', 'BACK', 'SHOULDERS', 'ARMS', 'CORE', 'LEGS'];
  const numAxes = axes.length;
  const size = 260;
  const center = size / 2;
  const maxRadius = 95;

  // Angles for each axis (starting at top = -90 deg)
  const getCoordinates = (angleRad: number, radius: number) => {
    const x = center + radius * Math.cos(angleRad);
    const y = center + radius * Math.sin(angleRad);
    return { x, y };
  };

  // Convert muscle percentage (0-150%) to radius (0-maxRadius)
  // 100% target maps to 0.75 * maxRadius
  const targetRadius = maxRadius * 0.75;
  const getRadiusForPct = (pct: number) => {
    const ratio = Math.min(1.4, pct / 100);
    return targetRadius * ratio;
  };

  // Target ring points (100% threshold)
  const targetPoints = axes.map((_, i) => {
    const angle = (i * 2 * Math.PI) / numAxes - Math.PI / 2;
    const { x, y } = getCoordinates(angle, targetRadius);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');

  // Actual points based on current week percentage
  const actualPoints = axes.map((muscle, i) => {
    const pct = muscles[muscle]?.week1Percentage || 0;
    const radius = Math.max(12, getRadiusForPct(pct));
    const angle = (i * 2 * Math.PI) / numAxes - Math.PI / 2;
    const { x, y } = getCoordinates(angle, radius);
    return { x, y, muscle, pct };
  });

  const polygonPath = actualPoints.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');

  return (
    <div className="flex flex-col items-center justify-center p-3 rounded-2xl bg-secondary/20 border border-border/60 relative overflow-hidden">
      {/* Background ambient glow */}
      <div className="absolute inset-0 bg-radial from-primary/10 via-transparent to-transparent pointer-events-none" />

      <div className="flex items-center justify-between w-full mb-1 text-xs">
        <span className="font-bold text-foreground flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
          Hex-Symmetry Spider Radar
        </span>
        <span className="text-[10px] font-mono text-muted-foreground">
          Dashed = 100% Optimal Target
        </span>
      </div>

      <svg width={size} height={size} className="overflow-visible select-none">
        {/* Concentric rings */}
        {[0.25, 0.5, 0.75, 1.0].map((level, idx) => {
          const r = maxRadius * level;
          return (
            <circle
              key={idx}
              cx={center}
              cy={center}
              r={r}
              fill="none"
              stroke={isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)"}
              strokeWidth={1}
            />
          );
        })}

        {/* 100% Target Threshold Reference Polygon */}
        <polygon
          points={targetPoints}
          fill="none"
          stroke={isDark ? "rgba(6,182,212,0.35)" : "rgba(6,182,212,0.5)"}
          strokeWidth={1.5}
          strokeDasharray="4,4"
        />

        {/* Axis Spokes */}
        {axes.map((_, i) => {
          const angle = (i * 2 * Math.PI) / numAxes - Math.PI / 2;
          const { x, y } = getCoordinates(angle, maxRadius);
          return (
            <line
              key={i}
              x1={center}
              y1={center}
              x2={x}
              y2={y}
              stroke={isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.1)"}
              strokeWidth={1}
            />
          );
        })}

        {/* Dynamic Hypertrophy Stimulus Filled Polygon */}
        <polygon
          points={polygonPath}
          fill="rgba(6, 182, 212, 0.22)"
          stroke="#06b6d4"
          strokeWidth={2.5}
          className="transition-all duration-700 ease-out drop-shadow-[0_0_8px_rgba(6,182,212,0.4)]"
        />

        {/* Vertex Points & Labels */}
        {actualPoints.map((pt, i) => {
          const isSel = selectedMuscle === pt.muscle;
          const isDeficit = muscles[pt.muscle]?.isTwoWeekDeficit;
          const isOpt = pt.pct >= 100;
          const angle = (i * 2 * Math.PI) / numAxes - Math.PI / 2;
          const labelCoord = getCoordinates(angle, maxRadius + 18);

          return (
            <g 
              key={pt.muscle} 
              className="cursor-pointer group"
              onClick={() => {
                soundFx.playTargetLock();
                onSelectMuscle(pt.muscle);
              }}
            >
              {/* Vertex Dot */}
              <circle
                cx={pt.x}
                cy={pt.y}
                r={isSel ? 6 : 4}
                fill={isDeficit ? "#f43f5e" : isOpt ? "#10b981" : "#06b6d4"}
                stroke={isDark ? "#000" : "#fff"}
                strokeWidth={1.5}
                className="transition-all duration-300 group-hover:r-6"
              />

              {/* Axis Label */}
              <text
                x={labelCoord.x}
                y={labelCoord.y}
                textAnchor="middle"
                dominantBaseline="central"
                fontSize={10}
                fontWeight={isSel ? "bold" : "600"}
                fill={isSel ? "#06b6d4" : isDeficit ? "#f43f5e" : isDark ? "#cbd5e1" : "#475569"}
                className="font-mono transition-colors group-hover:fill-primary"
              >
                {pt.muscle.slice(0, 5)}
              </text>
              <text
                x={labelCoord.x}
                y={labelCoord.y + 10}
                textAnchor="middle"
                dominantBaseline="central"
                fontSize={9}
                fill={isDeficit ? "#f43f5e" : isOpt ? "#10b981" : isDark ? "#94a3b8" : "#64748b"}
                className="font-mono"
              >
                {pt.pct}%
              </text>
            </g>
          );
        })}

        {/* Center Origin Dot */}
        <circle cx={center} cy={center} r={3} fill="#06b6d4" opacity={0.6} />
      </svg>
    </div>
  );
};
