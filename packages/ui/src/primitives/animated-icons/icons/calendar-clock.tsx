'use client';

import { motion } from 'motion/react';
import { createAnimatedIcon } from '../create-animated-icon';

// Lucide CalendarClock; the clock hand sweeps a full turn.
export const CalendarClockIcon = createAnimatedIcon(
  'CalendarClockIcon',
  (controls) => (
    <>
      <path d="M16 2v4" />
      <path d="M21 7.5V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h3.5" />
      <path d="M3 10h5" />
      <path d="M8 2v4" />
      <circle cx="16" cy="16" r="6" />
      <motion.path
        animate={controls}
        d="M16 14v2.2l1.6 1"
        style={{ transformBox: 'view-box', transformOrigin: '16px 16px' }}
        transition={{ duration: 0.6, ease: 'easeInOut' }}
        variants={{ animate: { rotate: [0, 360] }, normal: { rotate: 0 } }}
      />
    </>
  ),
);
