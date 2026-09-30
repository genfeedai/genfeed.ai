'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import { Button } from '@ui/primitives/button';
import { MessageCircle } from 'lucide-react';
import { useTranslations } from 'next-intl';

type AgentConversationBubbleProps = {
  readonly onOpen: () => void;
};

export default function AgentConversationBubble({
  onOpen,
}: AgentConversationBubbleProps) {
  const translate = useTranslations('common.agentDock');

  return (
    <Button
      ariaLabel={translate('open')}
      className="absolute bottom-24 right-6 z-30 flex size-12 items-center justify-center rounded-full shadow-lg"
      data-testid="agent-conversation-bubble"
      icon={<MessageCircle className="size-5" />}
      onClick={onOpen}
      size={ButtonSize.ICON}
      variant={ButtonVariant.DEFAULT}
      withWrapper={false}
    />
  );
}
