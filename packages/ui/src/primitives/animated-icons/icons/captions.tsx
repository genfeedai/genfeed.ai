'use client';

import { motion } from 'motion/react';
import { createAnimatedIcon } from '../create-animated-icon';

// Lucide Captions; the subtitle lines type in.
export const CaptionsIcon = createAnimatedIcon('CaptionsIcon', (controls) => (
  <>
    <rect height="14" rx="2" ry="2" width="18" x="3" y="5" />
    <motion.path
      animate={controls}
      d="M7 11h2"
      transition={{ delay: 0, duration: 0.35, ease: 'easeOut' }}
      variants={{
        animate: { opacity: [0, 1], pathLength: [0, 1] },
        normal: { opacity: 1, pathLength: 1 },
      }}
    />
    <motion.path
      animate={controls}
      d="M13 11h4"
      transition={{ delay: 0.08, duration: 0.35, ease: 'easeOut' }}
      variants={{
        animate: { opacity: [0, 1], pathLength: [0, 1] },
        normal: { opacity: 1, pathLength: 1 },
      }}
    />
    <motion.path
      animate={controls}
      d="M7 15h4"
      transition={{ delay: 0.16, duration: 0.35, ease: 'easeOut' }}
      variants={{
        animate: { opacity: [0, 1], pathLength: [0, 1] },
        normal: { opacity: 1, pathLength: 1 },
      }}
    />
    <motion.path
      animate={controls}
      d="M15 15h2"
      transition={{ delay: 0.24, duration: 0.35, ease: 'easeOut' }}
      variants={{
        animate: { opacity: [0, 1], pathLength: [0, 1] },
        normal: { opacity: 1, pathLength: 1 },
      }}
    />
  </>
));
