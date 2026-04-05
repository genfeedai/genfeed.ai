'use client';

import { ModelsProvider } from '@contexts/models/models-context/models-context';
import { TrainingsProvider } from '@contexts/models/trainings-context/trainings-context';
import ModelsLayoutContent from '@pages/models/models-layout-content';
import type { LayoutProps } from '@props/layout/layout.props';

export default function ModelsLayout({ children }: LayoutProps) {
  return (
    <ModelsProvider>
      <TrainingsProvider>
        <ModelsLayoutContent>{children}</ModelsLayoutContent>
      </TrainingsProvider>
    </ModelsProvider>
  );
}
