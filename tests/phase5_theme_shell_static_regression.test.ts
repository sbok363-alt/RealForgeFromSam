import { readFileSync } from 'node:fs';

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
const layout = readFileSync(new URL('../src/layouts/Layout.tsx', import.meta.url), 'utf8');
const nav = readFileSync(new URL('../src/components/ui/LiquidNav.tsx', import.meta.url), 'utf8');
const css = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8');

assert(
  app.includes("classList.add('light')") &&
  app.includes("classList.remove('dark')"),
  'theme store must apply the light class to the document root'
);
assert(
  css.includes('--background: #F7F7F8'),
  'light class must define a genuinely light background'
);
assert(
  !layout.includes('bg-[#09090b]/95') &&
  !layout.includes("user?.displayName || 'Samuel'"),
  'app shell must be theme-aware and must not contain a user-specific fallback'
);
assert(
  !nav.includes('bg-[#09090b]/95') &&
  !nav.includes('text-[#737373]') &&
  nav.includes('bg-background/95'),
  'bottom navigation must use semantic theme tokens'
);
assert(
  !app.includes('Loading FORGE Brain'),
  'route loading copy must use the current product name'
);
