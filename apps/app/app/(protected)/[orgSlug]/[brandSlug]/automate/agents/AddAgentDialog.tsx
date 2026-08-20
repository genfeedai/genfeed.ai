'use client';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@ui/primitives/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@ui/primitives/tabs';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import ContentTeamHirePage from '../hire/ContentTeamHirePage';
import AgentWizardPage from './new/AgentWizardPage';

export type AddAgentMode = 'custom' | 'library';

interface AddAgentDialogProps {
  initialMode?: AddAgentMode;
  isOpen: boolean;
  onCreated: () => Promise<void> | void;
  onOpenChange: (isOpen: boolean) => void;
}

export default function AddAgentDialog({
  initialMode = 'library',
  isOpen,
  onCreated,
  onOpenChange,
}: AddAgentDialogProps) {
  const translate = useTranslations('common.automation.agentCreation');
  const [mode, setMode] = useState<AddAgentMode>(initialMode);

  useEffect(() => {
    if (isOpen) {
      setMode(initialMode);
    }
  }, [initialMode, isOpen]);

  const handleCreated = async () => {
    await onCreated();
    onOpenChange(false);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] max-w-3xl overflow-y-auto overscroll-contain">
        <DialogHeader>
          <DialogTitle>{translate('title')}</DialogTitle>
          <DialogDescription>{translate('description')}</DialogDescription>
        </DialogHeader>

        <Tabs
          value={mode}
          onValueChange={(value) => setMode(value as AddAgentMode)}
        >
          <TabsList
            aria-label={translate('modeLabel')}
            data-variant="segmented"
          >
            <TabsTrigger value="library" data-variant="segmented">
              {translate('library')}
            </TabsTrigger>
            <TabsTrigger value="custom" data-variant="segmented">
              {translate('custom')}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="library" className="mt-4">
            <ContentTeamHirePage
              isEmbedded
              onCancel={() => onOpenChange(false)}
              onCreated={handleCreated}
            />
          </TabsContent>

          <TabsContent value="custom" className="mt-4">
            <AgentWizardPage isEmbedded onCreated={handleCreated} />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
