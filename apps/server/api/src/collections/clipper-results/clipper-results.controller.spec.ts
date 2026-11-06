import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { ClipperResultsController } from '@api/collections/clipper-results/clipper-results.controller';
import type { ClipperResultsService } from '@api/collections/clipper-results/clipper-results.service';
import type { CreateClipperResultDto } from '@api/collections/clipper-results/dto/create-clipper-result.dto';
import type { UpdateClipperResultDto } from '@api/collections/clipper-results/dto/update-clipper-result.dto';
import { runWithTenantReadScope } from '@api/helpers/interceptors/tenant-context/tenant-read-scope.context';
import type { LoggerService } from '@libs/logger/logger.service';
import { HttpStatus } from '@nestjs/common';
import type { Request } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Serialization is out of scope: hand back the rows the controller read.
vi.mock(
  '@api/helpers/utils/response/response.util',
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import('@api/helpers/utils/response/response.util')
    >()),
    serializeCollection: (
      _req: unknown,
      _serializer: unknown,
      page: { docs: unknown[] },
    ) => page.docs,
    serializeSingle: (_req: unknown, _serializer: unknown, data: unknown) =>
      data,
  }),
);

interface ClipResult {
  id: string;
  organizationId: string;
  projectId: string;
  status?: string;
  title: string;
  userId?: string;
}

const user = { organizationId: 'org-1', userId: 'user-1' } as User;
const req = { url: '/clipper-results' } as Request;

const notFound = (id: string) => ({
  response: {
    detail: `ClipperResultsController ${id} doesn't exist`,
    title: 'ClipperResultsController not found',
  },
  status: HttpStatus.NOT_FOUND,
});

describe('ClipperResultsController', () => {
  let controller: ClipperResultsController;
  let results: ClipResult[];

  const seed = (count: number, row: Omit<ClipResult, 'id' | 'title'>) => {
    for (let index = 0; index < count; index += 1) {
      const id = `${row.organizationId}-${row.projectId}-${index}`;
      results.push({ ...row, id, title: id });
    }
  };

  beforeEach(() => {
    results = [];
    const own = (id: string, organizationId: string) =>
      results.find(
        (row) => row.id === id && row.organizationId === organizationId,
      ) ?? null;

    const service = {
      createForOrganization: async (dto: Omit<ClipResult, 'id'>) => {
        const row = { ...dto, id: `clip-${results.length + 1}` };
        results.push(row);
        return row;
      },
      findByProject: async (
        projectId: string,
        organizationId: string,
        limit: number,
      ) =>
        results
          .filter(
            (row) =>
              row.projectId === projectId &&
              row.organizationId === organizationId,
          )
          .slice(0, limit),
      findOne: async (where: { id: string; organizationId: string }) =>
        own(where.id, where.organizationId),
      findOneSelect: async (where: { id: string; organizationId: string }) => {
        const row = own(where.id, where.organizationId);
        return row ? { id: row.id } : null;
      },
      findRecentByOrganization: async (organizationId: string, limit: number) =>
        results
          .filter((row) => row.organizationId === organizationId)
          .slice(0, limit),
      patch: async (id: string, dto: UpdateClipperResultDto) =>
        Object.assign(results.find((row) => row.id === id) ?? {}, dto),
    } as unknown as ClipperResultsService;

    controller = new ClipperResultsController(service, {} as LoggerService);
  });

  it('creates a clip result in the caller organization under the caller', async () => {
    const dto = {
      duration: 30,
      endTime: 45,
      index: 0,
      projectId: 'project-1',
      startTime: 15,
      title: 'Clip title',
    } as CreateClipperResultDto;

    await controller.create(req, dto, user);

    expect(results).toEqual([
      {
        ...dto,
        id: 'clip-1',
        organizationId: 'org-1',
        userId: 'user-1',
      },
    ]);
  });

  describe('findAll', () => {
    beforeEach(() => {
      seed(2, { organizationId: 'org-1', projectId: 'project-1' });
      seed(1, { organizationId: 'org-1', projectId: 'project-2' });
      seed(1, { organizationId: 'org-2', projectId: 'project-1' });
    });

    it.each([
      ['project', 'project-1', ''],
      ['filter[project]', '', 'project-1'],
    ])('lists one own project by %s', async (_param, project, filter) => {
      await expect(
        controller.findAll(req, project, filter, user),
      ).resolves.toEqual([
        expect.objectContaining({ id: 'org-1-project-1-0' }),
        expect.objectContaining({ id: 'org-1-project-1-1' }),
      ]);
    });

    it('lists every own clip without a project', async () => {
      const listed = await controller.findAll(req, '', '', user);

      expect(listed).toEqual([
        expect.objectContaining({ id: 'org-1-project-1-0' }),
        expect.objectContaining({ id: 'org-1-project-1-1' }),
        expect.objectContaining({ id: 'org-1-project-2-0' }),
      ]);
    });

    it('reads the selected organization scope', async () => {
      const listed = await runWithTenantReadScope(
        { isOrganizationOverride: true, organizationId: 'org-2' },
        () => controller.findAll(req, '', '', user),
      );

      expect(listed).toEqual([
        expect.objectContaining({ id: 'org-2-project-1-0' }),
      ]);
    });

    it.each([
      ['a project', 'project-3'],
      ['the organization', ''],
    ])('caps the list of %s at 100 clips', async (_case, project) => {
      seed(120, { organizationId: 'org-1', projectId: 'project-3' });

      await expect(
        controller.findAll(req, project, '', user),
      ).resolves.toHaveLength(100);
    });
  });

  describe('findOne', () => {
    beforeEach(() => {
      seed(1, { organizationId: 'org-1', projectId: 'project-1' });
      seed(1, { organizationId: 'org-2', projectId: 'project-1' });
    });

    it('finds an own clip', async () => {
      await expect(
        controller.findOne(req, 'org-1-project-1-0', user),
      ).resolves.toMatchObject({ id: 'org-1-project-1-0' });
    });

    it.each(['org-2-project-1-0', 'missing'])(
      'answers 404 for %s',
      async (id) => {
        await expect(controller.findOne(req, id, user)).rejects.toMatchObject(
          notFound(id),
        );
      },
    );
  });

  describe('update', () => {
    beforeEach(() => {
      seed(1, { organizationId: 'org-1', projectId: 'project-1' });
      seed(1, { organizationId: 'org-2', projectId: 'project-1' });
    });

    it('patches an own clip', async () => {
      await controller.update(
        req,
        'org-1-project-1-0',
        { status: 'completed' } as UpdateClipperResultDto,
        user,
      );

      expect(results[0]?.status).toBe('completed');
    });

    it('answers 404 for another organization clip and leaves it alone', async () => {
      await expect(
        controller.update(
          req,
          'org-2-project-1-0',
          { status: 'completed' } as UpdateClipperResultDto,
          user,
        ),
      ).rejects.toMatchObject(notFound('org-2-project-1-0'));
      expect(results[1]?.status).toBeUndefined();
    });
  });
});
