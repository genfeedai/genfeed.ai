'use client';

import { useBrand } from '@contexts/user/brand-context/brand-context';
import { ButtonVariant, type VoiceProvider } from '@genfeedai/enums';
import {
  buildDefaultVoiceRefFromVoice,
  type DefaultVoiceRef,
  matchesDefaultVoice,
} from '@helpers/voice/default-voice-ref.helper';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useAvatarImages } from '@hooks/data/ingredients/use-avatar-images/use-avatar-images';
import { useOrganization } from '@hooks/data/organization/use-organization/use-organization';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import type { Voice } from '@models/ingredients/voice.model';
import { useVoiceCatalog } from '@pages/library/voices/hooks/use-voice-catalog';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import { OrganizationsService } from '@services/organization/organizations.service';
import Button from '@ui/buttons/base/Button';
import Card from '@ui/card/Card';
import SelectedAvatarPreview from '@ui/display/selected-avatar-preview/SelectedAvatarPreview';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ui/primitives/select';
import { getIngredientDisplayLabel } from '@utils/media/ingredient-type.util';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';

function getVoiceName(voice: Voice): string {
  return voice.metadataLabel || voice.externalVoiceId || voice.id;
}

export default function OrganizationIdentityDefaultsCard() {
  const router = useRouter();
  const { href } = useOrgUrl();
  const notifications = NotificationsService.getInstance();
  const { organizationId } = useBrand();
  const { refresh, settings } = useOrganization();
  const { avatars, isLoading: isLoadingAvatars } =
    useAvatarImages(organizationId);
  const orgDefaultVoiceRef = settings?.defaultVoiceRef as
    | DefaultVoiceRef
    | null
    | undefined;
  const { isLoading: isLoadingCatalog, voices: catalog } = useVoiceCatalog({
    isActive: true,
    pagination: false,
  });
  const getOrganizationsService = useAuthedService((token: string) =>
    OrganizationsService.getInstance(token),
  );

  const [selectedVoiceId, setSelectedVoiceId] = useState('');
  const [selectedAvatarId, setSelectedAvatarId] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setSelectedAvatarId(settings?.defaultAvatarIngredientId ?? '');
  }, [settings?.defaultAvatarIngredientId]);

  useEffect(() => {
    const selectedVoice =
      catalog.find((voice) =>
        matchesDefaultVoice(
          {
            defaultVoiceId: settings?.defaultVoiceId,
            defaultVoiceRef: orgDefaultVoiceRef,
          },
          voice,
        ),
      ) ?? null;

    setSelectedVoiceId(selectedVoice?.id ?? settings?.defaultVoiceId ?? '');
  }, [catalog, settings?.defaultVoiceId, orgDefaultVoiceRef]);

  const catalogOptions = useMemo(
    () =>
      catalog.map((voice) => ({
        label: `${getVoiceName(voice)} (${voice.provider})`,
        value: voice.id,
      })),
    [catalog],
  );

  const currentVoiceSummary = useMemo(() => {
    if (settings?.defaultVoiceId || settings?.defaultVoiceRef) {
      const selectedVoice = catalog.find((voice) =>
        matchesDefaultVoice(
          {
            defaultVoiceId: settings?.defaultVoiceId,
            defaultVoiceRef: orgDefaultVoiceRef,
          },
          voice,
        ),
      );
      return selectedVoice
        ? `${getVoiceName(selectedVoice)} (${selectedVoice.provider})`
        : 'Saved voice default';
    }

    return 'No organization default voice';
  }, [
    catalog,
    settings?.defaultVoiceId,
    orgDefaultVoiceRef,
    settings?.defaultVoiceRef,
  ]);

  const selectedAvatar = useMemo(
    () => avatars.find((avatar) => avatar.id === selectedAvatarId) ?? null,
    [avatars, selectedAvatarId],
  );

  const currentAvatarSummary = useMemo(() => {
    const currentAvatar =
      avatars.find(
        (avatar) => avatar.id === settings?.defaultAvatarIngredientId,
      ) ?? null;

    return getIngredientDisplayLabel(currentAvatar) || 'No default';
  }, [avatars, settings?.defaultAvatarIngredientId]);

  const handleSave = useCallback(async () => {
    if (!organizationId) {
      notifications.error('Organization context is unavailable');
      return;
    }

    setIsSaving(true);

    try {
      const selectedVoice =
        selectedVoiceId.length > 0
          ? (catalog.find((voice) => voice.id === selectedVoiceId) ?? null)
          : null;

      const service = await getOrganizationsService();
      await service.patchSettings(organizationId, {
        defaultAvatarIngredientId: selectedAvatarId || null,
        defaultVoiceId: selectedVoice?.id ?? null,
        defaultVoiceProvider:
          (selectedVoice?.provider as VoiceProvider | undefined) ?? null,
        defaultVoiceRef: buildDefaultVoiceRefFromVoice(selectedVoice),
      });
      await refresh();
      notifications.success('Organization identity defaults saved');
    } catch (error) {
      logger.error('Failed to save organization identity defaults', error);
      notifications.error('Failed to save organization identity defaults');
    } finally {
      setIsSaving(false);
    }
  }, [
    catalog,
    getOrganizationsService,
    notifications,
    organizationId,
    refresh,
    selectedAvatarId,
    selectedVoiceId,
  ]);

  return (
    <Card className="p-6" data-testid="org-identity-defaults-card">
      <h2 className="mb-4 text-lg font-semibold">Organization Identity</h2>
      <div className="space-y-4">
        <div>
          <label
            htmlFor="org-default-avatar"
            className="mb-1 block text-sm font-medium"
          >
            Default Avatar
          </label>
          <Select
            disabled={isLoadingAvatars}
            onValueChange={(value) =>
              setSelectedAvatarId(value === 'none' ? '' : value)
            }
            value={selectedAvatarId || 'none'}
          >
            <SelectTrigger
              id="org-default-avatar"
              className="w-full"
              data-testid="org-default-avatar-trigger"
            >
              <SelectValue
                placeholder={
                  isLoadingAvatars
                    ? 'Loading avatars...'
                    : 'Select an avatar ingredient'
                }
              />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">No organization default</SelectItem>
              {avatars.map((avatar) => (
                <SelectItem key={avatar.id} value={avatar.id}>
                  {getIngredientDisplayLabel(avatar)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {selectedAvatar ? (
            <SelectedAvatarPreview
              description="Used by agents and workflows when no brand override exists."
              imageAlt={
                getIngredientDisplayLabel(selectedAvatar) || 'Selected avatar'
              }
              imageUrl={
                selectedAvatar.ingredientUrl || '/placeholders/portrait.jpg'
              }
              title={
                getIngredientDisplayLabel(selectedAvatar) || 'Selected avatar'
              }
              wrapperClassName="mt-3"
            />
          ) : null}
          {!isLoadingAvatars && avatars.length === 0 ? (
            <p className="mt-2 text-xs text-muted-foreground">
              No avatar ingredients are available yet. Mark an image as an
              avatar from its ingredient page first.
            </p>
          ) : null}
        </div>

        <div>
          <label
            htmlFor="org-default-voice-ref"
            className="mb-1 block text-sm font-medium"
          >
            Default Voice
          </label>
          <Select
            disabled={isLoadingCatalog}
            onValueChange={(value) =>
              setSelectedVoiceId(value === 'none' ? '' : value)
            }
            value={selectedVoiceId || 'none'}
          >
            <SelectTrigger
              id="org-default-voice-ref"
              className="w-full"
              data-testid="org-default-voice-trigger"
            >
              <SelectValue
                placeholder={
                  isLoadingCatalog
                    ? 'Loading voices...'
                    : 'Select a provider voice'
                }
              />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">No organization default</SelectItem>
              {catalogOptions.map((voice) => (
                <SelectItem key={voice.value} value={voice.value}>
                  {voice.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <p className="text-xs text-muted-foreground">
          Current avatar: {currentAvatarSummary}. Current voice:{' '}
          {currentVoiceSummary}. These values are used only when a brand does
          not define its own identity defaults.
        </p>

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            data-testid="save-org-identity"
            onClick={() => {
              handleSave().catch((error) => {
                logger.error(
                  'Failed to save organization identity defaults',
                  error,
                );
              });
            }}
            isDisabled={isSaving}
            withWrapper={false}
          >
            {isSaving ? 'Saving...' : 'Save Organization Identity'}
          </Button>
          <Button
            data-testid="browse-avatar-library"
            onClick={() => router.push(href('/library/avatars'))}
            type="button"
            variant={ButtonVariant.SECONDARY}
            withWrapper={false}
          >
            Browse Avatar Library
          </Button>
          <Button
            onClick={() => router.push(href('/library/voices'))}
            type="button"
            variant={ButtonVariant.SECONDARY}
            withWrapper={false}
          >
            Browse Voice Library
          </Button>
        </div>
      </div>
    </Card>
  );
}
