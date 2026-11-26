import { useBrand } from '@contexts/user/brand-context/brand-context';
import type { LibraryElementKind } from '@genfeedai/contracts';
import { ITEMS_PER_PAGE } from '@genfeedai/contracts/constants';
import type { CreateLibraryElementInput } from '@genfeedai/contracts/interfaces';
import { useAuthedQuery } from '@hooks/auth/use-authed-query/use-authed-query';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import {
  type LibraryElement,
  LibraryElementsService,
  type UpdateLibraryElementInput,
} from '@services/content/library-elements.service';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useCallback, useMemo, useRef, useState } from 'react';
import type { LibraryElementsControls } from '@/props/characters/library-elements.props';

/** The Library elements table; one cache entry per viewer, brand and filter. */
const ELEMENTS_QUERY_KEY = 'library-elements';
const EMPTY_ELEMENTS: LibraryElement[] = [];
/** Everything the page lists besides characters. */
export const ELEMENT_KINDS: readonly LibraryElementKind[] = [
  'LOCATION',
  'STYLE',
  'PROP',
];

function createElementsService(token: string): LibraryElementsService {
  return LibraryElementsService.getInstance(token);
}

/**
 * Locations, styles and props of the active brand (#7374). `kinds` is the
 * Type filter and `search` the page search; characters keep their own table.
 */
export function useLibraryElements(
  kinds: readonly LibraryElementKind[],
  search: string,
): LibraryElementsControls {
  const translate = useTranslations('pages.library.references.elements');
  const { brandId, organizationId } = useBrand();
  const queryClient = useQueryClient();
  const getService = useAuthedService(createElementsService);
  const notifications = useMemo(() => NotificationsService.getInstance(), []);
  const [isBusy, setIsBusy] = useState(false);
  const isBusyRef = useRef(false);
  const activeKinds = kinds.filter((kind) => kind !== 'CHARACTER');
  const listedKinds = activeKinds.length > 0 ? activeKinds : ELEMENT_KINDS;
  const isListed = kinds.length === 0 || activeKinds.length > 0;

  const scopeKey = [
    ELEMENTS_QUERY_KEY,
    organizationId || null,
    brandId || null,
  ];
  const query = useAuthedQuery<LibraryElementsService, LibraryElement[]>({
    enabled: Boolean(brandId) && isListed,
    keepPreviousDataWithin: scopeKey,
    queryFn: async (service, signal) => {
      try {
        const page = await service.listPage(
          { kind: listedKinds, limit: ITEMS_PER_PAGE, q: search.trim() },
          signal,
        );
        return page.items;
      } catch (error) {
        if (!signal.aborted) {
          logger.error('Failed to load library elements', error);
        }
        throw error;
      }
    },
    queryKey: [...scopeKey, { kinds: listedKinds, search: search.trim() }],
    service: createElementsService,
  });

  const run = useCallback(
    async (
      work: (service: LibraryElementsService) => Promise<unknown>,
      failureKey: 'createFailed' | 'removeFailed' | 'updateFailed',
    ): Promise<boolean> => {
      if (isBusyRef.current) {
        return false;
      }
      isBusyRef.current = true;
      setIsBusy(true);
      try {
        await work(await getService());
        await queryClient.invalidateQueries({ queryKey: [ELEMENTS_QUERY_KEY] });
        return true;
      } catch (error: unknown) {
        logger.error('Failed to change a library element', error);
        notifications.error(translate(`errors.${failureKey}`));
        return false;
      } finally {
        isBusyRef.current = false;
        setIsBusy(false);
      }
    },
    [getService, notifications, queryClient, translate],
  );

  const create = useCallback(
    (input: CreateLibraryElementInput) =>
      run((service) => service.post(input), 'createFailed'),
    [run],
  );
  const update = useCallback(
    (id: string, input: UpdateLibraryElementInput) =>
      run((service) => service.patch(id, input), 'updateFailed'),
    [run],
  );
  const remove = useCallback(
    async (element: LibraryElement) => {
      const isRemoved = await run(
        (service) => service.removeElement(element.id),
        'removeFailed',
      );
      if (isRemoved) {
        notifications.success(translate('removed', { name: element.label }));
      }
    },
    [notifications, run, translate],
  );

  return {
    create,
    elements: isListed ? (query.data ?? EMPTY_ELEMENTS) : EMPTY_ELEMENTS,
    isBusy,
    isLoading: isListed && Boolean(brandId) && query.isPending,
    remove,
    update,
  };
}
