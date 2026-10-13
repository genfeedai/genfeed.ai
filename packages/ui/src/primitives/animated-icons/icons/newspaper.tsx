'use client';

import { motion } from 'motion/react';
import { createAnimatedIcon } from '../create-animated-icon';

// Lucide Newspaper; the columns write themselves.
export const NewspaperIcon = createAnimatedIcon('NewspaperIcon', (controls) => (
  <>
    <path d="M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-4 0v-9a2 2 0 0 1 2-2h2" />
    <rect height="4" rx="1" width="8" x="10" y="6" />
    <motion.path
      animate={controls}
      d="M18 14h-8"
      transition={{ delay: 0, duration: 0.35, ease: 'easeOut' }}
      variants={{
        animate: { opacity: [0, 1], pathLength: [0, 1] },
        normal: { opacity: 1, pathLength: 1 },
      }}
    />
    <motion.path
      animate={controls}
      d="M15 18h-5"
      transition={{ delay: 0.12, duration: 0.35, ease: 'easeOut' }}
      variants={{
        animate: { opacity: [0, 1], pathLength: [0, 1] },
        normal: { opacity: 1, pathLength: 1 },
      }}
    />
  </>
));
