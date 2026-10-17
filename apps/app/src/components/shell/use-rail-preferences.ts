'use client';

import {
  isNativeSecondaryAppId,
  isRailAppId,
  normalizeRailAppOrder,
} from '@genfeedai/contracts/constants';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { UsersService } from '@services/organization/users.service';
import { useCallback, useEffect, useRef, useState } from 'react';

interface RailPreferenceValues {
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

const FIELDS: readonly RailPreferenceField[] = [
  'pinnedAppIds',
  'railAppOrder',
  'homeAppId',
];

const NORMALIZERS: {
  [Field in RailPreferenceField]: (
    value: unknown,
  ) => RailPreferenceValues[Field];
} = {
  homeAppId: (value) => (isRailAppId(value) ? value : null),
  pinnedAppIds: (value) => [
    ...new Set(
      (Array.isArray(value) ? value : []).filter(isNativeSecondaryAppId),
    ),
  ],
  railAppOrder: (value) =>
    normalizeRailAppOrder(Array.isArray(value) ? value : []),
};

function emptyValues(): RailPreferenceValues {
  return { homeAppId: null, pinnedAppIds: [], railAppOrder: [] };
}

function toggledIds(ids: readonly string[], appId: string): string[] {
  return ids.includes(appId)
    ? ids.filter((id) => id !== appId)
    : [...ids, appId];
}

/**
 * The signed-in user's rail preferences: which secondary apps are pinned, the
 * order of the rail, and the home app. They live on their settings row and
 * share one read. `isLoaded` turns true once the read settles, failed or not,
 * so callers can wait for saved preferences before acting on defaults.
 * `onSaveError` fires when a save fails, so the caller can tell the member.
 */
export function useRailPreferences({
  onSaveError,
}: {
  onSaveError?: (field: RailPreferenceField) => void;
} = {}) {
  const onSaveErrorRef = useRef(onSaveError);
  onSaveErrorRef.current = onSaveError;
  const getUsers = useAuthedService((token) => UsersService.getInstance(token));
  const [values, setValues] = useState<RailPreferenceValues>(emptyValues);
  const [isLoaded, setIsLoaded] = useState(false);
  const editRef = useRef<RailPreferenceEdit>(() => {});

  useEffect(() => {
    const controller = new AbortController();
    let desired = emptyValues();
    let confirmed = emptyValues();
    const revision: Record<RailPreferenceField, number> = {
      homeAppId: 0,
      pinnedAppIds: 0,
      railAppOrder: 0,
    };
    const dirty = new Set<RailPreferenceField>();
    let isReady = false;
    let isSaving = false;
    const queuedEdits: Array<(next: RailPreferenceValues) => void> = [];
    setValues(emptyValues());
    setIsLoaded(false);

    const publish = () => setValues({ ...desired });

    // One write at a time prevents the server from storing out-of-order values.
    // Responses from earlier revisions never replace a newer optimistic edit.
    const save = async () => {
      if (!isReady || isSaving || controller.signal.aborted) return;
      isSaving = true;
      try {
        while (!controller.signal.aborted) {
          const field = FIELDS.find((candidate) => dirty.has(candidate));
          if (!field) return;
          const submittedRevision = revision[field];
          const next = desired[field];
          try {
            const users = await getUsers();
            if (controller.signal.aborted) return;
            const saved = await users.patchMeSettings({ [field]: next });
            if (controller.signal.aborted) return;
            confirmed = {
              ...confirmed,
              [field]: NORMALIZERS[field](saved[field]),
            };
            if (submittedRevision === revision[field]) {
              desired = { ...desired, [field]: confirmed[field] };
              dirty.delete(field);
              publish();
            }
          } catch {
            if (controller.signal.aborted) return;
            if (submittedRevision === revision[field]) {
              // A failed order stays on screen; the next change sends the whole
              // order again. Pins and the home app return to the saved value.
              if (field !== 'railAppOrder') {
                desired = { ...desired, [field]: confirmed[field] };
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
      if (controller.signal.aborted) return;
      const apply = (target: RailPreferenceValues) => {
        // The union of field types cannot be narrowed through a computed key.
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
    editRef.current = edit;

    void (async () => {
      try {
        const users = await getUsers();
        if (controller.signal.aborted) return;
        const settings = await users.findMeSettings(controller.signal);
        if (controller.signal.aborted) return;
        confirmed = {
          homeAppId: NORMALIZERS.homeAppId(settings.homeAppId),
          pinnedAppIds: NORMALIZERS.pinnedAppIds(settings.pinnedAppIds),
          railAppOrder: NORMALIZERS.railAppOrder(settings.railAppOrder),
        };
        desired = { ...confirmed };
        for (const apply of queuedEdits) apply(desired);
        isReady = true;
        publish();
        setIsLoaded(true);
        if (queuedEdits.length > 0) {
          for (const field of FIELDS) {
            if (revision[field] > 0) dirty.add(field);
          }
          void save();
        }
      } catch {
        if (controller.signal.aborted) return;
        // Do not replace unknown saved preferences after a failed initial read.
        setValues(emptyValues());
        setIsLoaded(true);
        editRef.current = () => {};
      }
    })();

    return () => {
      controller.abort();
      if (editRef.current === edit) editRef.current = () => {};
    };
  }, [getUsers]);

  const togglePin = useCallback((appId: string) => {
    if (!isNativeSecondaryAppId(appId)) return;
    editRef.current('pinnedAppIds', (ids) => toggledIds(ids, appId));
  }, []);

  const setRailAppOrder = useCallback((order: readonly string[]) => {
    editRef.current('railAppOrder', () => [...order]);
  }, []);

  const setHomeAppId = useCallback((appId: string | null) => {
    editRef.current('homeAppId', () => appId);
  }, []);

  return {
    homeAppId: values.homeAppId,
    isLoaded,
    pinnedAppIds: values.pinnedAppIds,
    railAppOrder: values.railAppOrder,
    setHomeAppId,
    setRailAppOrder,
    togglePin,
  };
}
