'use client';

import { motion } from 'motion/react';
import { createAnimatedIcon } from '../create-animated-icon';

// Lucide Building2; the windows light up in turn.
export const Building2Icon = createAnimatedIcon('Building2Icon', (controls) => (
  <>
    <path d="M14 21v-3a2 2 0 0 0-4 0v3" />
    <path d="M6 10H4a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-2" />
    <path d="M6 21V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16" />
    <motion.path
      animate={controls}
      d="M10 8h4"
      transition={{ delay: 0, duration: 0.3 }}
      variants={{ animate: { opacity: [1, 0.15, 1] }, normal: { opacity: 1 } }}
    />
    <motion.path
      animate={controls}
      d="M10 12h4"
      transition={{ delay: 0.15, duration: 0.3 }}
      variants={{ animate: { opacity: [1, 0.15, 1] }, normal: { opacity: 1 } }}
    />
  </>
));
