import { AgentMediaArtifactPreview } from '@genfeedai/agent/components/AgentMediaArtifactPreview';
import { AgentTextArtifactPreview } from '@genfeedai/agent/components/AgentTextArtifactPreview';
import type { AgentUiAction } from '@genfeedai/agent/models/agent-chat.model';
import type { AgentApiService } from '@genfeedai/agent/services/agent-api.service';
import { runAgentApiEffect } from '@genfeedai/agent/services/agent-base-api.service';
import { collectConnectPlatforms } from '@genfeedai/agent/utils/collapse-oauth-connect-cards';
import { normalizeAgentAppHref } from '@genfeedai/agent/utils/normalize-agent-app-href';
import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import { cn } from '@helpers/formatting/cn/cn.util';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import { Button } from '@ui/primitives/button';
import { buttonVariants } from '@ui/primitives/button.variants';
import { type ReactElement, useCallback, useEffect, useState } from 'react';

const MAX_ASSET_RECONCILIATION_ATTEMPTS = 150;
const MAX_VIDEO_RECONCILIATION_ATTEMPTS = 900;

function formatPlatformLabel(platform: string): string {
  const normalized = platform.trim().toLowerCase();

  switch (normalized) {
    case 'x':
    case 'twitter':
      return 'X (Twitter)';
    case 'linkedin':
      return 'LinkedIn';
    case 'youtube':
      return 'YouTube';
    case 'tiktok':
      return 'TikTok';
    case 'instagram':
      return 'Instagram';
    case 'facebook':
      return 'Facebook';
    default:
      return normalized.charAt(0).toUpperCase() + normalized.slice(1);
  }
}

function GenericOAuthConnectCard({
  action,
}: {
  action: AgentUiAction;
}): ReactElement {
  const { orgHref } = useOrgUrl();
  const description =
    action.description ??
    'Connect Instagram, X, LinkedIn, TikTok, YouTube, or another supported platform to continue.';
  const rawIntegrationHref =
    action.ctas?.find((cta) => cta.href)?.href ?? '/settings/api-keys';
  const integrationHref = rawIntegrationHref.startsWith('/settings/api-keys')
    ? orgHref(rawIntegrationHref)
    : rawIntegrationHref;

  return (
    <div className="mt-2 rounded-lg border border-border bg-background p-3">
      <p className="mb-2 text-sm font-medium text-foreground">
        {action.title || 'Choose an integration'}
      </p>
      <p className="mb-3 text-xs leading-5 text-muted-foreground">
        {description}
      </p>
      <a
        href={integrationHref}
        className={cn(
          buttonVariants({
            size: ButtonSize.SM,
            variant: ButtonVariant.DEFAULT,
          }),
          'inline-flex w-fit',
        )}
      >
        Open integrations
      </a>
    </div>
  );
}

export function OAuthConnectCard({
  action,
  onConnect,
}: {
  action: AgentUiAction;
  onConnect?: (platform: string) => void | Promise<void>;
}): ReactElement {
  const [connectingPlatform, setConnectingPlatform] = useState<string | null>(
    null,
  );
  const [connectError, setConnectError] = useState<string | null>(null);

  const platforms = collectConnectPlatforms(action);

  const handleConnect = useCallback(
    async (platform: string) => {
      if (!onConnect || connectingPlatform) {
        return;
      }

      setConnectError(null);
      setConnectingPlatform(platform);
      try {
        await onConnect(platform);
      } catch {
        setConnectError('Could not start the connection. Please try again.');
      } finally {
        setConnectingPlatform(null);
      }
    },
    [connectingPlatform, onConnect],
  );

  if (platforms.length === 0) {
    return <GenericOAuthConnectCard action={action} />;
  }

  const isSinglePlatform = platforms.length === 1;
  // The title already names the platform for a single card, so the button
  // carries the verb only — repeating "Connect X (Twitter)" twice reads as a
  // rendering bug.
  const title = action.title?.trim().length
    ? action.title
    : isSinglePlatform
      ? `Connect ${formatPlatformLabel(platforms[0])}`
      : 'Connect an account';

  return (
    <div className="mt-2 rounded-lg border border-border bg-background p-3">
      <p className="text-sm font-medium text-foreground">{title}</p>
      {action.description ? (
        <p className="mt-1 text-xs leading-5 text-muted-foreground">
          {action.description}
        </p>
      ) : null}
      <div className="mt-3 flex flex-wrap gap-2">
        {platforms.map((platform) => {
          const label = formatPlatformLabel(platform);

          return (
            <Button
              key={platform}
              variant={ButtonVariant.DEFAULT}
              size={ButtonSize.SM}
              onClick={() => {
                void handleConnect(platform);
              }}
              isDisabled={!onConnect || connectingPlatform !== null}
              isLoading={connectingPlatform === platform}
            >
              {isSinglePlatform ? `Connect ${label}` : label}
            </Button>
          );
        })}
      </div>
      {connectError ? (
        <p className="mt-2 text-xs text-destructive " role="alert">
          {connectError}
        </p>
      ) : null}
    </div>
  );
}

export function ContentPreviewCard({
  action,
  apiService,
  onCopy,
}: {
  action: AgentUiAction;
  apiService?: AgentApiService;
  onCopy?: (content: string) => void | Promise<void>;
}): ReactElement {
  const [reconciledUrl, setReconciledUrl] = useState<string>();
  const [reconciledStatus, setReconciledStatus] = useState(action.status);
  const [reconciliationError, setReconciliationError] = useState<string>();

  useEffect(() => {
    if (!apiService || !action.assetId || reconciledUrl) {
      return;
    }
    const controller = new AbortController();
    const maxAttempts =
      action.assetKind === 'video'
        ? MAX_VIDEO_RECONCILIATION_ATTEMPTS
        : MAX_ASSET_RECONCILIATION_ATTEMPTS;
    let attempts = 0;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const reconcile = async () => {
      attempts += 1;
      try {
        const asset = await runAgentApiEffect(
          apiService.getGeneratedAssetEffect(
            action.assetId as string,
            controller.signal,
          ),
        );
        setReconciledStatus(asset.status);
        if (asset.url) {
          setReconciledUrl(asset.url);
          return;
        }
        if (
          attempts < maxAttempts &&
          !['archived', 'cancelled', 'failed', 'rejected'].includes(
            asset.status.toLowerCase(),
          )
        ) {
          timeout = setTimeout(reconcile, 2_000);
        } else if (attempts >= maxAttempts) {
          setReconciledStatus('failed');
          setReconciliationError(
            'Unable to reconcile generated media. Please refresh and try again.',
          );
        }
      } catch {
        if (!controller.signal.aborted && attempts < maxAttempts) {
          timeout = setTimeout(reconcile, 4_000);
        } else if (!controller.signal.aborted) {
          setReconciledStatus('failed');
          setReconciliationError(
            'Unable to reconcile generated media. Please refresh and try again.',
          );
        }
      }
    };
    void reconcile();
    return () => {
      controller.abort();
      if (timeout) clearTimeout(timeout);
    };
  }, [action.assetId, action.assetKind, apiService, reconciledUrl]);

  const resolvedImages =
    action.assetKind === 'image' && reconciledUrl
      ? [reconciledUrl]
      : action.images;
  const resolvedVideos =
    action.assetKind === 'video' && reconciledUrl
      ? [reconciledUrl]
      : action.videos;
  const resolvedAudio =
    action.assetKind === 'voice' && reconciledUrl
      ? [reconciledUrl]
      : action.audio;
  const hasNoMedia =
    (!resolvedImages || resolvedImages.length === 0) &&
    (!resolvedVideos || resolvedVideos.length === 0) &&
    (!resolvedAudio || resolvedAudio.length === 0) &&
    (!action.tweets || action.tweets.length === 0) &&
    !action.textContent?.trim();
  const isProcessing = reconciledStatus?.toLowerCase() === 'processing';
  const textOutputs = action.tweets?.length
    ? action.tweets
    : action.textContent?.trim()
      ? [action.textContent]
      : [];
  const isThreadPreview =
    action.contentFormat === 'thread' && textOutputs.length > 1;
  const previewTitle = action.title?.trim() || 'Generated content';

  return (
    <div className="mt-2 space-y-2">
      {isThreadPreview ? (
        <AgentTextArtifactPreview
          data={{
            content: textOutputs[0],
            contentFormat: action.contentFormat,
            platform: action.platform ?? 'twitter',
            threadSegments: textOutputs,
            title: previewTitle,
          }}
          onCopy={onCopy}
        />
      ) : (
        textOutputs.map((text, index) => (
          <div key={`${action.id}-text-${index}`} className="space-y-2">
            <AgentTextArtifactPreview
              data={{
                content: text,
                contentFormat: action.contentFormat,
                platform: action.platform,
                preheader: action.preheader,
                subject: action.subject,
                title:
                  textOutputs.length > 1
                    ? `${previewTitle} ${index + 1}`
                    : previewTitle,
              }}
              onCopy={onCopy}
            />
          </div>
        ))
      )}
      {resolvedImages && resolvedImages.length > 0 && (
        <AgentMediaArtifactPreview
          assets={resolvedImages.map((url, index) => ({
            alt: `Generated content ${index + 1}`,
            kind: 'image',
            title: `${previewTitle} ${index + 1}`,
            url,
          }))}
          title={previewTitle}
        />
      )}
      {/* Skeleton placeholder when card has no media yet (processing state) */}
      {hasNoMedia && isProcessing && (
        <div
          aria-label={`${action.assetKind === 'video' ? 'Video' : action.assetKind === 'voice' ? 'Voice' : 'Image'} generation in progress`}
          className="grid grid-cols-3 gap-2"
          role="status"
        >
          <div className="aspect-square w-full animate-pulse rounded-lg border border-border bg-muted" />
        </div>
      )}
      {reconciliationError && (
        <p className="text-xs text-destructive" role="alert">
          {reconciliationError}
        </p>
      )}
      {resolvedVideos && resolvedVideos.length > 0 && (
        <AgentMediaArtifactPreview
          assets={resolvedVideos.map((url, index) => ({
            kind: 'video',
            title: `${previewTitle} ${index + 1}`,
            url,
          }))}
          title={previewTitle}
        />
      )}
      {resolvedAudio && resolvedAudio.length > 0 && (
        <AgentMediaArtifactPreview
          assets={resolvedAudio.map((url, index) => ({
            kind: 'audio',
            title: `${previewTitle} ${index + 1}`,
            url,
          }))}
          title={previewTitle}
        />
      )}
      {action.ctas && action.ctas.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {action.ctas.map((cta) => {
            if (!cta.href) {
              return null;
            }

            const href = normalizeAgentAppHref(cta.href) ?? cta.href;
            const label =
              href.includes('/library/') &&
              cta.label.toLowerCase().includes('gallery')
                ? 'View in Library'
                : cta.label;

            return (
              <a
                key={`${action.id}-content-preview-cta-${cta.label}`}
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded border border-border px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-accent"
              >
                {label}
              </a>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function PaymentCtaCard({
  action,
  onSelect,
}: {
  action: AgentUiAction;
  onSelect?: (pack: { label: string; price: string; credits: number }) => void;
}): ReactElement {
  return (
    <div className="mt-2 rounded-lg border border-primary/30 bg-background p-3">
      <p className="mb-3 text-sm font-medium text-foreground">
        Unlock more with credits
      </p>
      <div className="grid grid-cols-3 gap-2">
        {action.packs?.map((pack) => (
          <Button
            key={pack.label}
            variant={ButtonVariant.UNSTYLED}
            withWrapper={false}
            onClick={() => onSelect?.(pack)}
            className="rounded-lg border border-border p-2 text-center transition-colors hover:border-primary hover:bg-primary/5"
          >
            <p className="text-xs font-medium text-foreground">{pack.label}</p>
            <p className="text-lg font-bold text-primary">{pack.price}</p>
            <p className="text-2xs text-muted-foreground">
              {pack.credits} credits
            </p>
          </Button>
        ))}
      </div>
    </div>
  );
}
