import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Calendar } from 'lucide-react';
import { Button } from './ui/Button';
import { ProgressionReport, Workout } from '../types';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer
} from 'recharts';

interface ExerciseHistorySheetProps {
  exercise: string;
  report?: ProgressionReport;
  onClose: () => void;
}

export function ExerciseHistorySheet({ exercise, report, onClose }: ExerciseHistorySheetProps) {
  if (!exercise) return null;

  const chartData = report?.history?.slice(0, 5).reverse().map(log => {
    // Calculate simple estimated 1RM from best set
    const bestSet = log.sets.reduce((best, current) => {
      const bestE1rm = best.weight * (1 + best.reps / 30);
      const currentE1rm = current.weight * (1 + current.reps / 30);
      return currentE1rm > bestE1rm ? current : best;
    }, log.sets[0]);
    
    return {
      date: new Date(log.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      e1RM: bestSet ? Math.round(bestSet.weight * (1 + bestSet.reps / 30)) : 0,
      vol: log.totalVolume
    };
  }) || [];

  return (
    <AnimatePresence>
      <motion.div
        key="history-sheet-backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="fixed inset-0 z-[70] bg-background/80 backdrop-blur-sm"
      />
      <motion.div
        key="history-sheet"
        initial={{ x: '100%' }}
        animate={{ x: 0 }}
        exit={{ x: '100%' }}
        transition={{ type: 'spring', damping: 25, stiffness: 200 }}
        className="fixed inset-y-0 right-0 z-[80] w-full max-w-sm bg-card border-l border-border shadow-2xl flex flex-col"
      >
        <div className="p-4 border-b border-border flex items-center justify-between bg-secondary/30">
          <div>
            <h3 className="font-bold text-lg">{exercise}</h3>
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Performance History</p>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} className="rounded-full hover:bg-secondary">
            <X size={18} />
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          {report?.history && report.history.length > 0 ? (
            <>
              {/* Chart */}
              <div className="space-y-2">
                <h4 className="text-sm font-bold text-muted-foreground uppercase tracking-wider">Estimated 1RM Trend</h4>
                <div className="h-48 w-full bg-secondary/10 rounded-xl border border-border p-2 pt-4">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="opacity-10" vertical={false} />
                      <XAxis dataKey="date" stroke="currentColor" className="opacity-50 text-[10px]" tickLine={false} axisLine={false} />
                      <YAxis stroke="currentColor" className="opacity-50 text-[10px]" tickLine={false} axisLine={false} width={30} />
                      <Tooltip 
                        contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', borderRadius: '8px', fontSize: '12px' }}
                        itemStyle={{ color: 'hsl(var(--primary))', fontWeight: 'bold' }}
                      />
                      <Line 
                        type="monotone" 
                        dataKey="e1RM" 
                        stroke="hsl(var(--primary))" 
                        strokeWidth={3}
                        dot={{ r: 4, fill: 'hsl(var(--background))', strokeWidth: 2 }}
                        activeDot={{ r: 6 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Past Sessions List */}
              <div className="space-y-3">
                <h4 className="text-sm font-bold text-muted-foreground uppercase tracking-wider">Past Sessions (5)</h4>
                {report.history.slice(0, 5).map((log, i) => (
                  <div key={i} className="border border-border/50 rounded-xl p-3 bg-secondary/10">
                    <div className="flex items-center justify-between mb-2 pb-2 border-b border-border/40">
                      <div className="flex items-center gap-1.5 text-xs font-semibold">
                        <Calendar size={12} className="text-primary" />
                        {new Date(log.date).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
                      </div>
                      <div className="text-[10px] font-mono text-muted-foreground">
                        Vol: {log.totalVolume.toLocaleString()}kg
                      </div>
                    </div>
                    <div className="space-y-1">
                      {log.sets.map((s, j) => (
                        <div key={j} className="grid grid-cols-[20px_1fr_1fr] text-xs font-mono items-center">
                          <span className="text-muted-foreground text-[10px]">{j + 1}</span>
                          <span className="font-bold">{s.weight} <span className="text-[10px] text-muted-foreground font-normal">kg</span></span>
                          <span className="font-bold text-right">{s.reps} <span className="text-[10px] text-muted-foreground font-normal">reps</span></span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="text-center py-12 text-muted-foreground text-sm">
              <History size={32} className="mx-auto mb-3 opacity-20" />
              <p>No history available for this exercise yet.</p>
            </div>
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
