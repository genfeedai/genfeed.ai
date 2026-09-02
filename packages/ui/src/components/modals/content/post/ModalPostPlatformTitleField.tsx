'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import type { IPostPlatformConfig } from '@genfeedai/contracts/interfaces';
import { Button } from '@ui/primitives/button';
import { Input } from '@ui/primitives/input';
import { Sparkles } from 'lucide-react';

type Props = {
  config: IPostPlatformConfig;
  isEnabled: boolean;
  isLoading: boolean;
  globalLabel: string | undefined;
  generatingTitleFor: string | null;
  updatePlatformConfig: (
    credentialId: string,
    updates: Partial<IPostPlatformConfig>,
  ) => void;
  handleGenerateContent: (
    credentialId: string,
    platform: string,
    field: 'title' | 'description',
  ) => void;
};

export default function ModalPostPlatformTitleField({
  config,
  isEnabled,
  isLoading,
  globalLabel,
  generatingTitleFor,
  updatePlatformConfig,
  handleGenerateContent,
}: Props) {
  const isGenerating = generatingTitleFor === config.credentialId;

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <label
          htmlFor={`platform-title-${config.credentialId || config.platform}`}
          className="text-sm font-medium"
        >
          Title
        </label>
        <Button
          variant={ButtonVariant.GHOST}
          size={ButtonSize.XS}
          className="gap-2"
          onClick={() =>
            handleGenerateContent(config.credentialId, config.platform, 'title')
          }
          isDisabled={!isEnabled || isLoading || isGenerating}
          isLoading={isGenerating}
          icon={<Sparkles className="size-3" />}
          label={isGenerating ? 'Generating…' : 'Generate'}
        />
      </div>
      <Input
        id={`platform-title-${config.credentialId || config.platform}`}
        type="text"
        value={config.label}
        onChange={(event) => {
          if (!isEnabled) {
            return;
          }

          updatePlatformConfig(config.credentialId, {
            label: event.target.value,
          });
        }}
        placeholder={globalLabel || 'Enter title'}
        disabled={!isEnabled || isLoading}
      />
    </div>
  );
}
