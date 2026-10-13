'use client';

import { motion } from 'motion/react';
import { createAnimatedIcon } from '../create-animated-icon';

// GalleryHorizontalEnd mirrored (Lucide has no start variant); the card slides in.
export const GalleryHorizontalStartIcon = createAnimatedIcon(
  'GalleryHorizontalStartIcon',
  (controls) => (
    <>
      <motion.path
        animate={controls}
        d="M22 7v10"
        transition={{ delay: 0.1, duration: 0.3 }}
        variants={{ animate: { opacity: [1, 0.2, 1] }, normal: { opacity: 1 } }}
      />
      <motion.path
        animate={controls}
        d="M18 5v14"
        transition={{ delay: 0.05, duration: 0.3 }}
        variants={{ animate: { opacity: [1, 0.2, 1] }, normal: { opacity: 1 } }}
      />
      <motion.rect
        animate={controls}
        height="18"
        rx="2"
        transition={{ duration: 0.4, ease: 'easeOut' }}
        variants={{ animate: { x: [2, 0, 2] }, normal: { x: 2 } }}
        width="12"
        y="3"
      />
    </>
  ),
);
