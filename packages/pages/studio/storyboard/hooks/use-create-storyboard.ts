'use client';

import { useBrand } from '@contexts/user/brand-context/brand-context';
import { getSession } from '@genfeedai/auth-client';
import {
  type CreateStoryboardRun,
  createStoryboardRunSchema,
} from '@genfeedai/contracts/api-types/contracts/storyboard-run.contract';
import type { StoryboardCreationIntent } from '@genfeedai/props/studio/storyboard.props';
import { useAuthIdentity } from '@hooks/auth/use-auth-identity/use-auth-identity';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { ContentRunsService } from '@services/content/content-runs.service';
import { EnvironmentService } from '@services/core/environment.service';
import {
  getJsonApiErrorMember,
  getJsonApiErrorMessage,
} from '@services/core/json-api-error-message';
import { normalizeOperationError } from '@services/core/operation-error';
import { useEffect, useRef, useState } from 'react';

const intents = new Map<string, StoryboardCreationIntent>();
const definitiveStatuses = new Set([400, 401, 403, 404, 409, 410, 422]);
const inputSchema = createStoryboardRunSchema.omit({ clientRequestId: true });

/** Only an uncertain replay of the same scoped input keeps its UUID. */
export function useCreateStoryboard() {
  const { brandId, organizationId } = useBrand();
  const { userId, sessionId } = useAuthIdentity();
  const getService = useAuthedService((token: string) =>
    ContentRunsService.getInstance(token),
  );
  const scope = JSON.stringify([
    EnvironmentService.apiEndpoint,
    globalThis.__GENFEED_DESKTOP_ENV__?.authEndpoint,
    userId,
    organizationId,
    brandId,
  ]);
  const epochKey = JSON.stringify([scope, sessionId]);
  const owner = useRef(Symbol('Storyboard creation'));
  const active = useRef({ key: epochKey, epoch: 0, mounted: true });
  if (active.current.key !== epochKey)
    active.current = {
      key: epochKey,
      epoch: active.current.epoch + 1,
      mounted: active.current.mounted,
    };
  const activeIntent = useRef<string | undefined>(undefined);
  const completed = useRef(
    new Map<string, { scope: string; epoch: number; intentKey: string }>(),
  );
  const [state, setState] = useState<{
    scope: string;
    intentKey?: string;
    isCreating: boolean;
    error: string | null;
  }>({ scope, isCreating: false, error: null });
  useEffect(() => {
    active.current.mounted = true;
    return () => {
      active.current.mounted = false;
      active.current.epoch += 1;
    };
  }, []);
  function create(
    input: Omit<CreateStoryboardRun, 'clientRequestId'>,
  ): Promise<string> {
    if (!active.current.mounted)
      return Promise.reject(
        new Error('Storyboard creation is no longer active.'),
      );
    if (!brandId || !organizationId || !userId)
      return Promise.reject(
        new Error('Choose a signed-in organization and brand.'),
      );
    const parsed = inputSchema.safeParse(input);
    if (!parsed.success) return Promise.reject(parsed.error);
    const canonical = parsed.data;
    const key = JSON.stringify([scope, 'create-storyboard', canonical]);
    const epoch = active.current.epoch;
    activeIntent.current = key;
    const isCurrent = () =>
      JSON.stringify([
        EnvironmentService.apiEndpoint,
        globalThis.__GENFEED_DESKTOP_ENV__?.authEndpoint,
        userId,
        organizationId,
        brandId,
      ]) === scope &&
      active.current.mounted &&
      active.current.key === epochKey &&
      active.current.epoch === epoch &&
      activeIntent.current === key;
    const identityCurrent = async () => {
      const session = await getSession();
      const currentOrg = session.data?.session.activeOrganizationId;
      return (
        !session.error &&
        session.data?.user.id === userId &&
        (!currentOrg || currentOrg === organizationId)
      );
    };
    const previous = intents.get(key);
    if (
      previous?.pending &&
      previous.owner === owner.current &&
      previous.epoch === epoch
    )
      return previous.pending;
    const intent: StoryboardCreationIntent = {
      clientRequestId: previous?.clientRequestId ?? crypto.randomUUID(),
      owner: owner.current,
      epoch,
      uncertain: Boolean(previous?.uncertain || previous?.pending),
    };
    intents.set(key, intent);
    setState({ scope, intentKey: key, isCreating: true, error: null });
    let dispatched = false;
    let acknowledged = false;
    const retire = () => {
      if (intents.get(key) === intent) intents.delete(key);
    };
    const task = Promise.resolve().then(async () => {
      try {
        if (!isCurrent() || !(await identityCurrent()) || !isCurrent())
          throw new Error('Storyboard scope changed.');
        const service = await getService();
        if (!isCurrent() || !(await identityCurrent()) || !isCurrent())
          throw new Error('Storyboard scope changed.');
        dispatched = true;
        const run = await service.createStoryboardRun(brandId, {
          ...canonical,
          clientRequestId: intent.clientRequestId,
        });
        if (run.brandId !== brandId || run.organizationId !== organizationId)
          throw new Error('Storyboard scope changed.');
        acknowledged = true;
        retire();
        if (!isCurrent() || !(await identityCurrent()) || !isCurrent())
          throw new Error('Storyboard scope changed.');
        completed.current.set(run.id, { scope, epoch, intentKey: key });
        return run.id;
      } catch (error) {
        const definitive = definitiveStatuses.has(
          getJsonApiErrorMember(error)?.status ??
            normalizeOperationError('create-storyboard', error).status ??
            0,
        );
        if (
          acknowledged ||
          (dispatched && definitive) ||
          (!dispatched && !intent.uncertain)
        )
          retire();
        else if (dispatched) intent.uncertain = true;
        if (isCurrent())
          setState({
            scope,
            intentKey: key,
            isCreating: false,
            error: getJsonApiErrorMessage(
              error,
              'Could not create storyboard. Your source is kept. Retry to continue.',
            ),
          });
        throw error;
      } finally {
        if (intents.get(key) === intent) intent.pending = undefined;
        if (isCurrent())
          setState((current) =>
            current.scope === scope && current.intentKey === key
              ? { ...current, isCreating: false }
              : current,
          );
      }
    });
    intent.pending = task;
    return task;
  }
  return {
    create,
    isCurrentResult: (id: string) => {
      const result = completed.current.get(id);
      return (
        JSON.stringify([
          EnvironmentService.apiEndpoint,
          globalThis.__GENFEED_DESKTOP_ENV__?.authEndpoint,
          userId,
          organizationId,
          brandId,
        ]) === scope &&
        active.current.mounted &&
        result?.scope === scope &&
        result.epoch === active.current.epoch &&
        result.intentKey === activeIntent.current &&
        active.current.key === epochKey
      );
    },
    isCreating: state.scope === scope && state.isCreating,
    error: state.scope === scope ? state.error : null,
  };
}
