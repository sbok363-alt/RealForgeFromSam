import { readFileSync } from 'node:fs';

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

const source = readFileSync(new URL('../src/pages/Workout.tsx', import.meta.url), 'utf8');

assert(
  source.includes("const normalizedStatus = String(status).replace(/-/g, '_').toUpperCase();"),
  'workout status badges must normalize persisted status casing and separator variants before branching'
);
assert(
  source.includes('switch (normalizedStatus)') && !source.includes('switch (status)'),
  'workout status badges must branch on the normalized status value'
);
