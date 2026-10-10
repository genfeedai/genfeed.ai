'use client';

import { useBrand } from '@contexts/user/brand-context/brand-context';
import { ButtonVariant } from '@genfeedai/contracts';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import type {
  BrandMoveDialogProps,
  BrandMoveEntry,
  BrandMoveEntryStatus,
} from '@props/settings/brand-move.props';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import { BrandsService } from '@services/social/brands.service';
import { Badge } from '@ui/primitives/badge';
import { Button } from '@ui/primitives/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@ui/primitives/dialog';
import { SelectField } from '@ui/primitives/select';
import { useTranslations } from 'next-intl';
import { type ChangeEvent, useCallback, useRef, useState } from 'react';
import {
  countByStatus,
  describePreview,
  markOnlyBrandBlocked,
  summarizeBatch,
} from './brand-move.util';
import { useBrandMoveDestinations } from './use-brand-move-destinations';

type BrandMovePhase = 'choose' | 'checking' | 'review' | 'moving' | 'done';

const STATUS_BADGE_VARIANTS: Record<
  BrandMoveEntryStatus,
  'destructive' | 'secondary' | 'success' | 'warning'
> = {
  blocked: 'warning',
  checking: 'secondary',
  failed: 'destructive',
  moved: 'success',
  moving: 'secondary',
  ready: 'success',
};

function errorReason(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

export default function BrandMoveDialog({
  brands,
  onClose,
  onMoved,
  sourceBrandCount,
  sourceOrganizationId,
}: BrandMoveDialogProps) {
  const { refreshBrands } = useBrand();
  const notificationsService = NotificationsService.getInstance();
  const translate = useTranslations('common.settings.brandMove');

  const getBrandsService = useAuthedService((token: string) =>
    BrandsService.getInstance(token),
  );

  const [destinationId, setDestinationId] = useState('');
  const [phase, setPhase] = useState<BrandMovePhase>('choose');
  const [entries, setEntries] = useState<BrandMoveEntry[]>(() =>
    brands.map((brand) => ({ brand, status: 'checking' })),
  );
  // Bumped on every destination change so a slow preview run can't overwrite
  // the results of a newer one.
  const runIdRef = useRef(0);

  const { destinations: availableDestinations } =
    useBrandMoveDestinations(sourceOrganizationId);

  const updateEntry = useCallback(
    (brandId: string, patch: Partial<BrandMoveEntry>) => {
      setEntries((current) =>
        current.map((entry) =>
          entry.brand.id === brandId ? { ...entry, ...patch } : entry,
        ),
      );
    },
    [],
  );

  const checkDestination = useCallback(
    async (nextDestinationId: string) => {
      const runId = ++runIdRef.current;
      setDestinationId(nextDestinationId);

      if (!nextDestinationId) {
        setPhase('choose');
        return;
      }

      setPhase('checking');
      setEntries(brands.map((brand) => ({ brand, status: 'checking' })));

      const service = await getBrandsService();
      const checked: BrandMoveEntry[] = [];

      for (const brand of brands) {
        let entry: BrandMoveEntry;
        try {
          const preview = await service.getRelocationPreview(
            brand.id,
            nextDestinationId,
          );
          entry = { brand, preview, status: 'ready' };
        } catch (error) {
          logger.error('Failed to preview brand move', error);
          entry = {
            brand,
            reason: errorReason(error, "Couldn't check this brand."),
            status: 'blocked',
          };
        }

        if (runId !== runIdRef.current) {
          return;
        }
        checked.push(entry);
        updateEntry(brand.id, entry);
      }

      setEntries(markOnlyBrandBlocked(checked, sourceBrandCount));
      setPhase('review');
    },
    [brands, getBrandsService, sourceBrandCount, updateEntry],
  );

  const handleDestinationChange = useCallback(
    (event: ChangeEvent<HTMLSelectElement>) => {
      void checkDestination(event.target.value);
    },
    [checkDestination],
  );

  const handleMove = useCallback(async () => {
    setPhase('moving');
    const service = await getBrandsService();
    const results: BrandMoveEntry[] = [];

    for (const entry of entries) {
      if (entry.status !== 'ready') {
        results.push(entry);
        continue;
      }

      updateEntry(entry.brand.id, { status: 'moving' });
      let result: BrandMoveEntry;
      try {
        const { summary } = await service.relocateBrand(entry.brand.id, {
          organizationId: destinationId,
        });
        result = {
          ...entry,
          membersSevered: summary.membersSevered,
          status: 'moved',
        };
      } catch (error) {
        logger.error('Failed to move brand', error);
        result = {
          ...entry,
          reason: errorReason(error, "Couldn't move this brand."),
          status: 'failed',
        };
      }
      results.push(result);
      updateEntry(entry.brand.id, result);
    }

    const movedCount = countByStatus(results, 'moved');
    if (movedCount > 0) {
      await onMoved();
      await refreshBrands();
    }

    const message = summarizeBatch(results);
    if (countByStatus(results, 'failed') > 0) {
      notificationsService.error(message);
    } else {
      notificationsService.success(message);
    }
    setPhase('done');
  }, [
    destinationId,
    entries,
    getBrandsService,
    notificationsService,
    onMoved,
    refreshBrands,
    updateEntry,
  ]);

  const readyCount = countByStatus(entries, 'ready');
  const isBusy = phase === 'checking' || phase === 'moving';

  return (
    <Dialog
      open
      onOpenChange={(isOpen) => {
        if (!isOpen && phase !== 'moving') {
          onClose();
        }
      }}
    >
      <DialogContent aria-describedby={undefined} className="max-w-xl">
        <DialogHeader>
          <DialogTitle>
            {brands.length === 1
              ? translate('titleOne')
              : translate('titleMany', { count: brands.length })}
          </DialogTitle>
          <DialogDescription>{translate('description')}</DialogDescription>
        </DialogHeader>

        <SelectField
          label={translate('destinationLabel')}
          name="destinationOrganizationId"
          placeholder={translate('destinationPlaceholder')}
          value={destinationId}
          onChange={handleDestinationChange}
          isDisabled={isBusy || phase === 'done'}
        >
          {availableDestinations.map((destination) => (
            <option key={destination.id} value={destination.id}>
              {destination.label}
            </option>
          ))}
        </SelectField>

        {phase !== 'choose' ? (
          <ul className="flex flex-col gap-3" data-testid="brand-move-list">
            {entries.map((entry) => {
              const detail =
                entry.status === 'ready' && entry.preview
                  ? describePreview(entry.preview)
                  : entry.status === 'moved' && entry.membersSevered
                    ? entry.membersSevered === 1
                      ? translate('membersLostOne')
                      : translate('membersLostMany', {
                          count: entry.membersSevered,
                        })
                    : entry.reason;
              return (
                <li
                  className="flex flex-col gap-1"
                  data-testid={`brand-move-${entry.brand.id}`}
                  key={entry.brand.id}
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-medium">{entry.brand.label}</span>
                    <Badge variant={STATUS_BADGE_VARIANTS[entry.status]}>
                      {translate(`status.${entry.status}`)}
                    </Badge>
                  </div>
                  {detail ? (
                    <p className="text-sm text-muted-foreground">{detail}</p>
                  ) : null}
                </li>
              );
            })}
          </ul>
        ) : null}

        <DialogFooter>
          <Button
            isDisabled={phase === 'moving'}
            label={translate(phase === 'done' ? 'close' : 'cancel')}
            onClick={onClose}
            variant={ButtonVariant.GHOST}
          />
          {phase !== 'done' ? (
            <Button
              isDisabled={phase !== 'review' || readyCount === 0}
              isLoading={phase === 'moving'}
              label={
                readyCount === 0
                  ? translate('moveNone')
                  : readyCount === 1
                    ? translate('moveOne')
                    : translate('moveMany', { count: readyCount })
              }
              onClick={() => void handleMove()}
              variant={ButtonVariant.DESTRUCTIVE}
            />
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
