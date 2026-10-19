'use client';
import type {
  ITurboProject,
  IUpdateTurboProjectInput,
} from '@genfeedai/contracts/interfaces';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { onForeground } from '@hooks/utils/on-foreground/on-foreground';
import {
  isServiceOperationError,
  normalizeOperationError,
} from '@services/core/operation-error';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  createTurboProjectsApi,
  type TurboProjectsApi,
} from './turbo-projects-api';

const PERMANENT_WRITE_STATUSES = new Set([400, 403, 404, 409, 410, 413, 422]);

type ProjectWrite = (service: TurboProjectsApi) => Promise<ITurboProject>;
type PendingWrite = {
  operation: ProjectWrite;
  complete: (saved: boolean) => void;
  retryOnFailure: boolean;
  replaceKey?: string;
};

/** Each routed project owns its queue. Failed saves retain all subsequent edits. */
export function useTurboProject(id: string, brandId: string) {
  const getService = useAuthedService(createTurboProjectsApi);
  const [project, setProject] = useState<ITurboProject | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const scope = useMemo(
    () => ({
      id,
      brandId,
      getService,
      alive: true,
      version: 0,
      running: false,
      failed: false,
      pending: [] as PendingWrite[],
    }),
    [id, brandId, getService],
  );
  useEffect(() => {
    scope.alive = true;
    setProject(null);
    setError(null);
    setIsSaving(false);
    const controller = new AbortController();
    let polling = false;
    async function refresh() {
      if (polling || scope.pending.length || !brandId) return;
      polling = true;
      const revision = scope.version;
      try {
        const loaded = await (await getService()).get(id, controller.signal);
        if (loaded.brandId !== brandId)
          throw new Error('This project belongs to another brand.');
        if (
          scope.alive &&
          !controller.signal.aborted &&
          revision === scope.version
        ) {
          setProject(loaded);
          setError(null);
        }
      } catch (reason) {
        if (scope.alive && !controller.signal.aborted)
          setError(
            reason instanceof Error
              ? reason.message
              : 'Could not load project.',
          );
      } finally {
        polling = false;
      }
    }
    void refresh();
    // A hidden tab has no one watching the run; catch up on the way back.
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') void refresh();
    }, 2000);
    const disposeForeground = onForeground(() => void refresh());
    return () => {
      disposeForeground();
      scope.alive = false;
      for (const pending of scope.pending) pending.complete(false);
      controller.abort();
      clearInterval(timer);
    };
  }, [id, brandId, getService, scope]);

  const drain = useCallback(async () => {
    if (scope.running || scope.failed) return;
    scope.running = true;
    if (scope.alive) setIsSaving(true);
    try {
      while (scope.alive && scope.pending.length) {
        const next = scope.pending[0];
        try {
          const service = await getService();
          if (!scope.alive) break;
          const updated = await next.operation(service);
          scope.pending.shift();
          next.complete(true);
          if (scope.alive && !scope.pending.length) {
            setProject(updated);
            setError(null);
          }
        } catch (reason) {
          const failure = isServiceOperationError(reason)
            ? reason
            : normalizeOperationError('save Turbo project', reason);
          const permanent =
            failure.status !== undefined &&
            PERMANENT_WRITE_STATUSES.has(failure.status);
          scope.failed = next.retryOnFailure && !permanent;
          if (!scope.failed) scope.pending.shift();
          next.complete(false);
          if (scope.alive) setError(failure.message);
          if (scope.failed) break;
        }
      }
    } finally {
      scope.running = false;
      if (scope.alive) setIsSaving(false);
    }
  }, [getService, scope]);
  const write = useCallback(
    (
      operation: ProjectWrite,
      optimistic?: (current: ITurboProject) => ITurboProject,
      retryOnFailure = false,
      replaceKey?: string,
    ): Promise<boolean> => {
      if (!scope.alive) return Promise.resolve(false);
      scope.version += 1;
      if (scope.alive && optimistic)
        setProject((current) => (current ? optimistic(current) : current));
      const saved = new Promise<boolean>((complete) => {
        const replacement =
          scope.failed && replaceKey
            ? scope.pending.findIndex(
                (entry) => entry.replaceKey === replaceKey,
              )
            : -1;
        const next = { operation, complete, retryOnFailure, replaceKey };
        if (replacement >= 0) {
          scope.pending[replacement].complete(false);
          scope.pending[replacement] = next;
          if (replacement === 0) scope.failed = false;
        } else scope.pending.push(next);
      });
      void drain();
      return saved;
    },
    [scope, drain],
  );
  const update = useCallback(
    (input: IUpdateTurboProjectInput) =>
      write(
        (service) => service.update(id, input),
        (current) => ({
          ...current,
          ...input,
          quote: null,
          settings: { ...current.settings, ...input.settings },
        }),
        true,
        `update:${Object.keys(input).sort().join(',')}:${Object.keys(
          input.settings ?? {},
        )
          .sort()
          .join(',')}`,
      ),
    [id, write],
  );
  const retrySave = useCallback(() => {
    scope.failed = false;
    return drain();
  }, [scope, drain]);
  return {
    project,
    error,
    isSaving,
    write,
    update,
    retrySave,
    hasUnsavedChanges: scope.failed,
  };
}
