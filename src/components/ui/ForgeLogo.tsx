import React from 'react';

export function ForgeLogo({ className = "h-4 w-auto" }: { className?: string }) {
  return (
    <div className="flex items-center gap-2 select-none">
      {/* Three slanted flame embers */}
      <svg className={className} viewBox="0 0 32 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M6 3H30L25 8H6L6 3Z" fill="#FF7A32" />
        <path d="M3 10H23L18 15H3L3 10Z" fill="#FF7A32" />
        <path d="M0 17H16L11 22H0L0 17Z" fill="#FF7A32" />
      </svg>
      <span className="font-display font-black tracking-wider text-base sm:text-lg text-white">FORGE</span>
    </div>
  );
}
