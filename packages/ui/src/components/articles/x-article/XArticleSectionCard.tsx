'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/enums';
import type { XArticleSectionCardProps } from '@genfeedai/props/content/x-article.props';
import { Blockquote } from '@genfeedai/ui';
import { createMarkup } from '@genfeedai/utils/sanitize-html';
import Card from '@ui/card/Card';
import { Button } from '@ui/primitives/button';
import { HiClipboard } from 'react-icons/hi2';

export default function XArticleSectionCard({
  section,
  onCopy,
}: XArticleSectionCardProps) {
  return (
    <Card>
      <div className="relative">
        <div className="absolute right-0 top-0">
          <Button
            label="Copy"
            variant={ButtonVariant.GHOST}
            size={ButtonSize.SM}
            icon={<HiClipboard className="h-4 w-4" />}
            onClick={() => onCopy(section.id)}
          />
        </div>

        <h2 className="pr-20 text-xl font-bold">{section.heading}</h2>

        <div
          className="prose prose-sm max-w-none mt-3 text-foreground/80"
          // biome-ignore lint/security/noDangerouslySetInnerHtml: sanitized content from createMarkup
          dangerouslySetInnerHTML={createMarkup(section.content)}
        />

        {section.pullQuote && (
          <Blockquote className="mt-4">{section.pullQuote}</Blockquote>
        )}
      </div>
    </Card>
  );
}
