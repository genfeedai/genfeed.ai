import type { TrainingLayoutProps } from '@genfeedai/interfaces/training-layout.interface';
import PageLoadingState from '@ui/loading/page/PageLoadingState';
import { Suspense } from 'react';
import TrainingDetail from './training-detail';

export default async function TrainingLayout({
  children,
  params,
}: TrainingLayoutProps) {
  const { id } = await params;

  return (
    <Suspense fallback={<PageLoadingState />}>
      <TrainingDetail trainingId={id}>{children}</TrainingDetail>
    </Suspense>
  );
}
