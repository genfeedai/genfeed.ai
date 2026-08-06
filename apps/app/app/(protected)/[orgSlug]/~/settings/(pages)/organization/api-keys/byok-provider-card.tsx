'use client';

import { ButtonVariant } from '@genfeedai/enums';
import { getModelBrandIcon } from '@genfeedai/helpers/ui/icons/model-brand-icon';
import type { IByokProviderStatus } from '@genfeedai/interfaces';
import Card from '@ui/card/Card';
import { Button, Button as PrimitiveButton } from '@ui/primitives/button';
import { Input } from '@ui/primitives/input';
import { Trash2 } from 'lucide-react';
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
        className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-border bg-muted/40 text-foreground"
        aria-hidden
      >
        <BrandIcon className="size-6" />
      </div>
    );
  }

  if (domain && !faviconFailed) {
    return (
      <div className="flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border bg-muted/40">
        <img
          src={`https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=64`}
          alt=""
          width={24}
          height={24}
          className="size-6"
          onError={() => setFaviconFailed(true)}
        />
      </div>
    );
  }

  return (
    <div
      className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-border bg-muted/40 text-sm font-semibold uppercase text-muted-foreground"
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
      bodyClassName="gap-3 p-4"
      className={isExpanded ? 'sm:col-span-2 lg:col-span-3' : undefined}
      data-testid={`provider-${providerStatus.provider}`}
    >
      <div className="flex items-start gap-3">
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
          {isConnected ? (
            <span className="mt-2 inline-flex items-center gap-1.5 text-xs text-success">
              <span className="size-1.5 rounded-full bg-success" />
              Connected
            </span>
          ) : null}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {isConnected ? (
          <>
            <Button variant={ButtonVariant.SECONDARY} onClick={onToggleExpand}>
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
            {isExpanded ? 'Cancel' : 'Add Key'}
          </Button>
        )}
      </div>

      {isExpanded ? (
        <div className="space-y-3 border-t border-border pt-3">
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
          {providerStatus.requiresSecret ? (
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
          ) : null}
          <div className="flex flex-wrap items-center justify-between gap-2">
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
      ) : null}
    </Card>
  );
}
