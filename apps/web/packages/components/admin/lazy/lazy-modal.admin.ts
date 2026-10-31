import dynamic from 'next/dynamic';

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
