import { AgentMediaArtifactPreview } from '@genfeedai/agent/components/AgentMediaArtifactPreview';
import { AgentTextArtifactPreview } from '@genfeedai/agent/components/AgentTextArtifactPreview';
import type { AgentUiAction } from '@genfeedai/agent/models/agent-chat.model';
import { ButtonSize, ButtonVariant } from '@genfeedai/enums';
import { cn } from '@helpers/formatting/cn/cn.util';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import { Button } from '@ui/primitives/button';
import { buttonVariants } from '@ui/primitives/button.variants';
import { type ReactElement, useCallback, useState } from 'react';

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
  const platform = action.platform?.trim();
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);

  const handleConnect = useCallback(async () => {
    if (!platform || !onConnect || isConnecting) {
      return;
    }

    setConnectError(null);
    setIsConnecting(true);
    try {
      await onConnect(platform);
    } catch {
      setConnectError('Could not start the connection. Please try again.');
    } finally {
      setIsConnecting(false);
    }
  }, [isConnecting, onConnect, platform]);

  if (!platform) {
    return <GenericOAuthConnectCard action={action} />;
  }

  const label = formatPlatformLabel(platform);

  return (
    <div className="mt-2 rounded-lg border border-border bg-background p-3">
      <p className="mb-2 text-sm font-medium text-foreground">
        Connect {label}
      </p>
      <Button
        variant={ButtonVariant.DEFAULT}
        size={ButtonSize.SM}
        onClick={handleConnect}
        isDisabled={!onConnect || isConnecting}
        isLoading={isConnecting}
      >
        Connect {label}
      </Button>
      {connectError ? (
        <p className="mt-2 text-xs text-red-600 dark:text-red-400" role="alert">
          {connectError}
        </p>
      ) : null}
    </div>
  );
}

export function ContentPreviewCard({
  action,
  onCopy,
}: {
  action: AgentUiAction;
  onCopy?: (content: string) => void | Promise<void>;
}): ReactElement {
  const hasNoMedia =
    (!action.images || action.images.length === 0) &&
    (!action.videos || action.videos.length === 0) &&
    (!action.audio || action.audio.length === 0) &&
    (!action.tweets || action.tweets.length === 0) &&
    !action.textContent?.trim();
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
      {action.images && action.images.length > 0 && (
        <AgentMediaArtifactPreview
          assets={action.images.map((url, index) => ({
            alt: `Generated content ${index + 1}`,
            kind: 'image',
            title: `${previewTitle} ${index + 1}`,
            url,
          }))}
          title={previewTitle}
        />
      )}
      {/* Skeleton placeholder when card has no media yet (processing state) */}
      {hasNoMedia && action.title?.toLowerCase().includes('processing') && (
        <div className="grid grid-cols-3 gap-2">
          <div className="aspect-square w-full animate-pulse rounded-lg border border-border bg-muted" />
        </div>
      )}
      {action.videos && action.videos.length > 0 && (
        <AgentMediaArtifactPreview
          assets={action.videos.map((url, index) => ({
            kind: 'video',
            title: `${previewTitle} ${index + 1}`,
            url,
          }))}
          title={previewTitle}
        />
      )}
      {action.audio && action.audio.length > 0 && (
        <AgentMediaArtifactPreview
          assets={action.audio.map((url, index) => ({
            kind: 'audio',
            title: `${previewTitle} ${index + 1}`,
            url,
          }))}
          title={previewTitle}
        />
      )}
      {action.ctas && action.ctas.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {action.ctas.map((cta) =>
            cta.href ? (
              <a
                key={`${action.id}-content-preview-cta-${cta.label}`}
                href={cta.href}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded border border-border px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-accent"
              >
                {cta.label}
              </a>
            ) : null,
          )}
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
            <p className="text-[10px] text-muted-foreground">
              {pack.credits} credits
            </p>
          </Button>
        ))}
      </div>
    </div>
  );
}
