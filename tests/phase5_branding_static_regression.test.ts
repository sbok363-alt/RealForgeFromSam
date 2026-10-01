import { readFileSync } from 'node:fs';

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

const profile = readFileSync(new URL('../src/pages/Profile.tsx', import.meta.url), 'utf8');
const brain = readFileSync(new URL('../src/pages/Brain.tsx', import.meta.url), 'utf8');
const logo = readFileSync(new URL('../src/components/ui/ForgeLogo.tsx', import.meta.url), 'utf8');
const proposal = readFileSync(new URL('../src/components/ProposalDiffCard.tsx', import.meta.url), 'utf8');

assert(!profile.includes('Cyber-Forge'), 'Profile must use current Hardstate branding');
assert(!brain.includes('FORGE Brain') && !brain.includes('FORGE AI TERMINAL'), 'Brain UI must use Hardstate branding');
assert(logo.includes('>HARDSTATE<') && logo.includes('text-foreground'), 'app logo must use Hardstate branding and theme-aware text');
assert(!proposal.includes('FORGE'), 'proposal user copy must use Hardstate branding');
