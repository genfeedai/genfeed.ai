'use client';

import dynamic from 'next/dynamic';

export * from '@components/lazy/modal/LazyModal';

export const LazyModalRole = dynamic(
  () => import('@components/modals/ModalRole'),
  {
    ssr: false,
  },
);

export const LazyModalSubscription = dynamic(
  () => import('@components/modals/ModalSubscription'),
  {
    ssr: false,
  },
);
