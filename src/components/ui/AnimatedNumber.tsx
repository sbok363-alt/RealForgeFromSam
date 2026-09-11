import React, { useEffect } from 'react';
import { motion, useSpring, useTransform } from 'motion/react';

interface AnimatedNumberProps {
  value: number;
  format?: (val: number) => string;
  className?: string;
}

export function AnimatedNumber({ value, format = (v) => Math.round(v).toString(), className }: AnimatedNumberProps) {
  const springValue = useSpring(value, {
    stiffness: 400,
    damping: 25,
    mass: 1,
  });
  
  useEffect(() => {
    springValue.set(value);
  }, [value, springValue]);

  const display = useTransform(springValue, (current) => format(current));

  return (
    <motion.span className={className}>
      {display}
    </motion.span>
  );
}
