import { readFileSync } from 'node:fs';

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

const css = readFileSync(
  new URL('../src/index.css', import.meta.url),
  'utf8'
);

assert(
  css.includes('@media (prefers-reduced-motion: reduce)'),
  'global styles must honor prefers-reduced-motion'
);
assert(
  css.includes('animation-duration: 0.01ms !important'),
  'nonessential animations must collapse under reduced motion'
);
assert(
  css.includes('transition-duration: 0.01ms !important'),
  'nonessential transitions must collapse under reduced motion'
);
