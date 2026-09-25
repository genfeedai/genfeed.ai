'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import type { AgentContextPromptCardProps } from '@props/settings/agent-context.props';
import { ClipboardService } from '@services/core/clipboard.service';
import Card from '@ui/card/Card';
import { Button } from '@ui/primitives/button';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@ui/primitives/collapsible';
import { Pre } from '@ui/primitives/pre';
import { Copy } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

/** The exact system prompt a chat turn sends, collapsed by default. */
export default function AgentContextPromptCard({
  memoryPrompt,
  systemPrompt,
}: AgentContextPromptCardProps) {
  const translate = useTranslations('pages.brandAgentContext');
  const [isOpen, setIsOpen] = useState(false);
  const fullPrompt = memoryPrompt
    ? `${systemPrompt}\n\n${memoryPrompt}`
    : systemPrompt;

  // The clipboard service reports success or failure itself.
  const handleCopy = () =>
    ClipboardService.getInstance().copyToClipboard(fullPrompt);

  return (
    <Card
      description={translate('prompt.description')}
      headerAction={
        <Button
          icon={<Copy className="size-3.5" />}
          label={translate('prompt.copy')}
          onClick={() => void handleCopy()}
          size={ButtonSize.XS}
          variant={ButtonVariant.GHOST}
        />
      }
      label={translate('prompt.title')}
    >
      <Collapsible onOpenChange={setIsOpen} open={isOpen}>
        <CollapsibleTrigger>
          {isOpen ? translate('prompt.hide') : translate('prompt.show')}
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="flex flex-col gap-3">
            <Pre className="max-h-[32rem] overflow-auto whitespace-pre-wrap break-words text-xs">
              {systemPrompt}
            </Pre>
            {memoryPrompt ? (
              <div className="flex flex-col gap-1">
                <p className="text-xs font-medium text-muted-foreground">
                  {translate('prompt.memoryBlock')}
                </p>
                <Pre className="max-h-[20rem] overflow-auto whitespace-pre-wrap break-words text-xs">
                  {memoryPrompt}
                </Pre>
              </div>
            ) : null}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}
