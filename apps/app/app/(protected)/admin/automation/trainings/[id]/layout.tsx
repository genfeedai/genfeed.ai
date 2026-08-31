import type { TrainingLayoutProps } from '@genfeedai/interfaces/training-layout.interface';
import { Suspense } from 'react';
import TrainingDetail from './training-detail';

export default async function TrainingLayout({
  children,
  params,
}: TrainingLayoutProps) {
  const { id } = await params;

  return (
    <Suspense fallback={null}>
      <TrainingDetail trainingId={id}>{children}</TrainingDetail>
    </Suspense>
  );
}
