'use client';

import {
  isCoreAppId,
  isNativeSecondaryAppId,
  isRailAppId,
  normalizeHiddenAppIds,
  normalizeRailAppOrder,
} from '@genfeedai/contracts/constants';
import type { ISetting } from '@genfeedai/contracts/interfaces';
import { useAuthedQuery } from '@hooks/auth/use-authed-query/use-authed-query';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import type { UsersService } from '@services/organization/users.service';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  createUsersService,
  ME_SETTINGS_QUERY_KEY,
  writeMeSettings,
} from '@/components/shell/me-settings-query';

interface RailPreferenceValues {
  hiddenAppIds: string[];
  homeAppId: string | null;
  pinnedAppIds: string[];
  railAppOrder: string[];
}

type RailPreferenceField = keyof RailPreferenceValues;

type RailPreferenceUpdate<Field extends RailPreferenceField> = (
  value: RailPreferenceValues[Field],
) => RailPreferenceValues[Field];

type RailPreferenceEdit = <Field extends RailPreferenceField>(
  field: Field,
  update: RailPreferenceUpdate<Field>,
) => void;

type RailPreferenceSync = (
  saved: RailPreferenceValues | null,
  hasReadFailed: boolean,
) => void;

const FIELDS: readonly RailPreferenceField[] = [
  'hiddenAppIds',
  'pinnedAppIds',
  'railAppOrder',
  'homeAppId',
];

const NORMALIZERS: {
  [Field in RailPreferenceField]: (
    value: unknown,
  ) => RailPreferenceValues[Field];
} = {
  hiddenAppIds: (value) =>
    normalizeHiddenAppIds(Array.isArray(value) ? value : []),
  homeAppId: (value) => (isRailAppId(value) ? value : null),
  pinnedAppIds: (value) => [
    ...new Set(
      (Array.isArray(value) ? value : []).filter(isNativeSecondaryAppId),
    ),
  ],
  railAppOrder: (value) =>
    normalizeRailAppOrder(Array.isArray(value) ? value : []),
};

const EMPTY_VALUES: RailPreferenceValues = {
  hiddenAppIds: [],
  homeAppId: null,
  pinnedAppIds: [],
  railAppOrder: [],
};

function emptyValues(): RailPreferenceValues {
  return { ...EMPTY_VALUES };
}

function toRailValues(settings: ISetting): RailPreferenceValues {
  return {
    hiddenAppIds: NORMALIZERS.hiddenAppIds(settings.hiddenAppIds),
    homeAppId: NORMALIZERS.homeAppId(settings.homeAppId),
    pinnedAppIds: NORMALIZERS.pinnedAppIds(settings.pinnedAppIds),
    railAppOrder: NORMALIZERS.railAppOrder(settings.railAppOrder),
  };
}

/** Normalized values are strings, null or arrays of strings. */
function isSameValue(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function withField<Field extends RailPreferenceField>(
  values: RailPreferenceValues,
  field: Field,
  value: RailPreferenceValues[Field],
): RailPreferenceValues {
  // The union of field types cannot be narrowed through a computed key.
  return Object.assign({ ...values }, { [field]: value });
}

function toggledIds(ids: readonly string[], appId: string): string[] {
  return ids.includes(appId)
    ? ids.filter((id) => id !== appId)
    : [...ids, appId];
}

/**
 * The signed-in user's rail preferences: which secondary apps are pinned, which
 * core apps are hidden, the order of the rail, and the home app. They live on
 * their settings row, which is cached under `ME_SETTINGS_QUERY_KEY`, so the
 * rail paints the saved preferences at once on return. `isLoaded` turns true
 * once the read settles, failed or not, so callers can wait for saved
 * preferences before acting on defaults. `onSaveError` fires when a save
 * fails, so the caller can tell the member. A saved change is written into the
 * cache, and a later read never replaces an edit that is still being saved.
 */
export function useRailPreferences({
  onSaveError,
}: {
  onSaveError?: (field: RailPreferenceField) => void;
} = {}) {
  const onSaveErrorRef = useRef(onSaveError);
  onSaveErrorRef.current = onSaveError;
  const queryClient = useQueryClient();
  const getUsers = useAuthedService(createUsersService);
  const settingsQuery = useAuthedQuery<UsersService, ISetting>({
    queryFn: (users, signal) => users.findMeSettings(signal),
    queryKey: ME_SETTINGS_QUERY_KEY,
    service: createUsersService,
  });
  const saved = useMemo(
    () => (settingsQuery.data ? toRailValues(settingsQuery.data) : null),
    [settingsQuery.data],
  );
  const hasReadFailed = !saved && settingsQuery.isError;
  const syncInputRef = useRef({ hasReadFailed, saved });
  syncInputRef.current = { hasReadFailed, saved };

  // Local values take over once an edit has been made or the saved
  // preferences have been merged; until then the cached preferences show.
  const [published, setPublished] = useState<RailPreferenceValues | null>(null);
  const editRef = useRef<RailPreferenceEdit>(() => {});
  const syncRef = useRef<RailPreferenceSync>(() => {});

  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;
    let desired = emptyValues();
    let confirmed = emptyValues();
    const revision: Record<RailPreferenceField, number> = {
      hiddenAppIds: 0,
      homeAppId: 0,
      pinnedAppIds: 0,
      railAppOrder: 0,
    };
    const dirty = new Set<RailPreferenceField>();
    let isReady = false;
    let hasFailed = false;
    let isSaving = false;
    let queuedEdits: Array<(next: RailPreferenceValues) => void> = [];
    setPublished(null);

    const publish = () => setPublished({ ...desired });

    // One write at a time prevents the server from storing out-of-order values.
    // Responses from earlier revisions never replace a newer optimistic edit.
    const save = async () => {
      if (!isReady || isSaving || signal.aborted) return;
      isSaving = true;
      try {
        while (!signal.aborted) {
          const field = FIELDS.find((candidate) => dirty.has(candidate));
          if (!field) return;
          const submittedRevision = revision[field];
          const next = desired[field];
          try {
            const users = await getUsers();
            if (signal.aborted) return;
            const response = await users.patchMeSettings({ [field]: next });
            if (signal.aborted) return;
            confirmed = withField(
              confirmed,
              field,
              NORMALIZERS[field](response[field]),
            );
            if (submittedRevision === revision[field]) {
              desired = withField(desired, field, confirmed[field]);
              dirty.delete(field);
              publish();
            }
            await writeMeSettings(queryClient, { [field]: response[field] });
          } catch {
            if (signal.aborted) return;
            if (submittedRevision === revision[field]) {
              // A failed order stays on screen; the next change sends the whole
              // order again. Pins, hidden apps and the home app return to the
              // saved value.
              if (field !== 'railAppOrder') {
                desired = withField(desired, field, confirmed[field]);
              }
              dirty.delete(field);
              publish();
            }
            onSaveErrorRef.current?.(field);
          }
        }
      } finally {
        isSaving = false;
      }
    };

    const edit: RailPreferenceEdit = (field, update) => {
      if (signal.aborted || hasFailed) return;
      const apply = (target: RailPreferenceValues) => {
        Object.assign(target, {
          [field]: NORMALIZERS[field](update(target[field])),
        });
      };
      revision[field] += 1;
      if (!isReady) queuedEdits.push(apply);
      desired = { ...desired };
      apply(desired);
      dirty.add(field);
      publish();
      void save();
    };

    // Merges the saved preferences: the first time it rebases edits made
    // during the read; after that a field the server changed replaces the
    // local value unless an edit of it is still being saved.
    const sync: RailPreferenceSync = (savedValues, hasReadFailedNow) => {
      if (signal.aborted) return;
      if (!savedValues) {
        if (hasReadFailedNow && !isReady) {
          // Do not replace unknown saved preferences after a failed read.
          hasFailed = true;
          queuedEdits = [];
          desired = emptyValues();
          setPublished(null);
        }
        return;
      }
      if (!isReady) {
        confirmed = { ...savedValues };
        desired = { ...savedValues };
        for (const apply of queuedEdits) apply(desired);
        const hadQueuedEdits = queuedEdits.length > 0;
        queuedEdits = [];
        isReady = true;
        hasFailed = false;
        publish();
        if (hadQueuedEdits) {
          for (const field of FIELDS) {
            if (revision[field] > 0) dirty.add(field);
          }
          void save();
        }
        return;
      }
      let hasChanged = false;
      for (const field of FIELDS) {
        if (isSameValue(savedValues[field], confirmed[field])) continue;
        confirmed = withField(confirmed, field, savedValues[field]);
        if (!dirty.has(field)) {
          desired = withField(desired, field, savedValues[field]);
          hasChanged = true;
        }
      }
      if (hasChanged) publish();
    };

    editRef.current = edit;
    syncRef.current = sync;
    sync(syncInputRef.current.saved, syncInputRef.current.hasReadFailed);

    return () => {
      controller.abort();
      if (editRef.current === edit) editRef.current = () => {};
      if (syncRef.current === sync) syncRef.current = () => {};
    };
  }, [getUsers, queryClient]);

  useEffect(() => {
    syncRef.current(saved, hasReadFailed);
  }, [hasReadFailed, saved]);

  // A secondary app is pinned by listing it; a core app is always on the rail
  // until it is listed as hidden, so pinning it back removes that entry.
  const togglePin = useCallback((appId: string) => {
    if (isCoreAppId(appId)) {
      editRef.current('hiddenAppIds', (ids) => toggledIds(ids, appId));
    } else if (isNativeSecondaryAppId(appId)) {
      editRef.current('pinnedAppIds', (ids) => toggledIds(ids, appId));
    }
  }, []);

  const setRailAppOrder = useCallback((order: readonly string[]) => {
    editRef.current('railAppOrder', () => [...order]);
  }, []);

  const resetRail = useCallback(() => {
    editRef.current('railAppOrder', () => []);
    editRef.current('hiddenAppIds', () => []);
  }, []);

  const setHomeAppId = useCallback((appId: string | null) => {
    editRef.current('homeAppId', () => appId);
  }, []);

  const values = published ?? saved ?? EMPTY_VALUES;
  const isLoaded = saved !== null || hasReadFailed;

  return useMemo(
    () => ({
      hiddenAppIds: values.hiddenAppIds,
      homeAppId: values.homeAppId,
      isLoaded,
      pinnedAppIds: values.pinnedAppIds,
      railAppOrder: values.railAppOrder,
      resetRail,
      setHomeAppId,
      setRailAppOrder,
      togglePin,
    }),
    [isLoaded, resetRail, setHomeAppId, setRailAppOrder, togglePin, values],
  );
}
