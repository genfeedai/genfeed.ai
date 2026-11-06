import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { RssSourcesController } from '@api/collections/rss-sources/controllers/rss-sources.controller';
import type { CreateRssSourceDto } from '@api/collections/rss-sources/dto/create-rss-source.dto';
import type { RssSourcesQueryDto } from '@api/collections/rss-sources/dto/rss-sources-query.dto';
import type { UpdateRssSourceDto } from '@api/collections/rss-sources/dto/update-rss-source.dto';
import type { RssSourceScope } from '@api/collections/rss-sources/schemas/rss-source.schema';
import type { RssSourceWorkflowService } from '@api/collections/rss-sources/services/rss-source-workflow.service';
import type { RssSourcesService } from '@api/collections/rss-sources/services/rss-sources.service';
import type { OrganizationModuleAccessService } from '@api/common/organization-modules/organization-module-access.service';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { API_KEY_SCOPES_KEY } from '@api/helpers/guards/api-key/api-key.guard';
import { ApiKeyScope } from '@genfeedai/contracts';
import { ForbiddenException } from '@nestjs/common';
import type { Request } from 'express';

vi.mock('@api/helpers/utils/response/response.util', () => ({
  serializeCollection: (
    _request: unknown,
    _serializer: unknown,
    data: unknown,
  ) => ({
    data,
  }),
  serializeSingle: (
    _request: unknown,
    _serializer: unknown,
    data: unknown,
  ) => ({
    data,
  }),
}));

interface StoredRssSource extends RssSourceScope {
  feedUrl: string;
  id: string;
  label: string;
}

describe('RssSourcesController', () => {
  const request = {} as Request;
  const user = {
    brandId: 'brand-1',
    id: 'user-1',
    isSuperAdmin: false,
    organizationId: 'org-1',
    userId: 'user-1',
  } as unknown as User;
  const query = { brandId: 'brand-1' } as RssSourcesQueryDto;
  const body = {
    feedUrl: 'https://example.com/feed.xml',
    label: 'Industry feed',
    targetChannels: [{ credentialId: 'cred_x', platform: 'twitter' }],
  } as unknown as CreateRssSourceDto;

  let sources: StoredRssSource[];
  let queuedPolls: Array<Record<string, unknown>>;
  let publishingOrganizations: Set<string>;
  let controller: RssSourcesController;

  beforeEach(() => {
    sources = [];
    queuedPolls = [];
    publishingOrganizations = new Set(['org-1']);

    const inScope = (id: string, scope: RssSourceScope) => {
      const found = sources.find(
        (source) =>
          source.id === id &&
          source.organizationId === scope.organizationId &&
          source.brandId === scope.brandId,
      );
      if (!found) {
        throw new NotFoundException('RSS source', id);
      }
      return found;
    };
    const service = {
      createScoped: async (
        input: { feedUrl: string; label: string },
        scope: RssSourceScope,
      ) => {
        const created = {
          feedUrl: input.feedUrl,
          label: input.label,
          ...scope,
          id: `rss-${sources.length + 1}`,
        };
        sources.push(created);
        return created;
      },
      findAllScoped: async (scope: RssSourceScope) =>
        sources.filter(
          (source) => source.organizationId === scope.organizationId,
        ),
      findOneScoped: async (id: string, scope: RssSourceScope) =>
        inScope(id, scope),
      removeScoped: async (id: string, scope: RssSourceScope) => {
        const target = inScope(id, scope);
        sources = sources.filter((source) => source !== target);
      },
      updateScoped: async (
        id: string,
        input: { label?: string },
        scope: RssSourceScope,
      ) => Object.assign(inScope(id, scope), input),
    };
    const workflow = {
      enqueueSource: async (input: Record<string, unknown>) => {
        queuedPolls.push(input);
        return `job-${queuedPolls.length}`;
      },
    };
    const moduleAccess = {
      assertAccess: async (organizationId: string, module: string) => {
        if (
          module !== 'publishing' ||
          !publishingOrganizations.has(organizationId)
        ) {
          throw new ForbiddenException('Publishing is not enabled');
        }
      },
    };

    controller = new RssSourcesController(
      service as unknown as RssSourcesService,
      workflow as unknown as RssSourceWorkflowService,
      moduleAccess as unknown as OrganizationModuleAccessService,
    );
  });

  it('stamps the caller tenant scope onto a created source', async () => {
    await expect(controller.create(request, user, body)).resolves.toEqual({
      data: {
        brandId: 'brand-1',
        feedUrl: 'https://example.com/feed.xml',
        id: 'rss-1',
        label: 'Industry feed',
        organizationId: 'org-1',
        userId: 'user-1',
      },
    });
  });

  it('reads, updates, polls and removes a source inside the tenant scope', async () => {
    await controller.create(request, user, body);

    await expect(
      controller.findOne(request, user, query, 'rss-1'),
    ).resolves.toMatchObject({ data: { id: 'rss-1' } });
    await expect(
      controller.update(request, user, query, 'rss-1', {
        label: 'Updated',
      } as UpdateRssSourceDto),
    ).resolves.toMatchObject({ data: { label: 'Updated' } });
    // Manual poll no longer runs inline — it queues the RSS source workflow.
    await expect(controller.poll(user, query, 'rss-1')).resolves.toEqual({
      jobId: 'job-1',
      status: 'queued',
    });
    await expect(controller.remove(user, query, 'rss-1')).resolves.toEqual({
      success: true,
    });

    expect(queuedPolls).toEqual([
      {
        brandId: 'brand-1',
        organizationId: 'org-1',
        sourceId: 'rss-1',
        userId: 'user-1',
      },
    ]);
    expect(sources).toEqual([]);
  });

  it('does not queue a poll for a source outside the tenant scope', async () => {
    await expect(
      controller.poll(user, query, 'rss-unknown'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(queuedPolls).toEqual([]);
  });

  it('rejects a cross-tenant organization override before mutation', async () => {
    await controller.create(request, user, body);

    await expect(
      controller.update(
        request,
        user,
        { organizationId: 'org-2' } as RssSourcesQueryDto,
        'rss-1',
        { label: 'Hijacked' } as UpdateRssSourceDto,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(sources[0]?.label).toBe('Industry feed');
  });

  it('refuses writes when the organization has no publishing grant', async () => {
    publishingOrganizations.clear();

    await expect(controller.create(request, user, body)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(sources).toEqual([]);
  });

  it.each([
    ['create', RssSourcesController.prototype.create],
    ['update', RssSourcesController.prototype.update],
    ['remove', RssSourcesController.prototype.remove],
    ['poll', RssSourcesController.prototype.poll],
  ])('declares posting write scopes on %s', (_label, handler) => {
    expect(Reflect.getMetadata(API_KEY_SCOPES_KEY, handler)).toEqual([
      ApiKeyScope.POSTS_DRAFT,
      ApiKeyScope.POSTS_SCHEDULE,
    ]);
  });
});
