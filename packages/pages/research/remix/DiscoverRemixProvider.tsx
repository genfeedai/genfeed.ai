'use client';

import type {
  BrandRemixDraftEdits,
  BrandRemixRunView,
  BrandRemixSourceSelector,
} from '@api-types/contracts';
import { useBrandId } from '@contexts/user/brand-context/brand-context';
import { APP_ROUTES } from '@genfeedai/constants';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import { ContentRunsService } from '@services/content/content-runs.service';
import { getJsonApiErrorMessage } from '@services/core/json-api-error-message';
import { useRouter } from 'next/navigation';
import {
  createContext,
  type PropsWithChildren,
  type ReactElement,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from 'react';

export type DiscoverRemixStatus =
  | 'idle'
  | 'preparing'
  | 'ready'
  | 'saving'
  | 'error';

export interface DiscoverRemixContextValue {
  readonly close: () => void;
  readonly confirm: (edits?: BrandRemixDraftEdits) => Promise<void>;
  readonly error: string | null;
  readonly isOpen: boolean;
  readonly openRemix: (source: BrandRemixSourceSelector) => Promise<void>;
  readonly retry: () => Promise<void>;
  readonly run: BrandRemixRunView | null;
  readonly status: DiscoverRemixStatus;
}

const DiscoverRemixContext = createContext<DiscoverRemixContextValue | null>(
  null,
);

export function DiscoverRemixProvider({
  children,
}: PropsWithChildren): ReactElement {
  const brandId = useBrandId();
  const { activeHref } = useOrgUrl();
  const router = useRouter();
  const getContentRunsService = useAuthedService((token: string) =>
    ContentRunsService.getInstance(token),
  );
  const requestVersionRef = useRef(0);
  const lastSourceRef = useRef<BrandRemixSourceSelector | null>(null);
  const openInFlightRef = useRef<{
    key: string;
    requestVersion: number;
  } | null>(null);
  const confirmInFlightRef = useRef<number | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [run, setRun] = useState<BrandRemixRunView | null>(null);
  const [status, setStatus] = useState<DiscoverRemixStatus>('idle');
  const [error, setError] = useState<string | null>(null);

  const close = useCallback(() => {
    requestVersionRef.current += 1;
    setIsOpen(false);
    setRun(null);
    setError(null);
    setStatus('idle');
    lastSourceRef.current = null;
    openInFlightRef.current = null;
    confirmInFlightRef.current = null;
  }, []);

  const openRemix = useCallback(
    async (source: BrandRemixSourceSelector) => {
      lastSourceRef.current = source;
      if (!brandId) {
        setIsOpen(true);
        setRun(null);
        setError('Select a brand before preparing an on-brand remix.');
        setStatus('error');
        return;
      }

      const sourceKey = JSON.stringify(source);
      if (openInFlightRef.current?.key === sourceKey) {
        return;
      }
      const requestVersion = requestVersionRef.current + 1;
      requestVersionRef.current = requestVersion;
      openInFlightRef.current = { key: sourceKey, requestVersion };
      setIsOpen(true);
      setRun(null);
      setError(null);
      setStatus('preparing');

      try {
        const service = await getContentRunsService();
        const preparedRun = await service.createBrandRemixRun(brandId, {
          source,
        });
        if (requestVersionRef.current !== requestVersion) {
          return;
        }

        setRun(preparedRun);
        setStatus('ready');
      } catch (caughtError) {
        if (requestVersionRef.current !== requestVersion) {
          return;
        }

        setError(
          getJsonApiErrorMessage(
            caughtError,
            'The on-brand remix brief could not be prepared.',
          ),
        );
        setStatus('error');
      } finally {
        if (openInFlightRef.current?.requestVersion === requestVersion) {
          openInFlightRef.current = null;
        }
      }
    },
    [brandId, getContentRunsService],
  );

  const retry = useCallback(async () => {
    if (lastSourceRef.current) {
      await openRemix(lastSourceRef.current);
    }
  }, [openRemix]);

  const confirm = useCallback(
    async (edits?: BrandRemixDraftEdits) => {
      const requestVersion = requestVersionRef.current;
      if (
        !run ||
        confirmInFlightRef.current === requestVersion ||
        status === 'saving'
      ) {
        return;
      }

      confirmInFlightRef.current = requestVersion;
      setError(null);
      setStatus('saving');
      try {
        const service = await getContentRunsService();
        const savedRun = edits
          ? await service.reviseBrandRemixRun(run.id, {
              edits,
              expectedRevision: run.revision,
            })
          : run;
        if (requestVersionRef.current !== requestVersion) {
          return;
        }
        setRun(savedRun);
        if (savedRun.readiness.state === 'blocked') {
          setStatus('ready');
          return;
        }
        router.push(
          activeHref(
            `${APP_ROUTES.STUDIO.GENERATE}?run=${encodeURIComponent(savedRun.id)}`,
          ),
        );
      } catch (caughtError) {
        if (requestVersionRef.current !== requestVersion) {
          return;
        }
        setError(
          getJsonApiErrorMessage(
            caughtError,
            'The on-brand remix brief could not be prepared.',
          ),
        );
        setStatus('error');
      } finally {
        if (confirmInFlightRef.current === requestVersion) {
          confirmInFlightRef.current = null;
        }
      }
    },
    [activeHref, getContentRunsService, router, run, status],
  );

  const value = useMemo<DiscoverRemixContextValue>(
    () => ({ close, confirm, error, isOpen, openRemix, retry, run, status }),
    [close, confirm, error, isOpen, openRemix, retry, run, status],
  );

  return (
    <DiscoverRemixContext.Provider value={value}>
      {children}
    </DiscoverRemixContext.Provider>
  );
}

export function useOptionalDiscoverRemix(): DiscoverRemixContextValue | null {
  return useContext(DiscoverRemixContext);
}

export function useDiscoverRemix(): DiscoverRemixContextValue {
  const context = useOptionalDiscoverRemix();
  if (!context) {
    throw new Error(
      'useDiscoverRemix must be used within DiscoverRemixProvider',
    );
  }

  return context;
}
