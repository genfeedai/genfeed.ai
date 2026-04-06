import LazyLoadingFallback from '@components/loading/fallback/LazyLoadingFallback';
import type { TrainingLayoutProps } from '@genfeedai/interfaces/training-layout.interface';
import TrainingDetail from '@pages/trainings/detail/training-detail';
import { Suspense } from 'react';

export default async function TrainingLayout({
  children,
  params,
}: TrainingLayoutProps) {
  const { id } = await params;

  return (
    <Suspense fallback={<LazyLoadingFallback variant="grid" />}>
      <TrainingDetail trainingId={id}>{children}</TrainingDetail>
    </Suspense>
  );
}
