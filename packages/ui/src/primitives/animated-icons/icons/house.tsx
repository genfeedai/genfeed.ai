'use client';

import { motion } from 'motion/react';
import { createAnimatedIcon } from '../create-animated-icon';

// Lucide House; the roof hops and the door opens.
export const HouseIcon = createAnimatedIcon('HouseIcon', (controls) => (
  <>
    <motion.g
      animate={controls}
      transition={{ duration: 0.45, ease: 'easeOut' }}
      variants={{ animate: { y: [0, -1.5, 0, -0.5, 0] }, normal: { y: 0 } }}
    >
      <path d="M3 10a2 2 0 0 1 .709-1.528l7-6a2 2 0 0 1 2.582 0l7 6A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    </motion.g>
    <motion.path
      animate={controls}
      d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8"
      style={{ transformBox: 'view-box', transformOrigin: '12px 21px' }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
      variants={{ animate: { scaleY: [1, 0.6, 1] }, normal: { scaleY: 1 } }}
    />
  </>
));
