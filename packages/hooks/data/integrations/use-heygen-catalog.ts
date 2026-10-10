'use client';

import { useBrand } from '@contexts/user/brand-context/brand-context';
import type {
  HeyGenAvatarCatalogPage,
  HeyGenCatalogAvatar,
  HeyGenCatalogVoice,
} from '@genfeedai/contracts/interfaces';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { HeyGenService } from '@services/ingredients/heygen.service';
import { useCallback, useEffect, useRef, useState } from 'react';

/** Organization-bound pages; healthy sources remain usable during an outage. */
export function useHeyGenCatalog() {
  const { organizationId } = useBrand();
  const getService = useAuthedService((token: string) =>
    HeyGenService.getInstance(token),
  );
  const [catalogOrganizationId, setCatalogOrganizationId] = useState<
    string | undefined
  >();
  const [avatars, setAvatars] = useState<HeyGenCatalogAvatar[]>([]);
  const [voices, setVoices] = useState<HeyGenCatalogVoice[]>([]);
  const [cursors, setCursors] = useState<
    Record<'public' | 'private', string | null>
  >({ public: null, private: null });
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMoreAvatars, setIsLoadingMoreAvatars] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const active = useRef<AbortController | null>(null);
  const activeOrganization = useRef<string | undefined>(undefined);
  const loadingMore = useRef(false);
  const seen = useRef({
    public: new Set<string>(),
    private: new Set<string>(),
  });
  const retry = useCallback(() => setRetryCount((count) => count + 1), []);

  const acceptPage = useCallback(
    (page: HeyGenAvatarCatalogPage, append: boolean) => {
      const partition = page.ownership;
      if (page.nextCursor && seen.current[partition].has(page.nextCursor))
        throw new Error('HeyGen returned a repeated catalogue cursor.');
      if (page.nextCursor) seen.current[partition].add(page.nextCursor);
      setAvatars((previous) => {
        const retained = append
          ? previous
          : previous.filter(
              (avatar) => avatar.avatarRef.ownership !== partition,
            );
        const values = new Map(
          retained.map((avatar) => [
            `${avatar.avatarRef.ownership}:${avatar.avatarId}`,
            avatar,
          ]),
        );
        for (const avatar of page.avatars)
          values.set(`${partition}:${avatar.avatarId}`, avatar);
        return [...values.values()];
      });
      setCursors((previous) => ({ ...previous, [partition]: page.nextCursor }));
    },
    [],
  );

  // biome-ignore lint/correctness/useExhaustiveDependencies: retryCount explicitly requests a fresh catalogue load.
  useEffect(() => {
    const abort = new AbortController();
    if (activeOrganization.current !== organizationId) {
      setAvatars([]);
      setVoices([]);
    }
    active.current = abort;
    activeOrganization.current = organizationId;
    loadingMore.current = false;
    seen.current = { public: new Set(), private: new Set() };
    setCursors({ public: null, private: null });
    setIsLoadingMoreAvatars(false);
    setError(null);
    setIsLoading(Boolean(organizationId));
    async function load() {
      const failures: string[] = [];
      try {
        const service = await getService();
        if (abort.signal.aborted) return;
        await Promise.all([
          ...(['public', 'private'] as const).map(async (ownership) => {
            try {
              const page = await service.fetchAvatarPage({
                ownership,
                signal: abort.signal,
              });
              if (abort.signal.aborted) return;
              if (page.ownership !== ownership)
                throw new Error('Catalogue ownership mismatch');
              setCatalogOrganizationId(organizationId);
              acceptPage(page, false);
            } catch {
              if (abort.signal.aborted) return;
              failures.push(`${ownership} avatars`);
              setAvatars((previous) =>
                previous.filter(
                  (avatar) => avatar.avatarRef.ownership !== ownership,
                ),
              );
              setError(
                `HeyGen ${failures.join(' and ')} could not be loaded. Retry or check your connection in Integrations.`,
              );
            }
          }),
          (async () => {
            try {
              const nextVoices = await service.fetchVoices(abort.signal);
              if (abort.signal.aborted) return;
              setCatalogOrganizationId(organizationId);
              setVoices(nextVoices);
            } catch {
              if (abort.signal.aborted) return;
              failures.push('voices');
              setVoices([]);
              setError(
                `HeyGen ${failures.join(' and ')} could not be loaded. Retry or check your connection in Integrations.`,
              );
            }
          })(),
        ]);
      } catch {
        if (!abort.signal.aborted) {
          setCatalogOrganizationId(organizationId);
          setAvatars([]);
          setVoices([]);
          setError(
            'HeyGen identities could not be loaded. Retry or check your connection in Integrations.',
          );
        }
      } finally {
        if (!abort.signal.aborted) {
          setCatalogOrganizationId(organizationId);
          setIsLoading(false);
        }
      }
    }
    if (organizationId) void load();
    return () => abort.abort();
  }, [acceptPage, getService, organizationId, retryCount]);

  const loadMoreAvatars = useCallback(async () => {
    const abort = active.current;
    if (
      !abort ||
      abort.signal.aborted ||
      loadingMore.current ||
      isLoading ||
      activeOrganization.current !== organizationId
    )
      return;
    loadingMore.current = true;
    setIsLoadingMoreAvatars(true);
    setError(null);
    try {
      const service = await getService();
      if (abort.signal.aborted) return;
      await Promise.all(
        (['public', 'private'] as const).map(async (ownership) => {
          const cursor = cursors[ownership];
          if (!cursor) return;
          try {
            const page = await service.fetchAvatarPage({
              ownership,
              cursor,
              signal: abort.signal,
            });
            if (abort.signal.aborted) return;
            if (page.ownership !== ownership)
              throw new Error('Catalogue ownership mismatch');
            acceptPage(page, true);
          } catch {
            if (!abort.signal.aborted)
              setError(
                'More HeyGen avatars could not be loaded. Try loading more again.',
              );
          }
        }),
      );
    } catch {
      if (!abort.signal.aborted)
        setError(
          'More HeyGen avatars could not be loaded. Try loading more again.',
        );
    } finally {
      if (!abort.signal.aborted) {
        loadingMore.current = false;
        setIsLoadingMoreAvatars(false);
      }
    }
  }, [acceptPage, cursors, getService, isLoading, organizationId]);
  const matchesOrganization = catalogOrganizationId === organizationId;
  return {
    avatars: matchesOrganization ? avatars : [],
    voices: matchesOrganization ? voices : [],
    hasMoreAvatars:
      matchesOrganization && Boolean(cursors.public || cursors.private),
    loadMoreAvatars,
    isLoadingMoreAvatars,
    isLoading,
    error: matchesOrganization ? error : null,
    retry,
  };
}
