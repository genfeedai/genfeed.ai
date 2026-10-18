import { useBrand } from '@genfeedai/contexts/user/brand-context/brand-context';
import { useAuthedService } from '@genfeedai/hooks/auth/use-authed-service/use-authed-service';
import { useOrgUrl } from '@genfeedai/hooks/navigation/use-org-url';
import type { PostDraftGeneratorProps } from '@genfeedai/props/modals/modal.props';
import { PostsService } from '@genfeedai/services/content/posts.service';
import { logger } from '@genfeedai/services/core/logger.service';
import { NotificationsService } from '@genfeedai/services/core/notifications.service';
import GenerationFeedback from '@ui/generation-receipts/GenerationFeedback';
import PromptBarComposer from '@ui/prompt-bars/components/shell/PromptBarComposer';
import PromptBarSendButton from '@ui/prompt-bars/components/toolbar/PromptBarSendButton';
import PromptBarToolbar from '@ui/prompt-bars/components/toolbar/PromptBarToolbar';
import PromptEditor from '@ui/prompt-editor/PromptEditor';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useRef, useState } from 'react';

export default function PostDraftGenerator({
  platform,
  format,
  isDisabled,
  onGenerate,
}: PostDraftGeneratorProps) {
  const { brandId } = useBrand();
  const translate = useTranslations('ui.postDraft');
  const [prompt, setPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [receipt, setReceipt] = useState<{ id: string; state: string } | null>(
    null,
  );
  const requestVersion = useRef(0);
  // One idempotency key per distinct request. A failed attempt retries with the
  // same key; a finished draft rotates it so "Generate" again makes a new draft.
  const pendingRequest = useRef<{ key: string; signature: string } | null>(
    null,
  );
  const { href } = useOrgUrl();
  const getService = useAuthedService(
    useCallback((token: string) => PostsService.getInstance(token), []),
  );
  // biome-ignore lint/correctness/useExhaustiveDependencies: a brand switch invalidates in-flight generation.
  useEffect(() => {
    setIsGenerating(false);
    return () => {
      requestVersion.current += 1;
    };
  }, [brandId]);
  const generate = async () => {
    const version = ++requestVersion.current;
    setIsGenerating(true);
    const signature = JSON.stringify([
      brandId,
      prompt.trim(),
      platform,
      format,
    ]);
    if (pendingRequest.current?.signature !== signature)
      pendingRequest.current = { key: crypto.randomUUID(), signature };
    try {
      const service = await getService();
      const result = await service.generateDraftText({
        brandId,
        format,
        platform,
        prompt: prompt.trim(),
        requestKey: pendingRequest.current.key,
      });
      pendingRequest.current = null;
      if (version === requestVersion.current) {
        setReceipt({
          id: result.brandedReceipt.id,
          state: result.brandedReceipt.state,
        });
        onGenerate(result.description, {
          postId: result.postId,
          receiptId: result.brandedReceipt.id,
          receiptState: result.brandedReceipt.state,
        });
      }
    } catch (error) {
      logger.error('Post draft generation failed', error);
      if (version === requestVersion.current)
        NotificationsService.getInstance().error(translate('failed'));
    } finally {
      if (version === requestVersion.current) setIsGenerating(false);
    }
  };
  const canGenerate =
    !isDisabled && !isGenerating && Boolean(prompt.trim()) && Boolean(brandId);
  const generateLabel = translate(isGenerating ? 'generating' : 'generate');
  return (
    <div className="space-y-3">
      <PromptBarComposer
        data-testid="post-draft-composer"
        density="compact"
        beforeBody={
          <p className="px-3.5 pt-2.5 text-2xs font-medium text-foreground/55">
            {translate('topic')}
          </p>
        }
      >
        <PromptEditor
          ariaLabel={translate('topic')}
          value={prompt}
          isDisabled={isDisabled || isGenerating}
          placeholder={translate('placeholder')}
          onValueChange={setPrompt}
          onSubmit={() => {
            if (canGenerate) void generate();
          }}
          className="min-h-12"
        />
        <PromptBarToolbar
          density="compact"
          leading={null}
          trailing={
            <PromptBarSendButton
              ariaLabel={generateLabel}
              density="compact"
              isDisabled={!canGenerate}
              isLoading={isGenerating}
              onClick={() => void generate()}
              tooltip={generateLabel}
            />
          }
        />
      </PromptBarComposer>
      {receipt ? (
        <p className="text-xs text-muted-foreground">
          {translate(
            receipt.state === 'ready' ? 'savedReady' : 'savedNeedsReview',
          )}{' '}
          <Link
            className="font-medium text-foreground underline underline-offset-2"
            href={`${href('/settings/agent/receipts')}?receiptId=${encodeURIComponent(receipt.id)}`}
          >
            {translate('viewReceipt')}
          </Link>
        </p>
      ) : null}
      {receipt ? (
        <GenerationFeedback brandId={brandId} receiptId={receipt.id} />
      ) : null}
    </div>
  );
}
