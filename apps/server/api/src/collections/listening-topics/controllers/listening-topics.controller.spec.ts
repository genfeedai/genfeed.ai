import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { ListeningTopicsController } from '@api/collections/listening-topics/controllers/listening-topics.controller';
import type { AnalyzeListeningTopicDto } from '@api/collections/listening-topics/dto/analyze-listening-topic.dto';
import type { CreateListeningTopicDto } from '@api/collections/listening-topics/dto/create-listening-topic.dto';
import type {
  ListeningAnalysisQueryDto,
  ListeningEvidenceQueryDto,
  ListeningTopicsQueryDto,
} from '@api/collections/listening-topics/dto/listening-topics-query.dto';
import type { ListeningTopicAnalysisService } from '@api/collections/listening-topics/services/listening-topic-analysis.service';
import type { ListeningTopicAttributionService } from '@api/collections/listening-topics/services/listening-topic-attribution.service';
import type { ListeningTopicCollectorService } from '@api/collections/listening-topics/services/listening-topic-collector.service';
import type { ListeningTopicsService } from '@api/collections/listening-topics/services/listening-topics.service';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { BadRequestException } from '@nestjs/common';
import type { Request } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@api/helpers/utils/response/response.util', async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import('@api/helpers/utils/response/response.util')
    >();
  return {
    ...actual,
    serializeCollection: (
      _req: unknown,
      _serializer: unknown,
      data: unknown,
    ) => ({ data }),
    serializeSingle: (_req: unknown, _serializer: unknown, data: unknown) => ({
      data,
    }),
  };
});

interface Scope {
  brandId: string;
  organizationId: string;
  userId: string;
}

interface Theme {
  id: string;
  reviewState?: string;
  reviewedBy?: string;
}

interface Topic extends Scope {
  evidence: string[];
  id: string;
  isDeleted: boolean;
  keywords: string[];
  label: string;
  outcomes: { id: string; state: string }[];
  signals: string[];
  themes: Theme[];
}

const request = {} as Request;
const analysisQuery = {} as ListeningAnalysisQueryDto;
const evidenceQuery = {} as ListeningEvidenceQueryDto;
const listQuery = (query: object = {}) => query as ListeningTopicsQueryDto;
const member = {
  brandId: 'brand-1',
  id: 'user-1',
  organizationId: 'org-1',
  userId: 'user-1',
} as User;
const superAdmin = {
  brandId: 'brand-admin',
  id: 'admin-1',
  isSuperAdmin: true,
  organizationId: 'org-admin',
  userId: 'admin-1',
} as User;

describe('ListeningTopicsController', () => {
  let topics: Map<string, Topic>;
  let controller: ListeningTopicsController;

  const topic = (id: string, scope: Partial<Scope> = {}): Topic => ({
    brandId: 'brand-1',
    evidence: [],
    id,
    isDeleted: false,
    keywords: ['ai'],
    label: id,
    organizationId: 'org-1',
    outcomes: [{ id: 'post-1', state: 'measured' }],
    signals: ['signal-1'],
    themes: [{ id: 'theme-1' }],
    userId: 'user-1',
    ...scope,
  });

  beforeEach(() => {
    topics = new Map([
      ['topic-1', topic('topic-1')],
      ['topic-other-brand', topic('topic-other-brand', { brandId: 'brand-2' })],
      [
        'topic-other-org',
        topic('topic-other-org', { organizationId: 'org-2' }),
      ],
    ]);

    // Every scoped read and write resolves the topic inside the caller scope.
    const scoped = (id: string, scope: Scope) => {
      const row = topics.get(id);
      if (
        !row ||
        row.isDeleted ||
        row.organizationId !== scope.organizationId ||
        row.brandId !== scope.brandId
      ) {
        throw new NotFoundException('Listening topic', id);
      }
      return row;
    };
    const visible = (scope: Scope) =>
      [...topics.values()].filter(
        (row) =>
          !row.isDeleted &&
          row.organizationId === scope.organizationId &&
          row.brandId === scope.brandId,
      );

    const service = {
      createScoped: async (
        body: Pick<Topic, 'keywords' | 'label'>,
        scope: Scope,
      ) => {
        const created = {
          ...topic(`topic-${topics.size + 1}`, scope),
          ...body,
        };
        topics.set(created.id, created);
        return created;
      },
      findAllScoped: async (scope: Scope) => ({ docs: visible(scope) }),
      findOneScoped: async (id: string, scope: Scope) => scoped(id, scope),
      listEvidence: async (id: string, scope: Scope) => ({
        docs: scoped(id, scope).evidence,
      }),
      removeScoped: async (id: string, scope: Scope) =>
        Object.assign(scoped(id, scope), { isDeleted: true }),
      updateScoped: async (id: string, body: Partial<Topic>, scope: Scope) =>
        Object.assign(scoped(id, scope), body),
    } as unknown as ListeningTopicsService;
    const collector = {
      collectScoped: async (
        id: string,
        body: { limit: number },
        scope: Scope,
      ) => {
        const row = scoped(id, scope);
        row.evidence = Array.from(
          { length: body.limit },
          (_, index) => `evidence-${index + 1}`,
        );
        return row;
      },
    } as unknown as ListeningTopicCollectorService;
    const analysis = {
      analyzeScoped: async (id: string, _body: unknown, scope: Scope) => {
        const row = scoped(id, scope);
        return {
          analysisKey: `analysis-${id}`,
          signals: row.signals,
          status: 'sufficient',
          themes: row.themes,
        };
      },
      listSignalsScoped: async (id: string, scope: Scope) => ({
        docs: scoped(id, scope).signals,
      }),
      listThemesScoped: async (id: string, scope: Scope) => ({
        docs: scoped(id, scope).themes,
      }),
      reviewThemeScoped: async (
        topicId: string,
        themeId: string,
        body: { state: string },
        scope: Scope,
      ) => {
        const theme = scoped(topicId, scope).themes.find(
          (candidate) => candidate.id === themeId,
        );
        if (!theme) throw new NotFoundException('Listening theme', themeId);
        return Object.assign(theme, {
          reviewState: body.state,
          reviewedBy: scope.userId,
        });
      },
    } as unknown as ListeningTopicAnalysisService;
    const attribution = {
      listOutcomesScoped: async (
        topicId: string,
        _themeId: string,
        scope: Scope,
      ) => scoped(topicId, scope).outcomes,
    } as unknown as ListeningTopicAttributionService;

    controller = new ListeningTopicsController(
      service,
      collector,
      analysis,
      attribution,
    );
  });

  it('creates a topic in the session organization and brand', async () => {
    await expect(
      controller.create(request, member, {
        keywords: ['ai'],
        label: 'AI',
        sourceIds: [],
      } as CreateListeningTopicDto),
    ).resolves.toMatchObject({
      data: {
        brandId: 'brand-1',
        label: 'AI',
        organizationId: 'org-1',
        userId: 'user-1',
      },
    });
    expect(topics.size).toBe(4);
  });

  it.each([
    [
      'a member, ignoring a requested brand',
      member,
      { brandId: 'brand-2' },
      ['topic-1'],
    ],
    [
      'a superadmin who names a brand',
      superAdmin,
      { brandId: 'brand-2', organizationId: 'org-1' },
      ['topic-other-brand'],
    ],
  ])('lists topics for %s', async (_case, user, query, expected) => {
    const result = (await controller.findAll(
      request,
      user,
      listQuery(query),
    )) as unknown as {
      data: { docs: Topic[] };
    };

    expect(result.data.docs.map((row) => row.id)).toEqual(expected);
  });

  it('refuses a caller without a brand', async () => {
    await expect(
      controller.findAll(
        request,
        { ...member, brandId: undefined } as unknown as User,
        listQuery(),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it.each(['topic-other-brand', 'topic-other-org', 'topic-missing'])(
    'hides %s from a member',
    async (id) => {
      await expect(
        controller.findOne(request, member, {}, id),
      ).rejects.toBeInstanceOf(NotFoundException);
    },
  );

  it('collects evidence for a topic, then lists it', async () => {
    await controller.collect(request, member, {}, 'topic-1', { limit: 2 });

    await expect(
      controller.listEvidence(request, member, 'topic-1', evidenceQuery),
    ).resolves.toEqual({ data: { docs: ['evidence-1', 'evidence-2'] } });
  });

  it('refuses to collect for another brand topic', async () => {
    await expect(
      controller.collect(request, member, {}, 'topic-other-brand', {
        limit: 2,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(topics.get('topic-other-brand')?.evidence).toEqual([]);
  });

  it('returns an analysis summary with serialized themes and signals', async () => {
    await expect(
      controller.analyze(
        request,
        member,
        {},
        'topic-1',
        {} as AnalyzeListeningTopicDto,
      ),
    ).resolves.toEqual({
      analysisKey: 'analysis-topic-1',
      signals: { data: { docs: ['signal-1'] } },
      status: 'sufficient',
      themes: { data: { docs: [{ id: 'theme-1' }] } },
    });
  });

  it('records a theme review by the session user', async () => {
    await controller.reviewTheme(request, member, {}, 'topic-1', 'theme-1', {
      state: 'deferred',
    });

    await expect(
      controller.listThemes(request, member, 'topic-1', analysisQuery),
    ).resolves.toEqual({
      data: {
        docs: [
          { id: 'theme-1', reviewState: 'deferred', reviewedBy: 'user-1' },
        ],
      },
    });
  });

  it('lists theme outcomes and signals inside the caller scope', async () => {
    await expect(
      controller.listThemeOutcomes(request, member, {}, 'topic-1', 'theme-1'),
    ).resolves.toEqual({
      data: { docs: [{ id: 'post-1', state: 'measured' }] },
    });
    await expect(
      controller.listSignals(request, member, 'topic-1', analysisQuery),
    ).resolves.toEqual({ data: { docs: ['signal-1'] } });
  });

  it('renames and then removes a topic', async () => {
    await controller.update(request, member, {}, 'topic-1', {
      label: 'Renamed',
    });
    await controller.remove(request, member, {}, 'topic-1');

    expect(topics.get('topic-1')).toMatchObject({
      isDeleted: true,
      label: 'Renamed',
    });
    await expect(
      controller.findOne(request, member, {}, 'topic-1'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
