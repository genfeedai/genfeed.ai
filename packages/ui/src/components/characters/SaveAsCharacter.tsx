'use client';

import { useBrand } from '@genfeedai/contexts/user/brand-context/brand-context';
import {
  ButtonSize,
  ButtonVariant,
  isPersonaHandle,
  normalizePersonaHandle,
} from '@genfeedai/contracts';
import type { IQuickAction } from '@genfeedai/contracts/interfaces/ui/quick-actions.interface';
import { CHARACTERS_CHANGED_EVENT } from '@genfeedai/helpers/content/character-mention.util';
import { useAuthedService } from '@genfeedai/hooks/auth/use-authed-service/use-authed-service';
import type { SaveAsCharacterProps } from '@genfeedai/props/characters/save-as-character.props';
import { PersonasService } from '@genfeedai/services/content/personas.service';
import { NotificationsService } from '@genfeedai/services/core/notifications.service';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@ui/primitives/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@ui/primitives/dialog';
import { Input } from '@ui/primitives/input';
import { UserRound } from 'lucide-react';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { useRef, useState } from 'react';

export default function SaveAsCharacter({
  assetId,
  active = true,
  imageUrl,
  children,
}: SaveAsCharacterProps) {
  const translate = useTranslations('common.settings.characters');
  const { organizationId, brandId } = useBrand();
  const getService = useAuthedService((token: string) =>
    PersonasService.getInstance(token),
  );
  const queryClient = useQueryClient();
  const queryKey = ['brand-characters', organizationId, brandId];
  const {
    data: characters,
    isLoading,
    error: loadError,
    refetch,
  } = useQuery({
    queryKey,
    enabled: Boolean(brandId && assetId),
    queryFn: async () => (await getService()).listCharacters(),
    staleTime: 30_000,
  });
  const savedReference = characters?.find(
    (character) => character.avatarIngredientId === assetId,
  );
  const inspection = useQuery({
    queryKey: ['character-image-inspection', organizationId, brandId, assetId],
    enabled: Boolean(
      active && brandId && assetId && !isLoading && !savedReference,
    ),
    queryFn: async () => (await getService()).inspectImage(assetId),
    staleTime: 600_000,
    retry: false,
  });
  const existing =
    savedReference ??
    (inspection.data?.characterId
      ? {
          id: inspection.data.characterId,
          handle: inspection.data.handle,
          label: inspection.data.label,
        }
      : undefined);
  const isChecking = !existing && active && (isLoading || inspection.isLoading);
  const notCharacter =
    !existing &&
    inspection.data?.hasFace === false &&
    inspection.data?.isCharacter === false;
  const inspectionUnavailable =
    !existing &&
    !isChecking &&
    (inspection.error || (inspection.data && inspection.data.hasFace === null));
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [handle, setHandle] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const inFlight = useRef(false);
  const scope = `${organizationId}:${brandId}:${assetId}`;
  const currentScope = useRef(scope);
  currentScope.current = scope;
  const [openedScope, setOpenedScope] = useState(scope);

  async function save() {
    const normalizedHandle = normalizePersonaHandle(
      handle.trim().replace(/^@/, ''),
    );
    if (!name.trim() || !normalizedHandle) {
      setError(translate('errors.missingName'));
      return;
    }
    if (!isPersonaHandle(normalizedHandle)) {
      setError(translate('errors.invalidHandle'));
      return;
    }
    if (inFlight.current || !brandId || existing || isChecking || notCharacter)
      return;
    inFlight.current = true;
    setSaving(true);
    setError('');
    try {
      const service = await getService();
      if (currentScope.current !== scope) return;
      await service.createFromSheet({
        assetId,
        handle: normalizedHandle,
        label: name.trim(),
      });
      await queryClient.invalidateQueries({ queryKey });
      await queryClient.invalidateQueries({
        queryKey: [
          'character-image-inspection',
          organizationId,
          brandId,
          assetId,
        ],
      });
      window.dispatchEvent(new Event(CHARACTERS_CHANGED_EVENT));
      if (currentScope.current !== scope) return;
      setOpen(false);
      NotificationsService.getInstance().success(
        translate('saveExisting.success', { handle: normalizedHandle }),
      );
    } catch {
      if (currentScope.current === scope)
        setError(translate('saveExisting.error'));
    } finally {
      inFlight.current = false;
      setSaving(false);
    }
  }

  const action: IQuickAction = {
    id: 'save-as-character',
    label: existing
      ? existing.handle
        ? translate('saveExisting.saved', { handle: existing.handle })
        : existing.label || translate('saveExisting.savedWithoutHandle')
      : translate(isChecking ? 'saveExisting.checking' : 'saveExisting.action'),
    icon: <UserRound className="size-4" />,
    isDisabled: !brandId || isLoading || isChecking || Boolean(existing),
    onClick: () => {
      setName('');
      setHandle('');
      setError('');
      setOpenedScope(scope);
      setOpen(true);
    },
    showInMenu: true,
  };
  return (
    <>
      {children ? (
        children(notCharacter ? null : action)
      ) : notCharacter ? null : (
        <Button
          variant={ButtonVariant.GHOST}
          size={ButtonSize.SM}
          withWrapper={false}
          className="w-full text-xs"
          isDisabled={action.isDisabled}
          onClick={action.onClick}
        >
          {action.icon}
          {action.label}
        </Button>
      )}
      <Dialog
        open={open && openedScope === scope}
        onOpenChange={(value) => {
          if (!inFlight.current) setOpen(value);
        }}
      >
        <DialogContent
          className="max-w-md"
          onClick={(event) => event.stopPropagation()}
        >
          <DialogHeader>
            <DialogTitle>{translate('saveExisting.action')}</DialogTitle>
            <DialogDescription>
              {translate('saveExisting.description')}
            </DialogDescription>
          </DialogHeader>
          <Image
            src={imageUrl}
            width={320}
            height={240}
            alt={translate('saveExisting.preview')}
            className="max-h-60 w-full object-contain"
          />
          <Input
            aria-label={translate('fields.name')}
            placeholder={translate('fields.namePlaceholder')}
            value={name}
            disabled={saving}
            onChange={(event) => setName(event.target.value)}
          />
          <Input
            aria-label={translate('fields.handle')}
            placeholder={translate('fields.handlePlaceholder')}
            value={handle}
            disabled={saving}
            onChange={(event) => setHandle(event.target.value)}
          />
          {inspectionUnavailable ? (
            <p className="text-sm text-muted-foreground">
              {translate('saveExisting.inspectionUnavailable')}
            </p>
          ) : null}
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
          <DialogFooter>
            {loadError ? (
              <Button
                variant={ButtonVariant.SECONDARY}
                onClick={() => void refetch()}
              >
                {translate('saveExisting.retry')}
              </Button>
            ) : null}
            <Button
              isDisabled={
                saving ||
                Boolean(loadError) ||
                isLoading ||
                isChecking ||
                notCharacter ||
                Boolean(existing)
              }
              isLoading={saving}
              onClick={() => void save()}
            >
              {translate('actions.save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
