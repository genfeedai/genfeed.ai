'use client';

import { motion } from 'motion/react';
import { createAnimatedIcon } from '../create-animated-icon';

// Lucide MessageSquareText; the lines write themselves.
export const MessageSquareTextIcon = createAnimatedIcon(
  'MessageSquareTextIcon',
  (controls) => (
    <>
      <path d="M22 17a2 2 0 0 1-2 2H6.828a2 2 0 0 0-1.414.586l-2.202 2.202A.71.71 0 0 1 2 21.286V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2z" />
      <motion.path
        animate={controls}
        d="M7 7h8"
        transition={{ delay: 0, duration: 0.35, ease: 'easeOut' }}
        variants={{
          animate: { opacity: [0, 1], pathLength: [0, 1] },
          normal: { opacity: 1, pathLength: 1 },
        }}
      />
      <motion.path
        animate={controls}
        d="M7 11h10"
        transition={{ delay: 0.1, duration: 0.35, ease: 'easeOut' }}
        variants={{
          animate: { opacity: [0, 1], pathLength: [0, 1] },
          normal: { opacity: 1, pathLength: 1 },
        }}
      />
      <motion.path
        animate={controls}
        d="M7 15h6"
        transition={{ delay: 0.2, duration: 0.35, ease: 'easeOut' }}
        variants={{
          animate: { opacity: [0, 1], pathLength: [0, 1] },
          normal: { opacity: 1, pathLength: 1 },
        }}
      />
    </>
  ),
);
