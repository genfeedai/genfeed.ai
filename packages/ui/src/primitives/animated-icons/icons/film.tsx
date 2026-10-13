'use client';

import { motion } from 'motion/react';
import { createAnimatedIcon } from '../create-animated-icon';

// Lucide Film; the frames roll through the gate.
export const FilmIcon = createAnimatedIcon('FilmIcon', (controls) => (
  <>
    <rect height="18" rx="2" width="18" x="3" y="3" />
    <path d="M7 3v18" />
    <path d="M17 3v18" />
    <motion.g
      animate={controls}
      transition={{ duration: 0.45, ease: 'easeInOut' }}
      variants={{ animate: { y: [0, -4.5, 0] }, normal: { y: 0 } }}
    >
      <path d="M3 7.5h4" />
      <path d="M3 12h18" />
      <path d="M3 16.5h4" />
      <path d="M17 7.5h4" />
      <path d="M17 16.5h4" />
    </motion.g>
  </>
));
