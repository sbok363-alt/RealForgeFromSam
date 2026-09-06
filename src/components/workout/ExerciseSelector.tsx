import React, { useState } from 'react';
import { Input } from '../ui/Input';
import { Button } from '../ui/Button';
import { EXERCISE_DATABASE, ExerciseDef } from '../../lib/exercises';
import { Search, X } from 'lucide-react';

interface ExerciseSelectorProps {
  onSelect: (exercise: ExerciseDef) => void;
  onClose: () => void;
}

export default function ExerciseSelector({ onSelect, onClose }: ExerciseSelectorProps) {
  const [search, setSearch] = useState('');

  const filtered = EXERCISE_DATABASE.filter(ex => 
    ex.name.toLowerCase().includes(search.toLowerCase()) || 
    ex.primaryMuscle.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="fixed inset-0 z-50 bg-background/95 backdrop-blur-sm flex flex-col p-4 md:p-8 animate-in fade-in zoom-in-95 duration-200">
      <div className="max-w-2xl w-full mx-auto flex flex-col h-full bg-card border border-border rounded-xl shadow-2xl overflow-hidden">
        <div className="p-4 border-b border-border flex items-center gap-3 bg-secondary/30">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={18} />
            <Input 
              autoFocus
              placeholder="Search exercises..." 
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-10 bg-background border-none"
            />
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}><X size={20} /></Button>
        </div>
        
        <div className="flex-1 overflow-y-auto p-2">
          {filtered.length === 0 ? (
            <div className="text-center text-muted-foreground p-8">No exercises found.</div>
          ) : (
            <div className="grid gap-1">
              {filtered.map(ex => (
                <button 
                  key={ex.id}
                  className="flex flex-col text-left px-4 py-3 hover:bg-secondary rounded-lg transition-colors"
                  onClick={() => {
                    onSelect(ex);
                    onClose();
                  }}
                >
                  <span className="font-medium">{ex.name}</span>
                  <span className="text-xs text-muted-foreground mt-1">
                    {ex.primaryMuscle} · {ex.equipment}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
