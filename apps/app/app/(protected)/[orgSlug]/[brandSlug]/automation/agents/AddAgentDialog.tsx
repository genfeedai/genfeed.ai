import { ButtonVariant } from '@genfeedai/contracts';
import { useCollectionScope } from '@hooks/navigation/use-collection-scope/use-collection-scope';
import type { AddAgentDialogProps } from '@props/automation/add-agent-dialog.props';
import { Button } from '@ui/primitives/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@ui/primitives/dialog';
import { MessageSquarePlus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import ContentTeamHirePage from '../hire/ContentTeamHirePage';
import {
  buildContentAgentSetupPrompt,
  useOpenContentAgentConversation,
} from './open-content-agent-conversation';

/**
 * Hires an agent: a marketplace agent activates in one click, and anything
 * custom is described in the agent conversation, which saves it.
 */
export default function AddAgentDialog({
  isOpen,
  onCreated,
  onOpenChange,
}: AddAgentDialogProps) {
  const translate = useTranslations('common.automation.agentCreation');
  const { brandId } = useCollectionScope();
  const openContentAgentConversation = useOpenContentAgentConversation();

  const handleCreated = async () => {
    onOpenChange(false);
    await onCreated();
  };

  const handleHireFromChat = () => {
    if (!brandId) {
      return;
    }
    onOpenChange(false);
    openContentAgentConversation(buildContentAgentSetupPrompt(brandId));
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] max-w-4xl overflow-y-auto overscroll-contain border border-border bg-background">
        <DialogHeader>
          <DialogTitle>{translate('title')}</DialogTitle>
          <DialogDescription>{translate('description')}</DialogDescription>
        </DialogHeader>

        <ContentTeamHirePage isEmbedded onCreated={handleCreated} />

        <DialogFooter className="items-center gap-3 sm:justify-between sm:space-x-0">
          <p className="text-sm text-muted-foreground">
            {translate('hireFromChatDescription')}
          </p>
          <Button
            icon={<MessageSquarePlus className="size-4" />}
            isDisabled={!brandId}
            label={translate('hireFromChat')}
            onClick={handleHireFromChat}
            variant={ButtonVariant.SECONDARY}
          />
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
