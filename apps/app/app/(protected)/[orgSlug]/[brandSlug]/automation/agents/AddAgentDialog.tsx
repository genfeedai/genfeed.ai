import type {
  AddAgentDialogProps,
  AddAgentMode,
} from '@props/automation/add-agent-dialog.props';
import Tabs from '@ui/navigation/tabs/Tabs';
import { Button } from '@ui/primitives/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@ui/primitives/dialog';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { useOpenAgentComposer } from '@/hooks/use-open-agent-composer';
import ContentTeamHirePage from '../hire/ContentTeamHirePage';

export type { AddAgentMode } from '@props/automation/add-agent-dialog.props';

export default function AddAgentDialog({
  initialMode = 'library',
  isOpen,
  onCreated,
  onOpenChange,
}: AddAgentDialogProps) {
  const openAgentComposer = useOpenAgentComposer();
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
      <DialogContent className="max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] max-w-4xl overflow-y-auto overscroll-contain">
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
            <div className="space-y-4 py-4">
              <p className="text-sm text-muted-foreground">
                {translate('customDescription')}
              </p>
              <Button
                onClick={() => {
                  openAgentComposer(
                    'Help me hire an agent to create recurring content for this brand. Ask for my platforms, topics, voice, cadence, and credit budget, then show the recurring task for approval.',
                  );
                  onOpenChange(false);
                }}
              >
                {translate('customAction')}
              </Button>
            </div>
          )}
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
