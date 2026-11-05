'use client';

import { useBrand } from '@contexts/user/brand-context/brand-context';
import { HEYGEN_CREDENTIALS_INVALID_ERROR_CODE } from '@genfeedai/contracts/constants';
import type {
  HeyGenAvatarCatalogPage,
  HeyGenCatalogAvatar,
  HeyGenCatalogVoice,
} from '@genfeedai/contracts/interfaces';
import { useAuthedQuery } from '@hooks/auth/use-authed-query/use-authed-query';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { getJsonApiErrorMember } from '@services/core/json-api-error-message';
import { HeyGenService } from '@services/ingredients/heygen.service';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

const RECONNECT_MESSAGE =
  'HeyGen rejected the saved credentials. Reconnect HeyGen in Integrations.';
const LOAD_MORE_ERROR =
  'More HeyGen avatars could not be loaded. Try loading more again.';

const OWNERSHIPS = ['public', 'private'] as const;
type AvatarOwnership = (typeof OWNERSHIPS)[number];

const EMPTY_AVATARS: HeyGenCatalogAvatar[] = [];
const EMPTY_VOICES: HeyGenCatalogVoice[] = [];

/** The avatar pages "load more" followed from one cached first page. */
interface AvatarContinuation {
  avatars: HeyGenCatalogAvatar[];
  /** The first page these follow; a refreshed first page drops them. */
  base: HeyGenAvatarCatalogPage;
  nextCursor: string | null;
  seenCursors: ReadonlySet<string>;
}

type AvatarContinuations = Partial<Record<AvatarOwnership, AvatarContinuation>>;

function isCredentialsInvalid(error: unknown): boolean {
  return (
    getJsonApiErrorMember(error)?.code === HEYGEN_CREDENTIALS_INVALID_ERROR_CODE
  );
}

function createHeyGenService(token: string): HeyGenService {
  return HeyGenService.getInstance(token);
}

function avatarKey(avatar: HeyGenCatalogAvatar): string {
  return `${avatar.avatarRef.ownership}:${avatar.avatarId}`;
}

function mergeAvatars(
  current: readonly HeyGenCatalogAvatar[],
  next: readonly HeyGenCatalogAvatar[],
): HeyGenCatalogAvatar[] {
  const values = new Map(current.map((avatar) => [avatarKey(avatar), avatar]));
  for (const avatar of next) values.set(avatarKey(avatar), avatar);
  return [...values.values()];
}

async function readAvatarPage(
  service: HeyGenService,
  ownership: AvatarOwnership,
  signal: AbortSignal,
  cursor?: string,
): Promise<HeyGenAvatarCatalogPage> {
  const page = await service.fetchAvatarPage({ cursor, ownership, signal });
  if (page.ownership !== ownership)
    throw new Error('Catalogue ownership mismatch');
  return page;
}

export interface UseHeyGenCatalogOptions {
  /** Skip every catalogue request for surfaces that do not need avatars or stock voices. */
  isEnabled?: boolean;
}

/**
 * Organization-bound pages; healthy sources remain usable during an outage.
 *
 * The public and private avatar first pages and the stock voices are three
 * cached reads per organization, so coming back to an avatar surface paints
 * the catalogue at once and refreshes it in the background. "Load more"
 * follows each partition's cursor locally. Only a source with nothing to show
 * reports its failure; a failed background refresh keeps what is on screen.
 */
export function useHeyGenCatalog({
  isEnabled = true,
}: UseHeyGenCatalogOptions = {}) {
  const { organizationId } = useBrand();
  const getService = useAuthedService(createHeyGenService);
  const isActive = isEnabled && Boolean(organizationId);
  const scopeKey = ['heygen', 'catalog', organizationId ?? null] as const;

  const publicAvatars = useAuthedQuery<HeyGenService, HeyGenAvatarCatalogPage>({
    enabled: isActive,
    queryFn: (service, signal) => readAvatarPage(service, 'public', signal),
    queryKey: [...scopeKey, 'avatars', 'public'],
    service: createHeyGenService,
  });
  const privateAvatars = useAuthedQuery<HeyGenService, HeyGenAvatarCatalogPage>(
    {
      enabled: isActive,
      queryFn: (service, signal) => readAvatarPage(service, 'private', signal),
      queryKey: [...scopeKey, 'avatars', 'private'],
      service: createHeyGenService,
    },
  );
  const voicesQuery = useAuthedQuery<HeyGenService, HeyGenCatalogVoice[]>({
    enabled: isActive,
    queryFn: (service, signal) => service.fetchVoices(signal),
    queryKey: [...scopeKey, 'voices'],
    service: createHeyGenService,
  });

  const publicPage = isActive ? publicAvatars.data : undefined;
  const privatePage = isActive ? privateAvatars.data : undefined;

  const [continuations, setContinuations] = useState<AvatarContinuations>({});
  const [isLoadingMoreAvatars, setIsLoadingMoreAvatars] = useState(false);
  const [loadMoreError, setLoadMoreError] = useState<string | null>(null);
  const loadMoreController = useRef<AbortController | null>(null);

  // Another organization never receives a continuation still in flight.
  // biome-ignore lint/correctness/useExhaustiveDependencies: organizationId and isEnabled mark a new catalogue
  useEffect(() => {
    loadMoreController.current?.abort();
    loadMoreController.current = null;
    setIsLoadingMoreAvatars(false);
    setLoadMoreError(null);
    return () => loadMoreController.current?.abort();
  }, [isEnabled, organizationId]);

  const partitions = useMemo(
    () =>
      OWNERSHIPS.map((ownership) => {
        const base = ownership === 'public' ? publicPage : privatePage;
        const continuation = continuations[ownership];
        const followed =
          base && continuation?.base === base ? continuation : undefined;
        return {
          avatars: base
            ? followed
              ? followed.avatars
              : base.avatars
            : EMPTY_AVATARS,
          base,
          nextCursor: followed
            ? followed.nextCursor
            : (base?.nextCursor ?? null),
          ownership,
          seenCursors:
            followed?.seenCursors ??
            new Set(base?.nextCursor ? [base.nextCursor] : []),
        };
      }),
    [continuations, privatePage, publicPage],
  );
  const avatars = useMemo(
    () =>
      partitions.reduce<HeyGenCatalogAvatar[]>(
        (all, partition) => mergeAvatars(all, partition.avatars),
        [],
      ),
    [partitions],
  );

  const isLoading =
    isActive &&
    (publicAvatars.isLoading ||
      privateAvatars.isLoading ||
      voicesQuery.isLoading);

  const loadMoreAvatars = useCallback(async () => {
    if (!isActive || isLoading || loadMoreController.current) return;
    const pending = partitions.filter(
      (partition) => partition.base && partition.nextCursor,
    );
    if (pending.length === 0) return;

    const abort = new AbortController();
    loadMoreController.current = abort;
    setIsLoadingMoreAvatars(true);
    setLoadMoreError(null);
    try {
      const service = await getService();
      if (abort.signal.aborted) return;
      await Promise.all(
        pending.map(async (partition) => {
          const { base, nextCursor, ownership, seenCursors } = partition;
          if (!base || !nextCursor) return;
          try {
            const page = await readAvatarPage(
              service,
              ownership,
              abort.signal,
              nextCursor,
            );
            if (abort.signal.aborted) return;
            if (page.nextCursor && seenCursors.has(page.nextCursor))
              throw new Error('HeyGen returned a repeated catalogue cursor.');
            setContinuations((current) => {
              const previous = current[ownership];
              const followed =
                previous?.base === base
                  ? previous
                  : {
                      avatars: base.avatars,
                      base,
                      nextCursor: base.nextCursor,
                      seenCursors,
                    };
              return {
                ...current,
                [ownership]: {
                  avatars: mergeAvatars(followed.avatars, page.avatars),
                  base,
                  nextCursor: page.nextCursor,
                  seenCursors: page.nextCursor
                    ? new Set([...followed.seenCursors, page.nextCursor])
                    : followed.seenCursors,
                },
              };
            });
          } catch {
            if (!abort.signal.aborted) setLoadMoreError(LOAD_MORE_ERROR);
          }
        }),
      );
    } catch {
      if (!abort.signal.aborted) setLoadMoreError(LOAD_MORE_ERROR);
    } finally {
      if (loadMoreController.current === abort) {
        loadMoreController.current = null;
        setIsLoadingMoreAvatars(false);
      }
    }
  }, [getService, isActive, isLoading, partitions]);

  const { refetch: refetchPublic } = publicAvatars;
  const { refetch: refetchPrivate } = privateAvatars;
  const { refetch: refetchVoices } = voicesQuery;
  const retry = useCallback(() => {
    setLoadMoreError(null);
    void refetchPublic();
    void refetchPrivate();
    void refetchVoices();
  }, [refetchPrivate, refetchPublic, refetchVoices]);

  // A source fails the catalogue only when it has nothing to show; a rejected
  // credential asks for a reconnect even over cached results.
  const sources = [
    { label: 'public avatars', query: publicAvatars },
    { label: 'private avatars', query: privateAvatars },
    { label: 'voices', query: voicesQuery },
  ];
  const failures = isActive
    ? sources.filter(({ query }) => query.isError && query.data === undefined)
    : [];
  const isReconnectRequired =
    isActive &&
    sources.some(
      ({ query }) => query.isError && isCredentialsInvalid(query.error),
    );
  const loadError =
    failures.length === 0
      ? null
      : `HeyGen ${failures.map(({ label }) => label).join(' and ')} could not be loaded. Retry or check your connection in Integrations.`;

  return {
    avatars,
    voices: (isActive ? voicesQuery.data : undefined) ?? EMPTY_VOICES,
    hasMoreAvatars: partitions.some((partition) => partition.nextCursor),
    loadMoreAvatars,
    isLoadingMoreAvatars,
    isLoading,
    error: isReconnectRequired
      ? RECONNECT_MESSAGE
      : (loadError ?? (isActive ? loadMoreError : null)),
    isReconnectRequired,
    retry,
  };
}
