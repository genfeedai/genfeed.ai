'use client';

import { motion } from 'motion/react';
import { createAnimatedIcon } from '../create-animated-icon';

// Lucide LibraryBig; the leaning volume tips.
export const LibraryBigIcon = createAnimatedIcon(
  'LibraryBigIcon',
  (controls) => (
    <>
      <rect height="18" rx="1" width="8" x="3" y="3" />
      <path d="M7 3v18" />
      <motion.path
        animate={controls}
        d="M20.4 18.9c.2.5-.1 1.1-.6 1.3l-1.9.7c-.5.2-1.1-.1-1.3-.6L11.1 5.1c-.2-.5.1-1.1.6-1.3l1.9-.7c.5-.2 1.1.1 1.3.6Z"
        style={{ transformBox: 'view-box', transformOrigin: '18px 20.5px' }}
        transition={{ duration: 0.5, ease: 'easeInOut' }}
        variants={{ animate: { rotate: [0, -10, 0] }, normal: { rotate: 0 } }}
      />
    </>
  ),
);
