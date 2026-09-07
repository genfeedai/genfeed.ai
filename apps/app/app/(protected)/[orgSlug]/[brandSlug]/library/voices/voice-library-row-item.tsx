import { matchesDefaultVoice } from '@helpers/voice/default-voice-ref.helper';
import type { VoiceLibraryRowItemProps } from '@props/library/voice-library-row-item.props';
import { logger } from '@services/core/logger.service';
import VoiceCatalogRow from './voice-catalog-row';

export default function VoiceLibraryRowItem({
  brandDefaultContext,
  isVoiceRemovable,
  onDeleteVoice,
  onSaveBrandDefault,
  onSaveOrganizationDefault,
  orgDefaultContext,
  savingDefault,
  selectedBrandLabel,
  voice,
}: VoiceLibraryRowItemProps) {
  const isOrgDefault = matchesDefaultVoice(orgDefaultContext, voice);
  const isBrandDefault = matchesDefaultVoice(brandDefaultContext, voice);

  return (
    <VoiceCatalogRow
      isBrandDefault={isBrandDefault}
      isOrgDefault={isOrgDefault}
      isSavingBrandDefault={savingDefault === 'brand'}
      isSavingOrgDefault={savingDefault === 'org'}
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
        onSaveBrandDefault
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
