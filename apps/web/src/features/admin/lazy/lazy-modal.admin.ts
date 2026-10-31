import dynamic from 'next/dynamic';

export const LazyModalRole = dynamic(
  () => import('@/features/admin/modals/ModalRole'),
  {
    ssr: false,
  },
);

export const LazyModalSubscription = dynamic(
  () => import('@/features/admin/modals/ModalSubscription'),
  {
    ssr: false,
  },
);
