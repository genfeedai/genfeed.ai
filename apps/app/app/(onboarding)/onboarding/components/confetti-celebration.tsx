'use client';

import { useEffect, useRef, useState } from 'react';

interface ConfettiParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: string;
  rotation: number;
  rotationSpeed: number;
  size: number;
  opacity: number;
}

const COLORS = [
  '--foreground',
  '--accent-violet',
  '--success',
  '--warning',
  '--accent-rose',
  '--primary',
  '--destructive',
];

/**
 * Lightweight canvas-based confetti celebration.
 * Fires on mount, auto-cleans up.
 */
export default function ConfettiCelebration() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [show, setShow] = useState(true);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return;
    }

    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    const rootStyles = getComputedStyle(document.documentElement);
    const confettiColors = COLORS.map((token) => {
      const tokenValue = rootStyles.getPropertyValue(token).trim();

      if (!tokenValue) {
        return 'hsl(var(--foreground))';
      }

      if (
        tokenValue.startsWith('#') ||
        tokenValue.startsWith('rgb') ||
        tokenValue.startsWith('hsl')
      ) {
        return tokenValue;
      }

      if (tokenValue.includes('%')) {
        return `hsl(${tokenValue})`;
      }

      return tokenValue;
    });

    const particles: ConfettiParticle[] = [];
    const PARTICLE_COUNT = 120;

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      particles.push({
        color:
          confettiColors[Math.floor(Math.random() * confettiColors.length)],
        opacity: 1,
        rotation: Math.random() * 360,
        rotationSpeed: (Math.random() - 0.5) * 10,
        size: Math.random() * 6 + 3,
        vx: (Math.random() - 0.5) * 6,
        vy: Math.random() * 4 + 2,
        x: Math.random() * canvas.width,
        y: -20 - Math.random() * 200,
      });
    }

    let frame: number;
    let elapsed = 0;

    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      elapsed++;

      let alive = false;
      for (const p of particles) {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.08; // gravity
        p.vx *= 0.99; // air resistance
        p.rotation += p.rotationSpeed;

        if (elapsed > 60) {
          p.opacity = Math.max(0, p.opacity - 0.015);
        }

        if (p.opacity <= 0) {
          continue;
        }
        alive = true;

        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate((p.rotation * Math.PI) / 180);
        ctx.globalAlpha = p.opacity;
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
        ctx.restore();
      }

      if (alive) {
        frame = requestAnimationFrame(animate);
      } else {
        setShow(false);
      }
    };

    frame = requestAnimationFrame(animate);

    return () => cancelAnimationFrame(frame);
  }, []);

  if (!show) {
    return null;
  }

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 pointer-events-none z-50"
    />
  );
}
