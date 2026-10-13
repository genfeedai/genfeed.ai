'use client';

import { motion } from 'motion/react';
import { createAnimatedIcon } from '../create-animated-icon';

// Lucide Quote; the two marks hop one after the other. A hook is the opening line.
export const QuoteIcon = createAnimatedIcon('QuoteIcon', (controls) => (
  <>
    <motion.path
      animate={controls}
      d="M5 3a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2 1 1 0 0 1 1 1v1a2 2 0 0 1-2 2 1 1 0 0 0-1 1v2a1 1 0 0 0 1 1 6 6 0 0 0 6-6V5a2 2 0 0 0-2-2z"
      transition={{ delay: 0, duration: 0.35, ease: 'easeOut' }}
      variants={{ animate: { y: [0, -2.5, 0] }, normal: { y: 0 } }}
    />
    <motion.path
      animate={controls}
      d="M16 3a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2 1 1 0 0 1 1 1v1a2 2 0 0 1-2 2 1 1 0 0 0-1 1v2a1 1 0 0 0 1 1 6 6 0 0 0 6-6V5a2 2 0 0 0-2-2z"
      transition={{ delay: 0.12, duration: 0.35, ease: 'easeOut' }}
      variants={{ animate: { y: [0, -2.5, 0] }, normal: { y: 0 } }}
    />
  </>
));
