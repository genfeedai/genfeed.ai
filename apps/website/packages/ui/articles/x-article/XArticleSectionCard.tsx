'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/enums';
import type { XArticleSectionCardProps } from '@props/content/x-article.props';
import Button from '@ui/buttons/base/Button';
import Card from '@ui/card/Card';
import { createMarkup } from '@utils/sanitize-html';
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
          dangerouslySetInnerHTML={createMarkup(section.content)}
        />

        {section.pullQuote && (
          <blockquote className="mt-4 border-l-4 border-primary/60 pl-4 italic text-foreground/70">
            {section.pullQuote}
          </blockquote>
        )}
      </div>
    </Card>
  );
}
