'use client';

import { ButtonVariant } from '@genfeedai/enums';
import type { IByokProviderStatus } from '@genfeedai/interfaces';
import Card from '@ui/card/Card';
import { Button, Button as PrimitiveButton } from '@ui/primitives/button';
import { Input } from '@ui/primitives/input';
import { HiTrash } from 'react-icons/hi2';

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
    <Card key={providerStatus.provider} className="p-5">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-medium">{providerStatus.label}</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            {providerStatus.description}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {isConnected ? (
            <>
              <span className="flex items-center gap-1.5 text-xs text-green-500">
                <span className="size-2 rounded-full bg-green-500" />
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
              >
                <HiTrash className="size-4" />
              </Button>
            </>
          ) : (
            <>
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
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

      {isConnected && !isExpanded && providerStatus.maskedKey && (
        <p className="text-xs text-muted-foreground font-mono mt-2">
          {providerStatus.maskedKey}
        </p>
      )}

      {isExpanded && (
        <div className="mt-4 pt-4 border-t border-border">
          <div className="space-y-3">
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
