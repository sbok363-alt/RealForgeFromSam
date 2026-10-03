import { readFileSync } from 'node:fs';

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

const source = readFileSync(
  new URL('../src/components/workout/ActiveWorkout.tsx', import.meta.url),
  'utf8'
);

assert(
  source.includes('onClick={() => handleApplyNextTarget(ex.id)}'),
  'Apply target should address the concrete workout exercise instance'
);
assert(
  source.includes('const currentEx = activeWorkout.exercises?.find(e => e.id === exId);'),
  'Apply target must resolve the concrete workout exercise instance before updating sets'
);
assert(
  source.includes('progressionReports[currentEx.exerciseId]'),
  'Apply target must look up progression by canonical exerciseId, not workout exercise instance id'
);
assert(
  !source.includes('const report = progressionReports[exId];'),
  'Apply target must not use the workout exercise instance id as the progression report key'
);
