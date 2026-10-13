'use client';

import { motion } from 'motion/react';
import { createAnimatedIcon } from '../create-animated-icon';

// Lucide SquarePlay; the play button pushes forward.
export const SquarePlayIcon = createAnimatedIcon(
  'SquarePlayIcon',
  (controls) => (
    <>
      <rect height="18" rx="2" width="18" x="3" y="3" />
      <motion.path
        animate={controls}
        d="M9 9.003a1 1 0 0 1 1.517-.859l4.997 2.997a1 1 0 0 1 0 1.718l-4.997 2.997A1 1 0 0 1 9 14.996z"
        style={{ transformBox: 'view-box', transformOrigin: '12px 12px' }}
        transition={{ duration: 0.4, ease: 'easeOut' }}
        variants={{
          animate: { scale: [1, 1.25, 1], x: [0, 1, 0] },
          normal: { scale: 1, x: 0 },
        }}
      />
    </>
  ),
);
