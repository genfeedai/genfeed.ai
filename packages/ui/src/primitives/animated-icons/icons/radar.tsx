'use client';

import { motion } from 'motion/react';
import { createAnimatedIcon } from '../create-animated-icon';

// Lucide Radar; the beam sweeps a full turn.
export const RadarIcon = createAnimatedIcon('RadarIcon', (controls) => (
  <>
    <path d="M19.07 4.93A10 10 0 0 0 6.99 3.34" />
    <path d="M4 6h.01" />
    <path d="M2.29 9.62A10 10 0 1 0 21.31 8.35" />
    <path d="M16.24 7.76A6 6 0 1 0 8.23 16.67" />
    <path d="M12 18h.01" />
    <path d="M17.99 11.66A6 6 0 0 1 15.77 16.67" />
    <circle cx="12" cy="12" r="2" />
    <motion.path
      animate={controls}
      d="m13.41 10.59 5.66-5.66"
      style={{ transformBox: 'view-box', transformOrigin: '12px 12px' }}
      transition={{ duration: 0.9, ease: 'easeInOut' }}
      variants={{ animate: { rotate: [0, 360] }, normal: { rotate: 0 } }}
    />
  </>
));
