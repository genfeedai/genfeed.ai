'use client';
import { useBrand } from '@genfeedai/contexts/user/brand-context/brand-context';
import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import { learningContractIdSchema } from '@genfeedai/contracts/api-types/contracts/content-learning-generation.contract';
import type {
  BrandedGenerationReceiptReadV1,
  BrandedGenerationReceiptRevisionReadV1,
} from '@genfeedai/contracts/interfaces/content/branded-generation-receipt-read.interface';
import type { BrandedGenerationReceiptInspectorInput } from '@genfeedai/props/content/branded-generation-receipt.props';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import { useBrandDetail } from '@hooks/pages/use-brand-detail/use-brand-detail';
import { BrandedGenerationReceiptsService } from '@services/ai/branded-generation-receipts.service';
import BrandedGenerationReceiptInspector from '@ui/generation-receipts/BrandedGenerationReceiptInspector';
import Container from '@ui/layout/container/Container';
import { Button } from '@ui/primitives/button';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';

function selection(query: ReturnType<typeof useSearchParams>) {
  const ids = query.getAll('receiptId'),
    revisions = query.getAll('revision');
  const id = ids[0];
  const raw = revisions[0];
  const invalid =
    ids.length > 1 ||
    revisions.length > 1 ||
    (!id && revisions.length > 0) ||
    (id !== undefined && !learningContractIdSchema.safeParse(id).success) ||
    (raw !== undefined &&
      (!/^(0|[1-9][0-9]{0,9})$/.test(raw) || Number(raw) > 2147483647));
  return {
    receiptId: invalid ? undefined : id,
    revision: raw === undefined ? undefined : Number(raw),
    invalid,
  };
}
function useReceiptList(organizationId: string, brandId: string) {
  const getService = useAuthedService((token) =>
    BrandedGenerationReceiptsService.getInstance(token),
  );
  const identity = useMemo(
    () => ({ organizationId, brandId, getService }),
    [organizationId, brandId, getService],
  );
  const current = useRef(identity);
  current.current = identity;
  const request = useRef<AbortController | null>(null);
  const [state, setState] = useState({
    identity,
    items: [] as BrandedGenerationReceiptReadV1[],
    cursor: null as string | null,
    loading: false,
    error: false,
  });
  const load = useCallback(
    async (cursor?: string) => {
      request.current?.abort();
      const controller = new AbortController();
      request.current = controller;
      setState((old) => ({
        ...old,
        identity,
        loading: true,
        error: false,
        ...(cursor ? {} : { items: [], cursor: null }),
      }));
      try {
        const service = await getService();
        if (controller.signal.aborted) return;
        const page = await service.list(
          brandId,
          { limit: 10, ...(cursor ? { cursor } : {}) },
          controller.signal,
        );
        if (!controller.signal.aborted && current.current === identity)
          setState((old) => ({
            identity,
            items:
              cursor && old.identity === identity
                ? [...old.items, ...page.items]
                : page.items,
            cursor: page.nextCursor,
            loading: false,
            error: false,
          }));
      } catch {
        if (!controller.signal.aborted && current.current === identity)
          setState({
            identity,
            items: [],
            cursor: null,
            loading: false,
            error: true,
          });
      }
    },
    [identity, getService, brandId],
  );
  useLayoutEffect(() => {
    setState({
      identity,
      items: [],
      cursor: null,
      loading: false,
      error: false,
    });
    if (organizationId && brandId) void load();
    return () => request.current?.abort();
  }, [identity, organizationId, brandId, load]);
  return {
    state:
      state.identity === identity
        ? state
        : { identity, items: [], cursor: null, loading: false, error: false },
    load,
  };
}
function useReceiptHistory({
  organizationId,
  brandId,
  receiptId,
}: Pick<
  BrandedGenerationReceiptInspectorInput,
  'organizationId' | 'brandId' | 'receiptId'
>) {
  const getService = useAuthedService((token) =>
    BrandedGenerationReceiptsService.getInstance(token),
  );
  const identity = useMemo(
    () => ({ organizationId, brandId, receiptId, getService }),
    [organizationId, brandId, receiptId, getService],
  );
  const current = useRef(identity);
  current.current = identity;
  const request = useRef<AbortController | null>(null);
  const [state, setState] = useState({
    identity,
    items: [] as BrandedGenerationReceiptRevisionReadV1[],
    cursor: null as number | null,
    loading: false,
    error: false,
    open: false,
  });
  useLayoutEffect(() => {
    setState({
      identity,
      items: [],
      cursor: null,
      loading: false,
      error: false,
      open: false,
    });
    return () => request.current?.abort();
  }, [identity]);
  const load = async (afterRevision?: number) => {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setState((old) => ({
      ...old,
      identity,
      open: true,
      loading: true,
      error: false,
    }));
    try {
      const service = await getService();
      if (controller.signal.aborted) return;
      const page = await service.history(
        brandId,
        receiptId,
        {
          limit: 10,
          ...(afterRevision === undefined ? {} : { afterRevision }),
        },
        controller.signal,
      );
      if (!controller.signal.aborted && current.current === identity)
        setState((old) => ({
          identity,
          items:
            afterRevision === undefined
              ? page.items
              : [...old.items, ...page.items],
          cursor: page.nextAfterRevision,
          open: true,
          loading: false,
          error: false,
        }));
    } catch {
      if (!controller.signal.aborted && current.current === identity)
        setState({
          identity,
          items: [],
          cursor: null,
          open: true,
          loading: false,
          error: true,
        });
    }
  };
  const visible = state.identity === identity ? state : null;
  return { visible, load };
}
function ReceiptHistory(
  props: Pick<
    BrandedGenerationReceiptInspectorInput,
    'organizationId' | 'brandId' | 'receiptId'
  > &
    Pick<ReturnType<typeof useOrgUrl>, 'href'>,
) {
  const t = useTranslations('pages.generationReceipts');
  const { receiptId, href } = props;
  const { visible, load } = useReceiptHistory(props);
  return (
    <section className="space-y-3">
      <Button
        size={ButtonSize.SM}
        variant={ButtonVariant.SECONDARY}
        disabled={visible?.loading}
        onClick={() => void load()}
      >
        {t('showHistory')}
      </Button>
      {visible?.open ? (
        <>
          <h2 className="text-base font-semibold">{t('history')}</h2>
          <Link
            href={href(
              `/settings/generation-receipts?receiptId=${encodeURIComponent(receiptId)}`,
            )}
          >
            {t('latest')}
          </Link>
          {visible.error ? <p role="alert">{t('loadFailed')}</p> : null}
          <ul className="space-y-2 text-sm">
            {visible.items.map((item) => (
              <li key={item.id}>
                <Link
                  href={href(
                    `/settings/generation-receipts?receiptId=${encodeURIComponent(receiptId)}&revision=${item.revision}`,
                  )}
                >
                  {t('revision', { revision: item.revision })} · {item.state}
                </Link>
              </li>
            ))}
          </ul>
          {visible.cursor !== null ? (
            <Button
              size={ButtonSize.SM}
              variant={ButtonVariant.SECONDARY}
              disabled={visible.loading}
              onClick={() => void load(visible.cursor ?? undefined)}
            >
              {t('loadMore')}
            </Button>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
export default function GenerationReceiptsContent() {
  const t = useTranslations('pages.generationReceipts');
  const { organizationId } = useBrand();
  const detail = useBrandDetail();
  const { href } = useOrgUrl();
  const query = useSearchParams();
  const params = useParams();
  const selected = selection(query);
  const slug = params.brandSlug;
  const matched =
    typeof slug === 'string' &&
    detail.brand &&
    (detail.brand.slug === slug || detail.brand.id === slug) &&
    detail.brand.id === detail.brandId &&
    !detail.isLoading &&
    detail.hasBrandId;
  const brandId = matched ? detail.brandId : '';
  const { state, load } = useReceiptList(organizationId, brandId);
  return (
    <Container label={t('title')} description={t('description')} fullWidth>
      <div className="space-y-6">
        <Button
          size={ButtonSize.SM}
          variant={ButtonVariant.SECONDARY}
          disabled={state.loading || !brandId}
          onClick={() => void load()}
        >
          {t('refresh')}
        </Button>
        {detail.isLoading || state.loading ? (
          <p role="status">{t('loading')}</p>
        ) : null}
        {state.error ? <p role="alert">{t('loadFailed')}</p> : null}
        {!detail.isLoading && !matched ? (
          <p role="alert">{t('unavailable')}</p>
        ) : null}
        {!state.loading && brandId && !state.items.length && !state.error ? (
          <p className="text-sm text-muted-foreground">{t('empty')}</p>
        ) : null}
        <ul className="space-y-3 text-sm">
          {state.items.map((item) => (
            <li key={item.id}>
              <Link
                href={href(
                  `/settings/generation-receipts?receiptId=${encodeURIComponent(item.id)}`,
                )}
              >
                {item.id} · {item.state} ·{' '}
                {t('revision', { revision: item.revision })}
              </Link>
            </li>
          ))}
        </ul>
        {state.cursor ? (
          <Button
            size={ButtonSize.SM}
            variant={ButtonVariant.SECONDARY}
            disabled={state.loading}
            onClick={() => void load(state.cursor ?? undefined)}
          >
            {t('loadMore')}
          </Button>
        ) : null}
        {selected.invalid ? (
          <p role="alert">{t('invalidSelection')}</p>
        ) : selected.receiptId && brandId && organizationId ? (
          <>
            <ReceiptHistory
              organizationId={organizationId}
              brandId={brandId}
              receiptId={selected.receiptId}
              href={href}
            />
            <BrandedGenerationReceiptInspector
              organizationId={organizationId}
              brandId={brandId}
              receiptId={selected.receiptId}
              revision={selected.revision}
              isOpen
            />
          </>
        ) : (
          <p className="text-sm text-muted-foreground">{t('select')}</p>
        )}
      </div>
    </Container>
  );
}
