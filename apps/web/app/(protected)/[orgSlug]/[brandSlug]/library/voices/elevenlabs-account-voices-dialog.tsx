'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import type {
  ElevenLabsAccountVoice,
  ElevenLabsAccountVoicePage,
} from '@genfeedai/contracts/interfaces';
import { useAuthedQuery } from '@hooks/auth/use-authed-query/use-authed-query';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import { VoicesService } from '@services/ingredients/voices.service';
import { useQueryClient } from '@tanstack/react-query';
import MediaPlayer from '@ui/media-player/MediaPlayer';
import { Badge } from '@ui/primitives/badge';
import { Button } from '@ui/primitives/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@ui/primitives/dialog';
import { Input } from '@ui/primitives/input';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ElevenLabsAccountVoicesDialogProps } from '@/features/library/props/elevenlabs-account-voices-dialog.props';
import { useDebounce } from '@/hooks/utils/use-debounce/use-debounce';

const SEARCH_DEBOUNCE_MS = 350;
const EMPTY_VOICES: ElevenLabsAccountVoice[] = [];
const ACCOUNT_VOICES_KEY = ['elevenlabs-account-voices'] as const;

/** One search of the connected account: its first page plus every later page loaded. */
function accountVoicesQueryKey(search: string) {
  return [...ACCOUNT_VOICES_KEY, search] as const;
}

function appendUniqueVoices(
  current: ElevenLabsAccountVoice[],
  next: ElevenLabsAccountVoice[],
): ElevenLabsAccountVoice[] {
  const seen = new Set(current.map((voice) => voice.externalVoiceId));
  return [
    ...current,
    ...next.filter((voice) => !seen.has(voice.externalVoiceId)),
  ];
}

/**
 * Browses the organization's connected ElevenLabs account and saves voices
 * as Library references. Importing never changes the remote voice.
 */
export default function ElevenLabsAccountVoicesDialog({
  connectHref,
  onClose,
  onImported,
}: ElevenLabsAccountVoicesDialogProps) {
  const translate = useTranslations('pages.library.accountVoices');
  const notifications = NotificationsService.getInstance();
  const getVoicesService = useAuthedService((token: string) =>
    VoicesService.getInstance(token),
  );

  const [query, setQuery] = useState('');
  const search = useDebounce(query.trim(), SEARCH_DEBOUNCE_MS);
  const queryClient = useQueryClient();
  // Each search is its own cache entry, so reopening the dialog paints the
  // voices already loaded, and a failed search never shows another search's
  // results or cursor.
  const voicesQuery = useAuthedQuery<VoicesService, ElevenLabsAccountVoicePage>(
    {
      queryFn: async (service, signal) => {
        try {
          return await service.findAccountVoices(
            { search: search || undefined },
            signal,
          );
        } catch (error) {
          if (!signal.aborted) {
            logger.error('Failed to load ElevenLabs account voices', error);
          }
          throw error;
        }
      },
      queryKey: accountVoicesQueryKey(search),
      service: (token: string) => VoicesService.getInstance(token),
    },
  );
  const { data: accountVoices, refetch: refetchVoices } = voicesQuery;
  const status = accountVoices?.connection.status ?? null;
  const voices = accountVoices?.voices ?? EMPTY_VOICES;
  const nextPageToken = accountVoices?.hasMore
    ? accountVoices.nextPageToken
    : null;
  // A retry after a failed read has nothing to show yet, so it loads too.
  const isLoading =
    voicesQuery.isPending ||
    (accountVoices === undefined && voicesQuery.isFetching);
  const hasError = voicesQuery.isError;
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [importingId, setImportingId] = useState<string | null>(null);
  // A later page belongs to the search that requested it; a new search
  // cancels it so stale voices and cursors never land in the new list.
  const loadMoreControllerRef = useRef<AbortController | null>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: a new search cancels the later page of the one before it.
  useEffect(() => () => loadMoreControllerRef.current?.abort(), [search]);

  const loadMore = useCallback(async () => {
    if (!nextPageToken) return;
    loadMoreControllerRef.current?.abort();
    const controller = new AbortController();
    loadMoreControllerRef.current = controller;
    setIsLoadingMore(true);
    try {
      const service = await getVoicesService();
      const page = await service.findAccountVoices(
        {
          pageToken: nextPageToken,
          search: search || undefined,
        },
        controller.signal,
      );
      if (controller.signal.aborted) return;
      queryClient.setQueriesData<ElevenLabsAccountVoicePage>(
        { queryKey: accountVoicesQueryKey(search) },
        (current) =>
          current
            ? {
                ...current,
                hasMore: page.hasMore,
                nextPageToken: page.nextPageToken,
                voices: appendUniqueVoices(current.voices, page.voices),
              }
            : current,
      );
    } catch (error) {
      if (controller.signal.aborted) return;
      logger.error('Failed to load more ElevenLabs voices', error);
      notifications.error(translate('loadError'));
    } finally {
      if (loadMoreControllerRef.current === controller) {
        loadMoreControllerRef.current = null;
        setIsLoadingMore(false);
      }
    }
  }, [
    getVoicesService,
    nextPageToken,
    notifications,
    queryClient,
    search,
    translate,
  ]);

  const importVoice = useCallback(
    async (voice: ElevenLabsAccountVoice) => {
      setImportingId(voice.externalVoiceId);
      try {
        const service = await getVoicesService();
        const saved = await service.importAccountVoice(voice.externalVoiceId);
        // Every cached search shows the voice as saved.
        queryClient.setQueriesData<ElevenLabsAccountVoicePage>(
          { queryKey: ACCOUNT_VOICES_KEY },
          (current) =>
            current
              ? {
                  ...current,
                  voices: current.voices.map((item) =>
                    item.externalVoiceId === voice.externalVoiceId
                      ? { ...item, savedVoiceId: String(saved.id) }
                      : item,
                  ),
                }
              : current,
        );
        notifications.success(translate('importSuccess', { name: voice.name }));
        onImported(saved);
      } catch (error) {
        logger.error('Failed to import ElevenLabs voice', error);
        notifications.error(
          error instanceof Error && error.message
            ? error.message
            : translate('importError'),
        );
      } finally {
        setImportingId(null);
      }
    },
    [getVoicesService, notifications, onImported, queryClient, translate],
  );

  const isConnected = status === 'connected';

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{translate('title')}</DialogTitle>
          <DialogDescription>{translate('description')}</DialogDescription>
        </DialogHeader>

        {status === 'disconnected' || status === 'invalid' ? (
          <div className="space-y-3" role="status">
            <p className="font-medium">{translate(`${status}.title`)}</p>
            <p className="text-sm text-muted-foreground">
              {translate(`${status}.body`)}
            </p>
            <Button
              asChild
              variant={ButtonVariant.SECONDARY}
              withWrapper={false}
            >
              <Link href={connectHref}>{translate('openIntegrations')}</Link>
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            <Input
              aria-label={translate('searchLabel')}
              placeholder={translate('searchLabel')}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />

            {isLoading ? (
              <p className="text-sm text-muted-foreground" role="status">
                {translate('loading')}
              </p>
            ) : null}

            {hasError && !isLoading ? (
              <div className="space-y-3" role="alert">
                <p className="text-sm">{translate('loadError')}</p>
                <Button
                  label={translate('retry')}
                  variant={ButtonVariant.SECONDARY}
                  onClick={() => {
                    void refetchVoices();
                  }}
                />
              </div>
            ) : null}

            {isConnected && !isLoading && !hasError && voices.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {translate('empty')}
              </p>
            ) : null}

            {isConnected && !isLoading && voices.length > 0 ? (
              <ul
                aria-label={translate('listLabel')}
                className="max-h-[min(480px,60vh)] space-y-2 overflow-y-auto"
              >
                {voices.map((voice) => {
                  const isSaved = voice.savedVoiceId !== null;
                  const isAvailable = voice.availability === 'available';

                  return (
                    <li
                      key={voice.externalVoiceId}
                      className="space-y-2 rounded-md border border-border p-3"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="min-w-0 space-y-1">
                          <p className="truncate font-medium">{voice.name}</p>
                          <div className="flex flex-wrap gap-1">
                            {voice.category ? (
                              <Badge variant="secondary">
                                {voice.category}
                              </Badge>
                            ) : null}
                            {isAvailable ? null : (
                              <Badge variant="warning">
                                {translate(
                                  `availability.${voice.availability}`,
                                )}
                              </Badge>
                            )}
                          </div>
                        </div>
                        <Button
                          ariaLabel={translate('importVoice', {
                            name: voice.name,
                          })}
                          isDisabled={!isAvailable || isSaved}
                          isLoading={importingId === voice.externalVoiceId}
                          label={translate(isSaved ? 'imported' : 'import')}
                          onClick={() => {
                            void importVoice(voice);
                          }}
                          size={ButtonSize.SM}
                          variant={
                            isSaved
                              ? ButtonVariant.GHOST
                              : ButtonVariant.SECONDARY
                          }
                        />
                      </div>
                      {voice.restriction ? (
                        <p className="text-xs text-warning">
                          {voice.restriction}
                        </p>
                      ) : null}
                      {voice.preview ? (
                        <MediaPlayer
                          src={voice.preview}
                          label={voice.name}
                          stopOnUnmount
                        />
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            ) : null}

            {isConnected && nextPageToken && !isLoading ? (
              <Button
                isLoading={isLoadingMore}
                label={translate('loadMore')}
                onClick={() => {
                  void loadMore();
                }}
                variant={ButtonVariant.GHOST}
              />
            ) : null}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
