'use client';

import { motion } from 'motion/react';
import { createAnimatedIcon } from '../create-animated-icon';

// A social post (avatar, handle, body) in Lucide style; it writes itself in.
export const PostCardIcon = createAnimatedIcon('PostCardIcon', (controls) => (
  <>
    <rect height="18" rx="2" width="18" x="3" y="3" />
    <motion.circle
      animate={controls}
      cx="8"
      cy="8"
      r="2"
      style={{ transformBox: 'view-box', transformOrigin: '8px 8px' }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
      variants={{ animate: { scale: [1, 1.3, 1] }, normal: { scale: 1 } }}
    />
    <motion.path
      animate={controls}
      d="M12.5 7h4.5"
      transition={{ delay: 0.05, duration: 0.35, ease: 'easeOut' }}
      variants={{
        animate: { opacity: [0, 1], pathLength: [0, 1] },
        normal: { opacity: 1, pathLength: 1 },
      }}
    />
    <motion.path
      animate={controls}
      d="M12.5 9.5h2.5"
      transition={{ delay: 0.12, duration: 0.35, ease: 'easeOut' }}
      variants={{
        animate: { opacity: [0, 1], pathLength: [0, 1] },
        normal: { opacity: 1, pathLength: 1 },
      }}
    />
    <motion.path
      animate={controls}
      d="M7 14h10"
      transition={{ delay: 0.2, duration: 0.35, ease: 'easeOut' }}
      variants={{
        animate: { opacity: [0, 1], pathLength: [0, 1] },
        normal: { opacity: 1, pathLength: 1 },
      }}
    />
    <motion.path
      animate={controls}
      d="M7 17h6"
      transition={{ delay: 0.28, duration: 0.35, ease: 'easeOut' }}
      variants={{
        animate: { opacity: [0, 1], pathLength: [0, 1] },
        normal: { opacity: 1, pathLength: 1 },
      }}
    />
  </>
));
