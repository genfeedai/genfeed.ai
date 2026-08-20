'use client';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@ui/primitives/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@ui/primitives/tabs';
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
      <DialogContent className="max-h-[90vh] max-w-5xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add agent</DialogTitle>
          <DialogDescription>
            Start from a proven role or configure a custom agent for the
            selected brand.
          </DialogDescription>
        </DialogHeader>

        <Tabs
          value={mode}
          onValueChange={(value) => setMode(value as AddAgentMode)}
        >
          <TabsList aria-label="Agent creation mode" data-variant="segmented">
            <TabsTrigger value="library" data-variant="segmented">
              Agent library
            </TabsTrigger>
            <TabsTrigger value="custom" data-variant="segmented">
              Custom
            </TabsTrigger>
          </TabsList>

          <TabsContent value="library" className="mt-5">
            <ContentTeamHirePage
              isEmbedded
              onCancel={() => onOpenChange(false)}
              onCreated={handleCreated}
            />
          </TabsContent>

          <TabsContent value="custom" className="mt-5">
            <AgentWizardPage isEmbedded onCreated={handleCreated} />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
