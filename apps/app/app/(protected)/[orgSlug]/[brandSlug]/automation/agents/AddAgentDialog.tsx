'use client';

import Tabs from '@ui/navigation/tabs/Tabs';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@ui/primitives/dialog';
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
          activeTab={mode}
          ariaLabel={translate('modeLabel')}
          contentClassName="mt-4"
          fullWidth={false}
          items={[
            { id: 'library', label: translate('library') },
            { id: 'custom', label: translate('custom') },
          ]}
          onTabChange={(value) => setMode(value as AddAgentMode)}
        >
          {mode === 'library' ? (
            <ContentTeamHirePage
              isEmbedded
              onCancel={() => onOpenChange(false)}
              onCreated={handleCreated}
            />
          ) : (
            <AgentWizardPage isEmbedded onCreated={handleCreated} />
          )}
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
