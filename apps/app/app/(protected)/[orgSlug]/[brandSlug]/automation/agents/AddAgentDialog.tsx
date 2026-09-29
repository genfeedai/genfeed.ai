import type {
  AddAgentDialogProps,
  AddAgentMode,
} from '@props/automation/add-agent-dialog.props';
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
import CustomAgentForm from './CustomAgentForm';

export type { AddAgentMode } from '@props/automation/add-agent-dialog.props';

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
    onOpenChange(false);
    await onCreated();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] max-w-4xl overflow-y-auto overscroll-contain border border-border bg-background">
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
            <ContentTeamHirePage isEmbedded onCreated={handleCreated} />
          ) : (
            <CustomAgentForm onCreated={handleCreated} />
          )}
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
