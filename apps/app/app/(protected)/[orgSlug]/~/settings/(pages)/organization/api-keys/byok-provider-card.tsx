'use client';

import { ButtonVariant } from '@genfeedai/contracts';
import type { IByokProviderStatus } from '@genfeedai/contracts/interfaces';
import { getModelBrandIcon } from '@genfeedai/helpers/ui/icons/model-brand-icon';
import Card from '@ui/card/Card';
import Badge from '@ui/display/badge/Badge';
import { Button, Button as PrimitiveButton } from '@ui/primitives/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@ui/primitives/dialog';
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
  size = 'md',
}: {
  provider: string;
  docsUrl: string;
  label: string;
  size?: 'md' | 'lg';
}) {
  const BrandIcon = getModelBrandIcon(provider);
  const domain = useMemo(() => providerFaviconDomain(docsUrl), [docsUrl]);
  const [faviconFailed, setFaviconFailed] = useState(false);
  const shell = size === 'lg' ? 'size-12 rounded-xl' : 'size-11 rounded-xl';
  const icon = size === 'lg' ? 'size-7' : 'size-6';

  if (BrandIcon) {
    return (
      <div
        className={`flex shrink-0 items-center justify-center border border-border bg-muted/40 text-foreground ${shell}`}
        aria-hidden
      >
        <BrandIcon className={icon} />
      </div>
    );
  }

  if (domain && !faviconFailed) {
    return (
      <div
        className={`flex shrink-0 items-center justify-center overflow-hidden border border-border bg-muted/40 ${shell}`}
      >
        <img
          src={`https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=64`}
          alt=""
          width={size === 'lg' ? 28 : 24}
          height={size === 'lg' ? 28 : 24}
          className={icon}
          onError={() => setFaviconFailed(true)}
        />
      </div>
    );
  }

  return (
    <div
      className={`flex shrink-0 items-center justify-center border border-border bg-muted/40 text-sm font-semibold uppercase text-muted-foreground ${shell}`}
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

  const modalTitle = isConnected
    ? `Replace ${providerStatus.label} key`
    : `Add ${providerStatus.label} key`;

  return (
    <>
      <Card
        key={providerStatus.provider}
        bodyClassName="gap-3 p-4"
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
              <Badge className="mt-2" status="active">
                Connected
              </Badge>
            ) : null}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {isConnected ? (
            <>
              <Button
                variant={ButtonVariant.SECONDARY}
                onClick={onToggleExpand}
              >
                Replace Key
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
      </Card>

      <Dialog
        open={isExpanded}
        onOpenChange={(open) => {
          if (open === isExpanded) {
            return;
          }
          onToggleExpand();
        }}
      >
        <DialogContent className="max-w-md" aria-describedby={undefined}>
          <DialogHeader>
            <div className="flex items-center gap-3">
              <ProviderLogo
                provider={providerStatus.provider}
                docsUrl={providerStatus.docsUrl}
                label={providerStatus.label}
                size="lg"
              />
              <DialogTitle>{modalTitle}</DialogTitle>
            </div>
          </DialogHeader>

          <div className="space-y-3">
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
                autoFocus
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
            <PrimitiveButton
              asChild
              variant={ButtonVariant.LINK}
              className="h-auto px-0 text-xs"
            >
              <a
                href={providerStatus.docsUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                Get API key
              </a>
            </PrimitiveButton>
          </div>

          <DialogFooter className="gap-2 sm:justify-end">
            <Button
              variant={ButtonVariant.SECONDARY}
              onClick={onToggleExpand}
              isDisabled={isValidating || isSaving}
            >
              Cancel
            </Button>
            <Button onClick={onValidateAndSave} isDisabled={isSaveDisabled}>
              {isValidating
                ? 'Validating...'
                : isSaving
                  ? 'Saving...'
                  : 'Validate & Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
