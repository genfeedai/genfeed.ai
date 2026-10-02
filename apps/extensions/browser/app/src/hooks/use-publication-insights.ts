import type { PublicationInsight } from '@genfeedai/contracts/interfaces/content/publication-insights.interface';
import type { ExtensionPublicationInsightsState } from '@genfeedai/contracts/interfaces/extension/extension-publication-insights.interface';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  linkPublicationInsightCredential,
  loadPublicationInsight,
  loadPublicationInsightPage,
  PublicationInsightsRequestError,
  refreshPublicationInsight,
} from '~services/publication-insights.service';
import { resolvePublicationInsightPage } from '~services/publication-insights-validation';
import { usePlatformStore } from '~store/use-platform-store';
import { useWorkspaceStore } from '~store/use-workspace-store';

function empty(key: string, page: number): ExtensionPublicationInsightsState {
  return {
    key,
    page,
    pageData: null,
    selectedPostId: null,
    insight: null,
    isLoading: false,
    isBusy: false,
    error: null,
    notice: null,
  };
}
export function usePublicationInsights() {
  const workspace = useWorkspaceStore();
  const url = usePlatformStore((state) => state.pageContext.url);
  const lookup = useMemo(() => resolvePublicationInsightPage(url), [url]);
  const snapshot =
    workspace.status === 'ready' && workspace.snapshot.brandId
      ? workspace.snapshot
      : null;
  const base =
    snapshot && lookup
      ? JSON.stringify([
          snapshot.userId,
          snapshot.organizationId,
          snapshot.brandId,
          snapshot.revision,
          lookup.platform,
          lookup.pageUrl,
        ])
      : '';
  const [pager, setPager] = useState<
    Pick<ExtensionPublicationInsightsState, 'key' | 'page'>
  >({ key: '', page: 1 });
  if (pager.key !== base) setPager({ key: base, page: 1 });
  const page = pager.key === base ? pager.page : 1;
  const key = base ? JSON.stringify([base, page]) : '';
  const [state, setState] = useState<ExtensionPublicationInsightsState>(() =>
    empty('', 1),
  );
  const current = useRef(key);
  current.current = key;
  const generation = useRef(0);
  const controller = useRef<AbortController | null>(null);
  const busy = useRef(false);
  const visible = key && state.key === key ? state : empty(key, page);
  const update = useCallback(
    (patch: Partial<ExtensionPublicationInsightsState>) => {
      if (current.current !== key) return;
      setState((old) => ({
        ...(old.key === key ? old : empty(key, page)),
        ...patch,
      }));
    },
    [key, page],
  );
  const execute = useCallback(
    async (
      work: (signal: AbortSignal, valid: () => boolean) => Promise<void>,
      isBusy = false,
    ) => {
      if (!key) return;
      controller.current?.abort();
      const request = new AbortController();
      controller.current = request;
      const version = ++generation.current;
      busy.current = true;
      const valid = () =>
        !request.signal.aborted &&
        version === generation.current &&
        current.current === key;
      update({ isLoading: !isBusy, isBusy, error: null, notice: null });
      try {
        await work(request.signal, valid);
      } catch (error) {
        if (valid())
          update({
            error:
              error instanceof PublicationInsightsRequestError
                ? error.message
                : 'Could not load this publication. Retry.',
            ...(error instanceof PublicationInsightsRequestError &&
            error.code === 'not-found'
              ? { selectedPostId: null, insight: null }
              : {}),
          });
      } finally {
        if (valid()) {
          busy.current = false;
          update({ isLoading: false, isBusy: false });
        }
      }
    },
    [key, update],
  );
  const detail = useCallback(
    async (
      postId: string,
      signal: AbortSignal,
      valid: () => boolean,
    ): Promise<void> => {
      if (!snapshot || !lookup) return;
      const insight = await loadPublicationInsight(postId, {
        snapshot,
        signal,
      });
      if (!valid()) return;
      if (insight.platform !== lookup.platform)
        throw new PublicationInsightsRequestError(
          'invalid-response',
          null,
          'Could not load this publication. Retry.',
        );
      update({ selectedPostId: postId, insight });
    },
    [snapshot, lookup, update],
  );
  const loadPage = useCallback(
    () =>
      execute(async (signal, valid) => {
        if (!snapshot || !lookup) return;
        const pageData = await loadPublicationInsightPage(lookup, page, {
          snapshot,
          signal,
        });
        if (!valid()) return;
        update({ pageData });
        if (page === 1 && pageData.total === 1 && pageData.items.length === 1) {
          const id = pageData.items[0].id;
          update({ selectedPostId: id });
          await detail(id, signal, valid);
        }
      }),
    [execute, snapshot, lookup, page, update, detail],
  );
  useEffect(() => {
    controller.current?.abort();
    generation.current++;
    busy.current = false;
    setState(empty(key, page));
    if (key) void loadPage();
    return () => {
      controller.current?.abort();
      generation.current++;
      busy.current = false;
    };
  }, [key, page, loadPage]);
  function selectPage(next: number) {
    if (
      busy.current ||
      !base ||
      !Number.isInteger(next) ||
      next < 1 ||
      next > (visible.pageData?.pages ?? 0)
    )
      return;
    setPager({ key: base, page: next });
  }
  function select(postId: string) {
    if (
      busy.current ||
      !visible.pageData?.items.some((item) => item.id === postId)
    )
      return;
    update({ selectedPostId: postId, insight: null });
    void execute((signal, valid) => detail(postId, signal, valid));
  }
  function reload() {
    if (busy.current) return;
    if (visible.selectedPostId)
      void execute((signal, valid) =>
        detail(visible.selectedPostId as string, signal, valid),
      );
    else void loadPage();
  }
  function mutate(operation: 'refresh' | 'link', credentialId?: string) {
    const insight: PublicationInsight | null = visible.insight;
    if (busy.current || !snapshot || !insight) return;
    void execute(async (signal, valid) => {
      if (operation === 'refresh')
        await refreshPublicationInsight(insight, { snapshot, signal });
      else if (credentialId)
        await linkPublicationInsightCredential(insight, credentialId, {
          snapshot,
          signal,
        });
      else return;
      if (!valid()) return;
      update({
        notice:
          operation === 'refresh'
            ? 'Analytics refresh requested. Saved metrics may take time to update.'
            : 'Account linked',
      });
      await detail(insight.id, signal, valid);
    }, true);
  }
  return {
    ...visible,
    snapshot,
    lookup,
    selectPage,
    select,
    retry: reload,
    reload,
    refresh: () => mutate('refresh'),
    link: (id: string) => mutate('link', id),
  };
}
