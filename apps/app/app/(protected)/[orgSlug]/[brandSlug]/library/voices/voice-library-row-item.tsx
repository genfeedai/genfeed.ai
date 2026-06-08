'use client';

import type { DefaultVoiceRef } from '@helpers/voice/default-voice-ref.helper';
import { matchesDefaultVoice } from '@helpers/voice/default-voice-ref.helper';
import type { Voice } from '@models/ingredients/voice.model';
import { logger } from '@services/core/logger.service';
import VoiceCatalogRow from './voice-catalog-row';

type OrgDefaultContext = {
  defaultVoiceId?: string | null;
  defaultVoiceRef?: DefaultVoiceRef | null;
};

type BrandDefaultContext = {
  defaultVoiceId?: string | null;
  defaultVoiceRef?: DefaultVoiceRef | null;
};

export type VoiceLibraryRowItemProps = {
  brandDefaultContext: BrandDefaultContext;
  hasBrandContext: boolean;
  isSavingBrandDefault: boolean;
  isSavingOrgDefault: boolean;
  isVoiceRemovable: (voice: Voice) => boolean;
  onDeleteVoice: (voice: Voice) => Promise<void>;
  onSaveBrandDefault: (voice: Voice) => Promise<void>;
  onSaveOrganizationDefault: (voice: Voice) => Promise<void>;
  orgDefaultContext: OrgDefaultContext;
  selectedBrandLabel?: string;
  voice: Voice;
};

export default function VoiceLibraryRowItem({
  brandDefaultContext,
  hasBrandContext,
  isSavingBrandDefault,
  isSavingOrgDefault,
  isVoiceRemovable,
  onDeleteVoice,
  onSaveBrandDefault,
  onSaveOrganizationDefault,
  orgDefaultContext,
  selectedBrandLabel,
  voice,
}: VoiceLibraryRowItemProps) {
  const isOrgDefault = matchesDefaultVoice(orgDefaultContext, voice);
  const isBrandDefault = matchesDefaultVoice(brandDefaultContext, voice);

  return (
    <VoiceCatalogRow
      isBrandDefault={isBrandDefault}
      isOrgDefault={isOrgDefault}
      isSavingBrandDefault={isSavingBrandDefault}
      isSavingOrgDefault={isSavingOrgDefault}
      onDelete={
        isVoiceRemovable(voice)
          ? () => {
              onDeleteVoice(voice).catch((error) => {
                logger.error('Failed to delete voice', error);
              });
            }
          : null
      }
      onSaveBrandDefault={
        hasBrandContext
          ? () => {
              onSaveBrandDefault(voice).catch((error) => {
                logger.error('Failed to save brand default voice', error);
              });
            }
          : null
      }
      onSaveOrganizationDefault={() => {
        onSaveOrganizationDefault(voice).catch((error) => {
          logger.error('Failed to save organization default voice', error);
        });
      }}
      selectedBrandLabel={selectedBrandLabel}
      voice={voice}
    />
  );
}
