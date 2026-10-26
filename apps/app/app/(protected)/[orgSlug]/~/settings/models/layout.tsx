'use client';

import { ModelsProvider } from '@contexts/models/models-context/models-context';
import { ModelsToolbarProvider } from '@contexts/models/models-toolbar-context/models-toolbar-context';
import { TrainingsProvider } from '@contexts/models/trainings-context/trainings-context';
import type { LayoutProps } from '@props/layout/layout.props';
import ModelsLayoutContent from './models-layout-content';

export default function ModelsLayout({ children }: LayoutProps) {
  return (
    <ModelsProvider>
      <TrainingsProvider>
        <ModelsToolbarProvider>
          <ModelsLayoutContent>{children}</ModelsLayoutContent>
        </ModelsToolbarProvider>
      </TrainingsProvider>
    </ModelsProvider>
  );
}
