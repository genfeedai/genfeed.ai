'use client';

import { motion } from 'motion/react';
import { createAnimatedIcon } from '../create-animated-icon';

// Lucide Mail; the flap lifts and the envelope tips.
export const MailIcon = createAnimatedIcon('MailIcon', (controls) => (
  <>
    <motion.g
      animate={controls}
      style={{ transformBox: 'view-box', transformOrigin: '12px 12px' }}
      transition={{ duration: 0.5, ease: 'easeInOut' }}
      variants={{ animate: { rotate: [0, -8, 6, 0] }, normal: { rotate: 0 } }}
    >
      <rect height="16" rx="2" width="20" x="2" y="4" />
      <motion.path
        animate={controls}
        d="m22 7-8.991 5.727a2 2 0 0 1-2.009 0L2 7"
        transition={{ duration: 0.5, ease: 'easeInOut' }}
        variants={{ animate: { y: [0, -2, 0] }, normal: { y: 0 } }}
      />
    </motion.g>
  </>
));
