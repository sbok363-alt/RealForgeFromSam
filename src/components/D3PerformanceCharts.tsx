import React, { useEffect, useRef, useState, useMemo } from 'react';
import * as d3 from 'd3';
import { Workout } from '../types';
import { getExerciseById, EXERCISE_DATABASE } from '../lib/exercises';
import { Activity, Zap, TrendingUp, BarChart2, Calendar } from 'lucide-react';
import { cn } from '../lib/utils';

export interface VolumeDataPoint {
  date: Date;
  dateStr: string;
  workoutTitle: string;
  volume: number; // in kg
  setsCount: number;
  workoutId: string;
}

export interface E1RMDataPoint {
  date: Date;
  dateStr: string;
  e1rm: number; // in kg
  weight: number;
  reps: number;
  workoutTitle: string;
  workoutId: string;
}

interface D3PerformanceChartsProps {
  workouts: Workout[];
}

export const D3PerformanceCharts: React.FC<D3PerformanceChartsProps> = ({ workouts }) => {
  const [activeTab, setActiveTab] = useState<'VOLUME' | 'E1RM'>('VOLUME');
  const [selectedExerciseId, setSelectedExerciseId] = useState<string>('all');
  const [timeRange, setTimeRange] = useState<'30D' | '90D' | 'ALL'>('ALL');

  const volumeSvgRef = useRef<SVGSVGElement | null>(null);
  const e1rmSvgRef = useRef<SVGSVGElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [containerWidth, setContainerWidth] = useState<number>(600);

  // Measure container responsive width with ResizeObserver
  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.contentRect.width > 0) {
          setContainerWidth(entry.contentRect.width);
        }
      }
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  // Filter completed workouts
  const completedWorkouts = useMemo(() => {
    return [...workouts]
      .filter((w) => w.status === 'completed' || (w.sets && w.sets.some((s) => s.completed)))
      .sort((a, b) => (a.startedAt || 0) - (b.startedAt || 0));
  }, [workouts]);

  // Extract distinct exercises performed by user
  const availableExercises = useMemo(() => {
    const exerciseMap = new Map<string, string>();
    for (const w of completedWorkouts) {
      if (Array.isArray(w.sets)) {
        for (const s of w.sets) {
          if (s.exercise) {
            const def = getExerciseById(s.exercise);
            exerciseMap.set(s.exercise, def?.name || s.exercise);
          }
        }
      }
      if (Array.isArray(w.exercises)) {
        for (const e of w.exercises) {
          if (e.exerciseId) {
            const def = getExerciseById(e.exerciseId);
            exerciseMap.set(e.exerciseId, def?.name || e.exerciseId);
          }
        }
      }
    }
    return Array.from(exerciseMap.entries()).map(([id, name]) => ({ id, name }));
  }, [completedWorkouts]);

  // Auto-select first exercise for 1RM tab if 'all' or empty
  useEffect(() => {
    if (selectedExerciseId === 'all' && availableExercises.length > 0) {
      setSelectedExerciseId(availableExercises[0].id);
    }
  }, [availableExercises, selectedExerciseId]);

  // Compute Volume Time-Series Data
  const volumeData: VolumeDataPoint[] = useMemo(() => {
    const now = Date.now();
    const cutoff = timeRange === '30D' ? now - 30 * 86400000 : timeRange === '90D' ? now - 90 * 86400000 : 0;

    return completedWorkouts
      .filter((w) => (w.completedAt || w.startedAt || 0) >= cutoff)
      .map((w) => {
        const timestamp = w.completedAt || w.startedAt || Date.now();
        const date = new Date(timestamp);
        
        let calculatedVolume = w.totalVolume || 0;
        let setsCount = 0;

        if (Array.isArray(w.sets) && w.sets.length > 0) {
          calculatedVolume = w.sets
            .filter((s) => s.completed)
            .reduce((sum, s) => sum + (s.weight || 0) * (s.reps || 0), 0);
          setsCount = w.sets.filter((s) => s.completed).length;
        } else if (Array.isArray(w.exercises)) {
          calculatedVolume = w.exercises.reduce((sum, ex) => {
            return sum + ex.sets.filter((s) => s.completed).reduce((sSum, s) => sSum + s.weight * s.reps, 0);
          }, 0);
          setsCount = w.exercises.reduce((sum, ex) => sum + ex.sets.filter((s) => s.completed).length, 0);
        }

        return {
          date,
          dateStr: date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
          workoutTitle: w.title || 'Workout Session',
          volume: Math.round(calculatedVolume),
          setsCount,
          workoutId: w.id,
        };
      })
      .filter((d) => d.volume > 0);
  }, [completedWorkouts, timeRange]);

  // Compute 1RM Progression Time-Series Data for Selected Exercise
  const e1rmData: E1RMDataPoint[] = useMemo(() => {
    if (!selectedExerciseId || selectedExerciseId === 'all') return [];

    const now = Date.now();
    const cutoff = timeRange === '30D' ? now - 30 * 86400000 : timeRange === '90D' ? now - 90 * 86400000 : 0;

    const points: E1RMDataPoint[] = [];

    for (const w of completedWorkouts) {
      const timestamp = w.completedAt || w.startedAt || Date.now();
      if (timestamp < cutoff) continue;

      const date = new Date(timestamp);
      let bestE1rm = 0;
      let bestWeight = 0;
      let bestReps = 0;

      // Check flat sets
      if (Array.isArray(w.sets)) {
        for (const s of w.sets) {
          if (s.exercise === selectedExerciseId && s.completed && s.weight > 0 && s.reps > 0) {
            const e1rm = s.reps === 1 ? s.weight : Math.round(s.weight * (36 / (37 - Math.min(s.reps, 10))) * 10) / 10;
            if (e1rm > bestE1rm) {
              bestE1rm = e1rm;
              bestWeight = s.weight;
              bestReps = s.reps;
            }
          }
        }
      }

      // Check nested exercises
      if (Array.isArray(w.exercises)) {
        for (const ex of w.exercises) {
          if (ex.exerciseId === selectedExerciseId) {
            for (const s of ex.sets) {
              if (s.completed && s.weight > 0 && s.reps > 0) {
                const e1rm = s.reps === 1 ? s.weight : Math.round(s.weight * (36 / (37 - Math.min(s.reps, 10))) * 10) / 10;
                if (e1rm > bestE1rm) {
                  bestE1rm = e1rm;
                  bestWeight = s.weight;
                  bestReps = s.reps;
                }
              }
            }
          }
        }
      }

      if (bestE1rm > 0) {
        points.push({
          date,
          dateStr: date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
          e1rm: bestE1rm,
          weight: bestWeight,
          reps: bestReps,
          workoutTitle: w.title || 'Workout Session',
          workoutId: w.id,
        });
      }
    }

    return points;
  }, [completedWorkouts, selectedExerciseId, timeRange]);

  // -------------------------------------------------------------
  // D3 RENDER: Volume Chart (Interactive Area + Bar + Tooltip)
  // -------------------------------------------------------------
  useEffect(() => {
    if (activeTab !== 'VOLUME' || !volumeSvgRef.current || volumeData.length === 0) return;

    const svg = d3.select(volumeSvgRef.current);
    svg.selectAll('*').remove(); // Clear previous render

    const margin = { top: 24, right: 20, bottom: 40, left: 52 };
    const width = Math.max(300, containerWidth) - margin.left - margin.right;
    const height = 260 - margin.top - margin.bottom;

    const g = svg
      .attr('width', width + margin.left + margin.right)
      .attr('height', height + margin.top + margin.bottom)
      .append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);

    // Add Gradients
    const defs = svg.append('defs');

    const areaGradient = defs
      .append('linearGradient')
      .attr('id', 'volume-area-gradient')
      .attr('x1', '0%')
      .attr('y1', '0%')
      .attr('x2', '0%')
      .attr('y2', '100%');

    areaGradient.append('stop').attr('offset', '0%').attr('stop-color', '#FF7A32').attr('stop-opacity', 0.45);
    areaGradient.append('stop').attr('offset', '100%').attr('stop-color', '#FF7A32').attr('stop-opacity', 0.0);

    // Scales
    const xScale = d3
      .scaleTime()
      .domain(d3.extent(volumeData, (d) => d.date) as [Date, Date])
      .range([0, width]);

    const maxVolume = d3.max(volumeData, (d) => d.volume) || 1000;
    const yScale = d3
      .scaleLinear()
      .domain([0, maxVolume * 1.15])
      .range([height, 0])
      .nice();

    // Grid lines
    g.append('g')
      .attr('class', 'grid-lines')
      .call(
        d3
          .axisLeft(yScale)
          .ticks(5)
          .tickSize(-width)
          .tickFormat(() => '')
      )
      .selectAll('line')
      .attr('stroke', 'currentColor')
      .attr('stroke-opacity', 0.08);

    g.selectAll('.domain').remove();

    // Axes
    const xAxis = d3
      .axisBottom(xScale)
      .ticks(Math.min(volumeData.length, width > 500 ? 6 : 4))
      .tickFormat((d) => d3.timeFormat('%b %d')(d as Date));

    const yAxis = d3
      .axisLeft(yScale)
      .ticks(5)
      .tickFormat((d) => `${d3.format('~s')(d)}kg`);

    const xAxisGroup = g
      .append('g')
      .attr('transform', `translate(0,${height})`)
      .call(xAxis);

    xAxisGroup.selectAll('text')
      .attr('fill', '#94A3B8')
      .attr('font-size', '11px')
      .attr('dy', '12px');

    xAxisGroup.selectAll('line').attr('stroke', '#334155');
    xAxisGroup.select('.domain').attr('stroke', '#334155');

    const yAxisGroup = g.append('g').call(yAxis);
    yAxisGroup.selectAll('text').attr('fill', '#94A3B8').attr('font-size', '11px');
    yAxisGroup.selectAll('line').remove();
    yAxisGroup.select('.domain').remove();

    // Path generators
    const areaGenerator = d3
      .area<VolumeDataPoint>()
      .x((d) => xScale(d.date))
      .y0(height)
      .y1((d) => yScale(d.volume))
      .curve(d3.curveMonotoneX);

    const lineGenerator = d3
      .line<VolumeDataPoint>()
      .x((d) => xScale(d.date))
      .y((d) => yScale(d.volume))
      .curve(d3.curveMonotoneX);

    // Draw Area
    g.append('path')
      .datum(volumeData)
      .attr('fill', 'url(#volume-area-gradient)')
      .attr('d', areaGenerator);

    // Draw Line with enter animation
    const path = g
      .append('path')
      .datum(volumeData)
      .attr('fill', 'none')
      .attr('stroke', '#FF7A32')
      .attr('stroke-width', 2.5)
      .attr('d', lineGenerator);

    const totalLength = (path.node() as SVGPathElement)?.getTotalLength() || 1000;
    path
      .attr('stroke-dasharray', `${totalLength} ${totalLength}`)
      .attr('stroke-dashoffset', totalLength)
      .transition()
      .duration(750)
      .ease(d3.easeCubicOut)
      .attr('stroke-dashoffset', 0);

    // Tooltip HTML element overlay container
    const tooltip = d3
      .select(containerRef.current)
      .selectAll('.d3-chart-tooltip')
      .data([null])
      .join('div')
      .attr('class', 'd3-chart-tooltip pointer-events-none absolute z-20 rounded-xl bg-card border border-border/80 p-2.5 shadow-xl text-xs backdrop-blur-md opacity-0 transition-opacity duration-150');

    // Data points circles
    const dots = g
      .selectAll('.volume-dot')
      .data(volumeData)
      .enter()
      .append('circle')
      .attr('class', 'volume-dot')
      .attr('cx', (d) => xScale(d.date))
      .attr('cy', (d) => yScale(d.volume))
      .attr('r', 4.5)
      .attr('fill', '#FF7A32')
      .attr('stroke', '#0F172A')
      .attr('stroke-width', 2)
      .style('cursor', 'pointer');

    // Interaction overlay for hover
    const bisectDate = d3.bisector<VolumeDataPoint, Date>((d) => d.date).center;

    const hoverLine = g
      .append('line')
      .attr('stroke', '#94A3B8')
      .attr('stroke-width', 1)
      .attr('stroke-dasharray', '3,3')
      .attr('y1', 0)
      .attr('y2', height)
      .attr('opacity', 0);

    svg
      .append('rect')
      .attr('width', width)
      .attr('height', height)
      .attr('transform', `translate(${margin.left},${margin.top})`)
      .attr('fill', 'transparent')
      .style('cursor', 'crosshair')
      .on('mousemove', function (event) {
        const [xPos] = d3.pointer(event);
        const xDate = xScale.invert(xPos);
        const idx = bisectDate(volumeData, xDate);
        const d = volumeData[idx];
        if (!d) return;

        hoverLine
          .attr('x1', xScale(d.date))
          .attr('x2', xScale(d.date))
          .attr('opacity', 0.6);

        dots.attr('r', (dotD) => (dotD === d ? 7 : 4.5)).attr('fill', (dotD) => (dotD === d ? '#FF9457' : '#FF7A32'));

        const tooltipX = Math.min(width - 120, Math.max(10, xScale(d.date) + margin.left - 60));
        const tooltipY = Math.max(10, yScale(d.volume) + margin.top - 70);

        tooltip
          .style('opacity', '1')
          .style('left', `${tooltipX}px`)
          .style('top', `${tooltipY}px`)
          .html(`
            <div class="font-bold text-foreground truncate max-w-[170px]">${d.workoutTitle}</div>
            <div class="text-muted-foreground text-[10px]">${d.dateStr} • ${d.setsCount} completed sets</div>
            <div class="mt-1 font-mono font-bold text-primary text-sm">${d.volume.toLocaleString()} kg Total Vol</div>
          `);
      })
      .on('mouseleave', function () {
        hoverLine.attr('opacity', 0);
        dots.attr('r', 4.5).attr('fill', '#FF7A32');
        tooltip.style('opacity', '0');
      });
  }, [activeTab, volumeData, containerWidth]);

  // -------------------------------------------------------------
  // D3 RENDER: 1RM Chart (Progressive Trajectory & Record Badges)
  // -------------------------------------------------------------
  useEffect(() => {
    if (activeTab !== 'E1RM' || !e1rmSvgRef.current || e1rmData.length === 0) return;

    const svg = d3.select(e1rmSvgRef.current);
    svg.selectAll('*').remove();

    const margin = { top: 24, right: 20, bottom: 40, left: 52 };
    const width = Math.max(300, containerWidth) - margin.left - margin.right;
    const height = 260 - margin.top - margin.bottom;

    const g = svg
      .attr('width', width + margin.left + margin.right)
      .attr('height', height + margin.top + margin.bottom)
      .append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);

    // Gradients
    const defs = svg.append('defs');

    const e1rmGradient = defs
      .append('linearGradient')
      .attr('id', 'e1rm-area-gradient')
      .attr('x1', '0%')
      .attr('y1', '0%')
      .attr('x2', '0%')
      .attr('y2', '100%');

    e1rmGradient.append('stop').attr('offset', '0%').attr('stop-color', '#F59E0B').attr('stop-opacity', 0.4);
    e1rmGradient.append('stop').attr('offset', '100%').attr('stop-color', '#F59E0B').attr('stop-opacity', 0.0);

    // Scales
    const xScale = d3
      .scaleTime()
      .domain(d3.extent(e1rmData, (d) => d.date) as [Date, Date])
      .range([0, width]);

    const minE1rm = d3.min(e1rmData, (d) => d.e1rm) || 0;
    const maxE1rm = d3.max(e1rmData, (d) => d.e1rm) || 100;
    const yMin = Math.max(0, minE1rm * 0.85);
    const yMax = maxE1rm * 1.15;

    const yScale = d3.scaleLinear().domain([yMin, yMax]).range([height, 0]).nice();

    // Grid lines
    g.append('g')
      .attr('class', 'grid-lines')
      .call(
        d3
          .axisLeft(yScale)
          .ticks(5)
          .tickSize(-width)
          .tickFormat(() => '')
      )
      .selectAll('line')
      .attr('stroke', 'currentColor')
      .attr('stroke-opacity', 0.08);

    g.selectAll('.domain').remove();

    // Axes
    const xAxis = d3
      .axisBottom(xScale)
      .ticks(Math.min(e1rmData.length, width > 500 ? 6 : 4))
      .tickFormat((d) => d3.timeFormat('%b %d')(d as Date));

    const yAxis = d3
      .axisLeft(yScale)
      .ticks(5)
      .tickFormat((d) => `${d}kg`);

    const xAxisGroup = g
      .append('g')
      .attr('transform', `translate(0,${height})`)
      .call(xAxis);

    xAxisGroup.selectAll('text').attr('fill', '#94A3B8').attr('font-size', '11px').attr('dy', '12px');
    xAxisGroup.selectAll('line').attr('stroke', '#334155');
    xAxisGroup.select('.domain').attr('stroke', '#334155');

    const yAxisGroup = g.append('g').call(yAxis);
    yAxisGroup.selectAll('text').attr('fill', '#94A3B8').attr('font-size', '11px');
    yAxisGroup.selectAll('line').remove();
    yAxisGroup.select('.domain').remove();

    // Area & Line Generators
    const areaGenerator = d3
      .area<E1RMDataPoint>()
      .x((d) => xScale(d.date))
      .y0(height)
      .y1((d) => yScale(d.e1rm))
      .curve(d3.curveMonotoneX);

    const lineGenerator = d3
      .line<E1RMDataPoint>()
      .x((d) => xScale(d.date))
      .y((d) => yScale(d.e1rm))
      .curve(d3.curveMonotoneX);

    // Draw Area
    g.append('path')
      .datum(e1rmData)
      .attr('fill', 'url(#e1rm-area-gradient)')
      .attr('d', areaGenerator);

    // Draw Line
    const path = g
      .append('path')
      .datum(e1rmData)
      .attr('fill', 'none')
      .attr('stroke', '#F59E0B')
      .attr('stroke-width', 2.5)
      .attr('d', lineGenerator);

    const totalLength = (path.node() as SVGPathElement)?.getTotalLength() || 1000;
    path
      .attr('stroke-dasharray', `${totalLength} ${totalLength}`)
      .attr('stroke-dashoffset', totalLength)
      .transition()
      .duration(750)
      .ease(d3.easeCubicOut)
      .attr('stroke-dashoffset', 0);

    // Linear Trendline (Least Squares Regression)
    if (e1rmData.length >= 2) {
      const xValues = e1rmData.map((d) => d.date.getTime());
      const yValues = e1rmData.map((d) => d.e1rm);
      const xMean = d3.mean(xValues) || 0;
      const yMean = d3.mean(yValues) || 0;

      let num = 0;
      let den = 0;
      for (let i = 0; i < e1rmData.length; i++) {
        num += (xValues[i] - xMean) * (yValues[i] - yMean);
        den += Math.pow(xValues[i] - xMean, 2);
      }

      const slope = den !== 0 ? num / den : 0;
      const intercept = yMean - slope * xMean;

      const firstX = xValues[0];
      const lastX = xValues[xValues.length - 1];

      const trendPoints: [Date, number][] = [
        [new Date(firstX), slope * firstX + intercept],
        [new Date(lastX), slope * lastX + intercept],
      ];

      const trendLine = d3
        .line<[Date, number]>()
        .x((d) => xScale(d[0]))
        .y((d) => yScale(d[1]));

      g.append('path')
        .datum(trendPoints)
        .attr('fill', 'none')
        .attr('stroke', '#FBBF24')
        .attr('stroke-width', 1.5)
        .attr('stroke-dasharray', '4,4')
        .attr('opacity', 0.5)
        .attr('d', trendLine);
    }

    // Tooltip
    const tooltip = d3
      .select(containerRef.current)
      .selectAll('.d3-chart-tooltip')
      .data([null])
      .join('div')
      .attr('class', 'd3-chart-tooltip pointer-events-none absolute z-20 rounded-xl bg-card border border-border/80 p-2.5 shadow-xl text-xs backdrop-blur-md opacity-0 transition-opacity duration-150');

    // Dots
    const dots = g
      .selectAll('.e1rm-dot')
      .data(e1rmData)
      .enter()
      .append('circle')
      .attr('class', 'e1rm-dot')
      .attr('cx', (d) => xScale(d.date))
      .attr('cy', (d) => yScale(d.e1rm))
      .attr('r', 4.5)
      .attr('fill', '#F59E0B')
      .attr('stroke', '#0F172A')
      .attr('stroke-width', 2)
      .style('cursor', 'pointer');

    const bisectDate = d3.bisector<E1RMDataPoint, Date>((d) => d.date).center;

    const hoverLine = g
      .append('line')
      .attr('stroke', '#94A3B8')
      .attr('stroke-width', 1)
      .attr('stroke-dasharray', '3,3')
      .attr('y1', 0)
      .attr('y2', height)
      .attr('opacity', 0);

    svg
      .append('rect')
      .attr('width', width)
      .attr('height', height)
      .attr('transform', `translate(${margin.left},${margin.top})`)
      .attr('fill', 'transparent')
      .style('cursor', 'crosshair')
      .on('mousemove', function (event) {
        const [xPos] = d3.pointer(event);
        const xDate = xScale.invert(xPos);
        const idx = bisectDate(e1rmData, xDate);
        const d = e1rmData[idx];
        if (!d) return;

        hoverLine
          .attr('x1', xScale(d.date))
          .attr('x2', xScale(d.date))
          .attr('opacity', 0.6);

        dots.attr('r', (dotD) => (dotD === d ? 7 : 4.5)).attr('fill', (dotD) => (dotD === d ? '#FBBF24' : '#F59E0B'));

        const tooltipX = Math.min(width - 120, Math.max(10, xScale(d.date) + margin.left - 60));
        const tooltipY = Math.max(10, yScale(d.e1rm) + margin.top - 70);

        tooltip
          .style('opacity', '1')
          .style('left', `${tooltipX}px`)
          .style('top', `${tooltipY}px`)
          .html(`
            <div class="font-bold text-foreground truncate max-w-[170px]">${d.workoutTitle}</div>
            <div class="text-muted-foreground text-[10px]">${d.dateStr} • Top set: ${d.weight}kg × ${d.reps} reps</div>
            <div class="mt-1 font-mono font-bold text-amber-500 text-sm">${d.e1rm} kg e1RM</div>
          `);
      })
      .on('mouseleave', function () {
        hoverLine.attr('opacity', 0);
        dots.attr('r', 4.5).attr('fill', '#F59E0B');
        tooltip.style('opacity', '0');
      });
  }, [activeTab, e1rmData, containerWidth]);

  // Current Exercise Definition
  const currentExerciseDef = getExerciseById(selectedExerciseId);

  // Highest 1RM and Volume Stats
  const maxSessionVolume = useMemo(() => {
    return volumeData.reduce((max, d) => (d.volume > max ? d.volume : max), 0);
  }, [volumeData]);

  const best1RM = useMemo(() => {
    return e1rmData.reduce((max, d) => (d.e1rm > max ? d.e1rm : max), 0);
  }, [e1rmData]);

  return (
    <div className="bg-card rounded-2xl border border-border/80 shadow-sm p-4 space-y-4" ref={containerRef}>
      {/* Header & Mode Switcher */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-border/50">
        <div>
          <div className="flex items-center gap-2">
            <div className={cn("p-1.5 rounded-lg", activeTab === 'VOLUME' ? "bg-emerald-500/10 text-emerald-500" : "bg-amber-500/10 text-amber-500")}>
              {activeTab === 'VOLUME' ? <Activity size={18} /> : <Zap size={18} />}
            </div>
            <div>
              <h3 className="font-bold text-base text-foreground">
                {activeTab === 'VOLUME' ? 'Total Workout Volume Analytics' : 'Estimated 1RM Strength Curve'}
              </h3>
              <p className="text-xs text-muted-foreground">
                {activeTab === 'VOLUME'
                  ? 'D3 time-series analysis of mechanical load per session.'
                  : 'Brzycki-derived submaximal 1RM progression curve with regression trendline.'}
              </p>
            </div>
          </div>
        </div>

        {/* Tab & Filter Controls */}
        <div className="flex items-center gap-2 self-start sm:self-auto">
          <div className="bg-secondary/60 p-0.5 rounded-lg flex border border-border/60">
            <button
              onClick={() => setActiveTab('VOLUME')}
              className={cn(
                'px-3 py-1 text-xs font-semibold rounded-md transition-all',
                activeTab === 'VOLUME' ? 'bg-background text-foreground shadow-xs' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              Volume (kg)
            </button>
            <button
              onClick={() => setActiveTab('E1RM')}
              className={cn(
                'px-3 py-1 text-xs font-semibold rounded-md transition-all',
                activeTab === 'E1RM' ? 'bg-background text-foreground shadow-xs' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              1RM Strength
            </button>
          </div>

          <div className="bg-secondary/60 p-0.5 rounded-lg flex border border-border/60">
            {(['30D', '90D', 'ALL'] as const).map((r) => (
              <button
                key={r}
                onClick={() => setTimeRange(r)}
                className={cn(
                  'px-2 py-1 text-[11px] font-bold rounded-md transition-all',
                  timeRange === r ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
                )}
              >
                {r}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Exercise Picker (Only when in 1RM tab) */}
      {activeTab === 'E1RM' && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-semibold text-muted-foreground">Exercise:</span>
          {availableExercises.length > 0 ? (
            <div className="flex items-center gap-1.5 flex-wrap">
              {availableExercises.slice(0, 5).map((ex) => (
                <button
                  key={ex.id}
                  onClick={() => setSelectedExerciseId(ex.id)}
                  className={cn(
                    'px-2.5 py-1 rounded-full text-xs font-medium border transition-colors',
                    selectedExerciseId === ex.id
                      ? 'bg-amber-500/15 border-amber-500/40 text-amber-500 font-bold'
                      : 'bg-secondary/40 border-border/60 text-muted-foreground hover:text-foreground'
                  )}
                >
                  {ex.name}
                </button>
              ))}
              {availableExercises.length > 5 && (
                <select
                  value={selectedExerciseId}
                  onChange={(e) => setSelectedExerciseId(e.target.value)}
                  className="bg-secondary text-xs rounded-lg px-2 py-1 border border-border/60 text-foreground focus:outline-none"
                >
                  {availableExercises.map((ex) => (
                    <option key={ex.id} value={ex.id}>
                      {ex.name}
                    </option>
                  ))}
                </select>
              )}
            </div>
          ) : (
            <span className="text-xs text-muted-foreground">No completed exercise history available.</span>
          )}
        </div>
      )}

      {/* KPI Highlight Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
        {activeTab === 'VOLUME' ? (
          <>
            <div className="p-2.5 rounded-xl bg-secondary/30 border border-border/50">
              <span className="text-[10px] text-muted-foreground block uppercase font-sans">Peak Session Volume</span>
              <span className="font-bold font-mono text-emerald-500 text-sm">
                {maxSessionVolume > 0 ? `${maxSessionVolume.toLocaleString()} kg` : '—'}
              </span>
            </div>
            <div className="p-2.5 rounded-xl bg-secondary/30 border border-border/50">
              <span className="text-[10px] text-muted-foreground block uppercase font-sans">Sessions Plotted</span>
              <span className="font-bold font-mono text-foreground text-sm">{volumeData.length}</span>
            </div>
            <div className="col-span-2 sm:col-span-1 p-2.5 rounded-xl bg-secondary/30 border border-border/50">
              <span className="text-[10px] text-muted-foreground block uppercase font-sans">Avg Session Volume</span>
              <span className="font-bold font-mono text-foreground text-sm">
                {volumeData.length > 0
                  ? `${Math.round(volumeData.reduce((s, d) => s + d.volume, 0) / volumeData.length).toLocaleString()} kg`
                  : '—'}
              </span>
            </div>
          </>
        ) : (
          <>
            <div className="p-2.5 rounded-xl bg-secondary/30 border border-border/50">
              <span className="text-[10px] text-muted-foreground block uppercase font-sans">All-Time Peak e1RM</span>
              <span className="font-bold font-mono text-amber-500 text-sm">
                {best1RM > 0 ? `${best1RM} kg` : '—'}
              </span>
            </div>
            <div className="p-2.5 rounded-xl bg-secondary/30 border border-border/50">
              <span className="text-[10px] text-muted-foreground block uppercase font-sans">Data Points</span>
              <span className="font-bold font-mono text-foreground text-sm">{e1rmData.length}</span>
            </div>
            <div className="col-span-2 sm:col-span-1 p-2.5 rounded-xl bg-secondary/30 border border-border/50">
              <span className="text-[10px] text-muted-foreground block uppercase font-sans">Target Exercise</span>
              <span className="font-bold text-foreground text-xs truncate block">
                {currentExerciseDef?.name || 'Selected'}
              </span>
            </div>
          </>
        )}
      </div>

      {/* SVG Canvas Container */}
      <div className="relative w-full overflow-hidden min-h-[260px] bg-background/50 rounded-xl border border-border/40 flex items-center justify-center">
        {activeTab === 'VOLUME' && (
          volumeData.length === 0 ? (
            <div className="text-center py-12 text-xs text-muted-foreground">
              No volume data recorded in selected time window.
            </div>
          ) : (
            <svg ref={volumeSvgRef} className="w-full h-[260px]" />
          )
        )}

        {activeTab === 'E1RM' && (
          e1rmData.length === 0 ? (
            <div className="text-center py-12 text-xs text-muted-foreground">
              No completed sets found for {currentExerciseDef?.name || 'this exercise'} in selected time window.
            </div>
          ) : (
            <svg ref={e1rmSvgRef} className="w-full h-[260px]" />
          )
        )}
      </div>
    </div>
  );
};
