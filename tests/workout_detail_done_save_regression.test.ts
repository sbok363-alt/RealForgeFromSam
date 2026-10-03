import { readFileSync } from 'node:fs';

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

const source = readFileSync(
  new URL('../src/components/WorkoutDetailModal.tsx', import.meta.url),
  'utf8'
);

assert(
  !source.includes('onClick={() => setIsEditMode(!isEditMode)}'),
  'Done must not merely leave edit mode and hide the save action'
);
assert(
  source.includes('onClick={() => isEditMode ? handleSave() : setIsEditMode(true)}'),
  'Done must persist planned-workout edits before leaving edit mode'
);
assert(
  source.includes("{saving ? 'Saving…' : isEditMode ? \"Done\" : \"Edit\"}"),
  'edit toggle must expose saving progress when Done is persisting changes'
);
