'use client';
import type {
  IVisualProject,
  VisualCodeQuoteRequest,
} from '@genfeedai/contracts/interfaces';
import { useAuthIdentity } from '@hooks/auth/use-auth-identity/use-auth-identity';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import type { UseVisualProjectsOptions } from '@props/studio/visual-code.props';
import { IngredientsService } from '@services/content/ingredients.service';
import { VisualProjectsService } from '@services/content/visual-projects.service';
import {
  useInfiniteQuery,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { useCallback, useEffect, useRef } from 'react';

export function useVisualProjects({
  brandId,
  projectId,
}: UseVisualProjectsOptions) {
  const { isSignedIn, orgId, userId, sessionId } = useAuthIdentity();
  const getService = useAuthedService((token: string) =>
    VisualProjectsService.getInstance(token),
  );
  const getIngredients = useAuthedService((token: string) =>
    IngredientsService.getInstance(token),
  );
  const identityScope = JSON.stringify([
    isSignedIn,
    orgId,
    userId,
    sessionId,
    brandId,
  ]);
  const scope = useRef({ identity: identityScope, generation: 0 });
  if (scope.current.identity !== identityScope)
    scope.current = {
      identity: identityScope,
      generation: scope.current.generation + 1,
    };
  const generation = scope.current.generation;
  const isMounted = useRef(true);
  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);
  const assertScope = useCallback(() => {
    if (!isMounted.current || scope.current.generation !== generation)
      throw new Error('visual_scope_changed');
  }, [generation]);
  const client = useQueryClient();
  const enabled = Boolean(isSignedIn && brandId);
  const library = useQuery({
    queryKey: ['visual-code', orgId, userId, sessionId, brandId, 'library'],
    enabled,
    queryFn: async ({ signal }) =>
      (await getIngredients()).findAll(
        { brand: brandId, limit: 50, sort: '-createdAt' },
        signal,
      ),
  });
  const catalog = useQuery({
    queryKey: ['visual-code', orgId, userId, sessionId, brandId, 'catalog'],
    enabled,
    queryFn: async ({ signal }) =>
      (await getService()).catalog(brandId ?? '', signal),
  });
  const projects = useInfiniteQuery({
    queryKey: ['visual-code', orgId, userId, sessionId, brandId, 'projects'],
    enabled,
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ signal, pageParam }) =>
      (await getService()).list(brandId ?? '', pageParam, signal),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
  const project = useQuery({
    queryKey: [
      'visual-code',
      orgId,
      userId,
      sessionId,
      brandId,
      'project',
      projectId,
    ],
    enabled: enabled && Boolean(projectId),
    queryFn: async ({ signal }) =>
      (await getService()).get(projectId ?? '', undefined, signal),
    refetchInterval: (query) => {
      const status = query.state.data?.revisions[0]?.status;
      return status && !['completed', 'failed', 'cancelled'].includes(status)
        ? 2000
        : false;
    },
  });
  const quote = useCallback(
    async (input: VisualCodeQuoteRequest) => {
      assertScope();
      const service = await getService();
      assertScope();
      return service.quote(input);
    },
    [getService, assertScope],
  );
  const submit = useCallback(
    async (
      input: VisualCodeQuoteRequest,
      maximumCredits: number,
    ): Promise<IVisualProject> => {
      assertScope();
      try {
        const service = await getService();
        assertScope();
        const result =
          input.operation === 'create'
            ? await service.create({ ...input.input, maximumCredits })
            : input.operation === 'revise'
              ? await service.revise(input.projectId, {
                  ...input.input,
                  maximumCredits,
                })
              : input.operation === 'export'
                ? await service.export(input.projectId, {
                    ...input.input,
                    maximumCredits,
                  })
                : await service.retry(input.projectId, {
                    ...input.input,
                    maximumCredits,
                  });
        if (isMounted.current && scope.current.generation === generation)
          client.setQueryData(
            [
              'visual-code',
              orgId,
              userId,
              sessionId,
              brandId,
              'project',
              result.id,
            ],
            result,
          );
        return result;
      } finally {
        await client.invalidateQueries({
          queryKey: [
            'visual-code',
            orgId,
            userId,
            sessionId,
            brandId,
            'projects',
          ],
        });
      }
    },
    [
      getService,
      client,
      orgId,
      userId,
      sessionId,
      brandId,
      assertScope,
      generation,
    ],
  );
  const cancel = useCallback(async () => {
    assertScope();
    if (!project.data) return;
    const service = await getService();
    assertScope();
    const result = await service.cancel(project.data.id, {
      revision: project.data.currentRevision,
    });
    if (isMounted.current && scope.current.generation === generation)
      client.setQueryData(
        [
          'visual-code',
          orgId,
          userId,
          sessionId,
          brandId,
          'project',
          result.id,
        ],
        result,
      );
  }, [
    getService,
    client,
    orgId,
    userId,
    sessionId,
    brandId,
    project.data,
    assertScope,
    generation,
  ]);
  const history = useCallback(
    async (beforeRevision: number) => {
      if (!projectId) throw new Error('Select a project.');
      return (await getService()).get(projectId, beforeRevision);
    },
    [getService, projectId],
  );
  const source = useCallback(
    async (revision: number) => {
      if (!projectId) throw new Error('Select a project.');
      return (await getService()).source(projectId, revision);
    },
    [getService, projectId],
  );
  return {
    library,
    catalog,
    projects,
    project,
    quote,
    submit,
    cancel,
    history,
    source,
  };
}
