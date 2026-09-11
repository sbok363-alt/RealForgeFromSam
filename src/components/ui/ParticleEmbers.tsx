import React, { useEffect, useRef } from 'react';

export function ParticleEmbers() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;
    let particles: { x: number; y: number; vx: number; vy: number; life: number; maxLife: number; size: number; hue: number }[] = [];
    let frame = 0;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener('resize', resize);

    const createParticle = () => {
      // Spawn mainly from bottom
      const x = Math.random() * canvas.width;
      const y = canvas.height + 10;
      const vx = (Math.random() - 0.5) * 2;
      const vy = -(Math.random() * 3 + 2); // Float up
      const size = Math.random() * 3 + 1;
      const life = 1;
      const maxLife = Math.random() * 150 + 50;
      // Ember colors (orange to red to yellow)
      const hue = Math.random() * 40 + 10; // 10 to 50

      particles.push({ x, y, vx, vy, life, maxLife, size, hue });
    };

    // Burst at start
    for (let i = 0; i < 150; i++) {
       createParticle();
       // Distribute vertically for the initial burst
       particles[i].y = Math.random() * canvas.height;
    }

    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      // Spawn new particles continuously
      if (frame % 2 === 0) {
        for (let i=0; i<3; i++) createParticle();
      }

      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x += p.vx;
        p.y += p.vy;
        
        // Add some turbulent motion
        p.vx += (Math.random() - 0.5) * 0.2;
        
        p.life++;
        
        const progress = p.life / p.maxLife;
        const alpha = Math.max(0, 1 - progress);
        
        // Shrink slightly as they die
        const currentSize = Math.max(0, p.size * (1 - progress * 0.5));
        
        ctx.beginPath();
        ctx.arc(p.x, p.y, currentSize, 0, Math.PI * 2);
        
        // Glowing effect
        ctx.shadowBlur = 15;
        ctx.shadowColor = `hsla(${p.hue}, 100%, 50%, ${alpha})`;
        ctx.fillStyle = `hsla(${p.hue}, 100%, 70%, ${alpha})`;
        ctx.fill();

        if (p.life >= p.maxLife || p.y < -50) {
          particles.splice(i, 1);
        }
      }

      frame++;
      animationFrameId = requestAnimationFrame(animate);
    };
    
    animate();

    return () => {
      window.removeEventListener('resize', resize);
      cancelAnimationFrame(animationFrameId);
    };
  }, []);

  return (
    <canvas 
      ref={canvasRef} 
      className="fixed inset-0 pointer-events-none z-50"
      style={{ mixBlendMode: 'screen' }}
    />
  );
}
