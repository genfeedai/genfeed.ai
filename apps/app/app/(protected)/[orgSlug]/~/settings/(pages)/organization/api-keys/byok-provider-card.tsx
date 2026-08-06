'use client';

import { ButtonVariant } from '@genfeedai/enums';
import { getModelBrandIcon } from '@genfeedai/helpers/ui/icons/model-brand-icon';
import type { IByokProviderStatus } from '@genfeedai/interfaces';
import Card from '@ui/card/Card';
import { Button, Button as PrimitiveButton } from '@ui/primitives/button';
import { Input } from '@ui/primitives/input';
import { ChevronDown, ChevronRight, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';

type ByokProviderCardState = {
  isExpanded: boolean;
  isRemoving: boolean;
  isValidating: boolean;
  isSaving: boolean;
};

type Props = {
  providerStatus: IByokProviderStatus;
  cardState: ByokProviderCardState;
  apiKeyValue: string;
  apiSecretValue: string;
  onToggleExpand: () => void;
  onApiKeyChange: (value: string) => void;
  onApiSecretChange: (value: string) => void;
  onValidateAndSave: () => void;
  onRemoveKey: () => void;
};

function providerFaviconDomain(docsUrl: string): string | null {
  try {
    return new URL(docsUrl).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

function ProviderLogo({
  provider,
  docsUrl,
  label,
}: {
  provider: string;
  docsUrl: string;
  label: string;
}) {
  const BrandIcon = getModelBrandIcon(provider);
  const domain = useMemo(() => providerFaviconDomain(docsUrl), [docsUrl]);
  const [faviconFailed, setFaviconFailed] = useState(false);

  if (BrandIcon) {
    return (
      <div
        className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-border bg-muted/40 text-foreground"
        aria-hidden
      >
        <BrandIcon className="size-5" />
      </div>
    );
  }

  if (domain && !faviconFailed) {
    return (
      <div className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-muted/40">
        {/* Plain img: matches onboarding favicon pattern; avoids next/image domain allowlist churn. */}
        <img
          src={`https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=64`}
          alt=""
          width={20}
          height={20}
          className="size-5"
          onError={() => setFaviconFailed(true)}
        />
      </div>
    );
  }

  return (
    <div
      className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-border bg-muted/40 text-xs font-semibold uppercase text-muted-foreground"
      aria-hidden
      title={label}
    >
      {label.slice(0, 1)}
    </div>
  );
}

export default function ByokProviderCard({
  providerStatus,
  cardState,
  apiKeyValue,
  apiSecretValue,
  onToggleExpand,
  onApiKeyChange,
  onApiSecretChange,
  onValidateAndSave,
  onRemoveKey,
}: Props) {
  const { isExpanded, isRemoving, isValidating, isSaving } = cardState;
  const isConnected = providerStatus.hasKey && providerStatus.isEnabled;

  const isSaveDisabled =
    !apiKeyValue.trim() ||
    (providerStatus.requiresSecret && !apiSecretValue.trim()) ||
    isValidating ||
    isSaving;

  const statusLine =
    isConnected && providerStatus.maskedKey
      ? providerStatus.maskedKey
      : isConnected
        ? 'Connected'
        : 'Not configured';

  return (
    <Card
      key={providerStatus.provider}
      bodyClassName="gap-0 p-0"
      data-testid={`provider-${providerStatus.provider}`}
    >
      <div className="flex items-center gap-3 px-4 py-3">
        <Button
          aria-expanded={isExpanded}
          aria-label={`${isExpanded ? 'Collapse' : 'Expand'} ${providerStatus.label} provider`}
          className="shrink-0 text-muted-foreground"
          onClick={onToggleExpand}
          variant={ButtonVariant.GHOST}
          withWrapper={false}
        >
          {isExpanded ? (
            <ChevronDown className="size-4" />
          ) : (
            <ChevronRight className="size-4" />
          )}
        </Button>

        <ProviderLogo
          provider={providerStatus.provider}
          docsUrl={providerStatus.docsUrl}
          label={providerStatus.label}
        />

        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-semibold tracking-[-0.01em]">
            {providerStatus.label}
          </h3>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {statusLine}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {isConnected ? (
            <>
              <span className="hidden items-center gap-1.5 text-xs text-success sm:flex">
                <span className="size-2 rounded-full bg-success" />
                Connected
              </span>
              <Button
                variant={ButtonVariant.SECONDARY}
                onClick={onToggleExpand}
              >
                {isExpanded ? 'Cancel' : 'Replace Key'}
              </Button>
              <Button
                variant={ButtonVariant.SECONDARY}
                onClick={onRemoveKey}
                isDisabled={isRemoving}
                aria-label={`Remove ${providerStatus.label} key`}
              >
                <Trash2 className="size-4" />
              </Button>
            </>
          ) : (
            <Button variant={ButtonVariant.SECONDARY} onClick={onToggleExpand}>
              Add Key
            </Button>
          )}
        </div>
      </div>

      {isExpanded && (
        <div className="border-t border-border px-4 py-4">
          <div className="space-y-3 sm:pl-11">
            <div>
              <span className="mb-1 block text-xs text-muted-foreground">
                API Key
              </span>
              <Input
                type="password"
                value={apiKeyValue}
                onChange={(e) => onApiKeyChange(e.target.value)}
                placeholder="Enter API key..."
                className="w-full"
              />
            </div>
            {providerStatus.requiresSecret && (
              <div>
                <span className="mb-1 block text-xs text-muted-foreground">
                  API Secret
                </span>
                <Input
                  type="password"
                  value={apiSecretValue}
                  onChange={(e) => onApiSecretChange(e.target.value)}
                  placeholder="Enter API secret..."
                  className="w-full"
                />
              </div>
            )}
            <div className="flex items-center justify-between">
              <PrimitiveButton
                asChild
                variant={ButtonVariant.LINK}
                className="text-xs"
              >
                <a
                  href={providerStatus.docsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Get API key
                </a>
              </PrimitiveButton>
              <Button onClick={onValidateAndSave} isDisabled={isSaveDisabled}>
                {isValidating
                  ? 'Validating...'
                  : isSaving
                    ? 'Saving...'
                    : 'Validate & Save'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}
