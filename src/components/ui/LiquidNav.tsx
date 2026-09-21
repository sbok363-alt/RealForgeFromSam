import React, { useRef, useState, useEffect } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { motion } from 'motion/react';
import { 
  Home, 
  Dumbbell, 
  Brain, 
  BarChart2, 
  User 
} from 'lucide-react';
import { soundFx } from '../../lib/soundFx';
import { cn } from '../../lib/utils';

export interface LiquidNavItem {
  name: string;
  path: string;
  icon: React.ComponentType<{ className?: string; size?: number }>;
  badge?: number | string;
  badgeColor?: string;
  highlight?: boolean;
}

interface LiquidNavProps {
  items?: LiquidNavItem[];
}

// Token values matching the FORGE Visual Reference:
const BAR_HEIGHT = 64; // Compact native bar height

export function LiquidNav({ items: customItems }: LiquidNavProps) {
  const location = useLocation();

  const defaultItems: LiquidNavItem[] = [
    { name: 'Home', path: '/', icon: Home },
    { name: 'Workouts', path: '/workout', icon: Dumbbell },
    { name: 'Brain', path: '/brain', icon: Brain, highlight: true },
    { name: 'Stats', path: '/progress', icon: BarChart2 },
    { name: 'Profile', path: '/profile', icon: User },
  ];

  const navItems = customItems || defaultItems;

  // Determine active index based on current pathname
  const activeIndex = Math.max(
    0,
    navItems.findIndex((item) => {
      if (item.path === '/') {
        return location.pathname === '/';
      }
      return location.pathname.startsWith(item.path);
    })
  );

  return (
    <nav 
      id="forge-bottom-nav"
      aria-label="Bottom Navigation"
      className="md:hidden fixed bottom-0 left-0 right-0 z-50 select-none bg-[#09090b]/95 backdrop-blur-xl border-t border-white/[0.08]"
      style={{ height: `${BAR_HEIGHT}px` }}
    >
      <div className="relative w-full h-full grid grid-cols-5 max-w-lg mx-auto px-2">
        {navItems.map((item, index) => {
          const isActive = index === activeIndex;
          const Icon = item.icon;

          return (
            <NavLink
              key={item.path}
              to={item.path}
              onClick={() => soundFx.playClick(1200)}
              className={cn(
                "group relative flex flex-col items-center justify-center h-full w-full transition-all focus:outline-none select-none py-1",
                isActive ? "text-[#FF7A32]" : "text-[#737373] hover:text-[#D4D4D4]"
              )}
            >
              {/* Tab Icon with Badge */}
              <div className="relative flex items-center justify-center">
                <Icon 
                  size={20} 
                  className={cn(
                    "transition-all duration-200",
                    isActive 
                      ? "text-[#FF7A32] drop-shadow-[0_0_8px_rgba(255,122,50,0.4)]" 
                      : "text-[#737373] group-hover:text-[#D4D4D4]"
                  )} 
                />

                {item.badge !== undefined && (
                  <span className={cn(
                    "absolute -top-1 -right-2.5 px-1 min-w-[14px] h-3.5 flex items-center justify-center text-[9px] font-black rounded-full leading-none border border-black/60",
                    item.badgeColor || "bg-[#FF7A32] text-black"
                  )}>
                    {item.badge}
                  </span>
                )}
              </div>

              {/* Tab Label */}
              <span className={cn(
                "text-[10px] font-medium tracking-tight mt-1 transition-colors leading-none",
                isActive ? "text-white font-semibold" : "text-[#737373] group-hover:text-[#A3A3A3]"
              )}>
                {item.name}
              </span>

              {/* Restrained Active Indicator Dot */}
              {isActive && (
                <motion.div
                  layoutId="bottomNavActiveDot"
                  className="w-1.5 h-1.5 rounded-full bg-[#FF7A32] shadow-[0_0_6px_#FF7A32] mt-1"
                  transition={{
                    type: "spring",
                    stiffness: 450,
                    damping: 32,
                  }}
                />
              )}
              {!isActive && <div className="w-1.5 h-1.5 mt-1 opacity-0" />}
            </NavLink>
          );
        })}
      </div>
    </nav>
  );
}
