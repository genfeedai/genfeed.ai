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
import { useCallback } from 'react';

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
    async (input: VisualCodeQuoteRequest) => (await getService()).quote(input),
    [getService],
  );
  const submit = useCallback(
    async (
      input: VisualCodeQuoteRequest,
      maximumCredits: number,
    ): Promise<IVisualProject> => {
      const service = await getService();
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
      return result;
    },
    [getService, client, orgId, userId, sessionId, brandId],
  );
  const cancel = useCallback(async () => {
    if (!project.data) return;
    const result = await (await getService()).cancel(project.data.id, {
      revision: project.data.currentRevision,
    });
    client.setQueryData(
      ['visual-code', orgId, userId, sessionId, brandId, 'project', result.id],
      result,
    );
  }, [getService, client, orgId, userId, sessionId, brandId, project.data]);
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
