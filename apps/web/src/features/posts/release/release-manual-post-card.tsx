'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import {
  buildXQuoteIntentUrl,
  parseXQuotedPostId,
} from '@genfeedai/contracts/api-types/contracts/channel-capabilities.contract';
import { Alert, AlertDescription, AlertTitle } from '@ui/primitives/alert';
import { Button } from '@ui/primitives/button';
import Field from '@ui/primitives/field';
import { Form } from '@ui/primitives/form';
import { Input } from '@ui/primitives/input';
import { ExternalLink } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { type FormEvent, useState } from 'react';

interface ReleaseManualPostCardProps {
  caption: string;
  isPending: boolean;
  /** The link the person gave, or an empty string when they gave none. */
  onComplete: (postUrl: string) => void;
  onSkip: () => void;
  quotedPostId: string | null;
}

/**
 * A quote X would not take through the API. The person opens it in X with the
 * text and quote ready, posts it, then closes the target here as posted (with
 * the link, if they paste one) or skipped.
 */
export default function ReleaseManualPostCard({
  caption,
  isPending,
  onComplete,
  onSkip,
  quotedPostId,
}: ReleaseManualPostCardProps): React.JSX.Element {
  const translate = useTranslations('pages.publishing.release.manualPost');
  const [isConfirming, setIsConfirming] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  const [postUrl, setPostUrl] = useState('');
  const trimmedUrl = postUrl.trim();
  const isUrlInvalid =
    trimmedUrl.length > 0 && parseXQuotedPostId(trimmedUrl) === undefined;

  function handleCopy(): void {
    void navigator.clipboard
      .writeText(caption)
      .then(() => setIsCopied(true))
      .catch(() => setIsCopied(false));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (!isUrlInvalid) {
      onComplete(trimmedUrl);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <Alert size="sm" variant="warning">
        <AlertTitle>{translate('title')}</AlertTitle>
        <AlertDescription>{translate('description')}</AlertDescription>
      </Alert>
      {isConfirming ? (
        <Form onSubmit={handleSubmit}>
          <Field
            error={isUrlInvalid ? translate('linkInvalid') : undefined}
            helpText={isUrlInvalid ? undefined : translate('linkHelp')}
            label={translate('linkLabel')}
          >
            <Input
              onChange={(event) => setPostUrl(event.target.value)}
              placeholder={translate('linkPlaceholder')}
              value={postUrl}
            />
          </Field>
          <div className="flex flex-wrap gap-2">
            <Button
              isDisabled={isPending || isUrlInvalid}
              isLoading={isPending}
              label={translate('confirmPosted')}
              size={ButtonSize.SM}
              type="submit"
              variant={ButtonVariant.DEFAULT}
            />
            <Button
              isDisabled={isPending}
              label={translate('back')}
              onClick={() => setIsConfirming(false)}
              size={ButtonSize.SM}
              variant={ButtonVariant.GHOST}
            />
          </div>
        </Form>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button
            asChild
            icon={<ExternalLink className="size-3.5" />}
            size={ButtonSize.SM}
            variant={ButtonVariant.DEFAULT}
          >
            <Link
              href={buildXQuoteIntentUrl(caption, quotedPostId)}
              rel="noopener noreferrer"
              target="_blank"
            >
              {translate('openInX')}
            </Link>
          </Button>
          <Button
            label={isCopied ? translate('copied') : translate('copyText')}
            onClick={handleCopy}
            size={ButtonSize.SM}
            variant={ButtonVariant.SECONDARY}
          />
          <Button
            isDisabled={isPending}
            label={translate('markPosted')}
            onClick={() => setIsConfirming(true)}
            size={ButtonSize.SM}
            variant={ButtonVariant.SECONDARY}
          />
          <Button
            isDisabled={isPending}
            label={translate('skip')}
            onClick={onSkip}
            size={ButtonSize.SM}
            variant={ButtonVariant.GHOST}
          />
        </div>
      )}
    </div>
  );
}
