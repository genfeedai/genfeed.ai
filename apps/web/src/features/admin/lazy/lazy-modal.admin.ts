import dynamic from 'next/dynamic';

export const LazyModalRole = dynamic(
  () => import('@/features/admin/modals/ModalRole'),
  {
    ssr: false,
  },
);
