'use client';

import { ButtonVariant } from '@genfeedai/enums';
import type { IByokProviderStatus } from '@genfeedai/interfaces';
import Card from '@ui/card/Card';
import { Button, Button as PrimitiveButton } from '@ui/primitives/button';
import { Input } from '@ui/primitives/input';
import { HiChevronDown, HiChevronRight, HiTrash } from 'react-icons/hi2';

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

  return (
    <Card
      key={providerStatus.provider}
      bodyClassName="gap-0 p-0"
      data-testid={`provider-${providerStatus.provider}`}
    >
      <div className="flex min-h-12 items-center gap-3 px-3 py-2">
        <Button
          aria-expanded={isExpanded}
          aria-label={`${isExpanded ? 'Collapse' : 'Expand'} ${providerStatus.label} provider`}
          className="shrink-0 text-muted-foreground"
          onClick={onToggleExpand}
          variant={ButtonVariant.GHOST}
        >
          {isExpanded ? (
            <HiChevronDown className="size-4" />
          ) : (
            <HiChevronRight className="size-4" />
          )}
        </Button>
        <div className="min-w-0 flex-1 sm:flex sm:items-center sm:gap-3">
          <h3 className="truncate text-sm font-medium">
            {providerStatus.label}
          </h3>
          <p className="truncate text-xs text-muted-foreground">
            {isConnected && providerStatus.maskedKey
              ? providerStatus.maskedKey
              : providerStatus.description}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {isConnected ? (
            <>
              <span className="flex items-center gap-1.5 text-xs text-success">
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
                <HiTrash className="size-4" />
              </Button>
            </>
          ) : (
            <>
              <span className="hidden items-center gap-1.5 text-xs text-muted-foreground sm:flex">
                <span className="size-2 rounded-full bg-muted-foreground/30" />
                Not configured
              </span>
              <Button
                variant={ButtonVariant.SECONDARY}
                onClick={onToggleExpand}
              >
                Add Key
              </Button>
            </>
          )}
        </div>
      </div>

      {isExpanded && (
        <div className="border-t border-border px-3 py-3">
          <div className="space-y-3 sm:pl-11">
            <div>
              <span className="text-xs text-muted-foreground mb-1 block">
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
                <span className="text-xs text-muted-foreground mb-1 block">
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
