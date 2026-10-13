'use client';

import { motion } from 'motion/react';
import { createAnimatedIcon } from '../create-animated-icon';

// Lucide Shapes; each shape turns or pops on its own.
export const ShapesIcon = createAnimatedIcon('ShapesIcon', (controls) => (
  <>
    <motion.path
      animate={controls}
      d="M8.3 10a.7.7 0 0 1-.626-1.079L11.4 3a.7.7 0 0 1 1.198-.043L16.3 8.9a.7.7 0 0 1-.572 1.1Z"
      style={{ transformBox: 'view-box', transformOrigin: '12px 6.5px' }}
      transition={{ duration: 0.5, ease: 'easeInOut' }}
      variants={{ animate: { rotate: [0, -20, 0] }, normal: { rotate: 0 } }}
    />
    <motion.rect
      animate={controls}
      height="7"
      rx="1"
      style={{ transformBox: 'view-box', transformOrigin: '6.5px 17.5px' }}
      transition={{ delay: 0.08, duration: 0.5, ease: 'easeInOut' }}
      variants={{ animate: { rotate: [0, 20, 0] }, normal: { rotate: 0 } }}
      width="7"
      x="3"
      y="14"
    />
    <motion.circle
      animate={controls}
      cx="17.5"
      cy="17.5"
      r="3.5"
      style={{ transformBox: 'view-box', transformOrigin: '17.5px 17.5px' }}
      transition={{ delay: 0.16, duration: 0.4, ease: 'easeOut' }}
      variants={{ animate: { scale: [1, 1.2, 1] }, normal: { scale: 1 } }}
    />
  </>
));
