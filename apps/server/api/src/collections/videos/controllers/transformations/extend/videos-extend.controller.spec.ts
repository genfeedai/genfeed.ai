import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { VideosExtendController } from '@api/collections/videos/controllers/transformations/extend/videos-extend.controller';
import type { VideoExtensionExecutionService } from '@api/collections/videos/services/video-extension-execution.service';
import type { VideosService } from '@api/collections/videos/services/videos.service';
import type { RequestWithContext as Request } from '@api/common/middleware/request-context.middleware';
import { ORGANIZATION_MODULE_KEY } from '@api/common/organization-modules/organization-module.decorator';
import { CREDITS_KEY } from '@api/helpers/decorators/credits/credits.decorator';
import { ModelsGuard } from '@api/helpers/guards/models/models.guard';
import { serializeSingle } from '@api/helpers/utils/response/response.util';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { IngredientCategory } from '@genfeedai/contracts';
import { WorkflowExecutionSerializer } from '@genfeedai/serializers';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@api/helpers/utils/response/response.util', () => ({
  returnNotFound: vi.fn((_source, id) => { throw new Error(`${id} not found`); }),
  serializeSingle: vi.fn((_request, _serializer, data) => data),
}));
const user = { id: 'actor', userId: 'actor', organizationId: 'org' } as User;
const dto = { model: 'google/veo-3.1', duration: 8, prompt: 'Continue moving forward' };
function fixture() {
  const videos = { findOne: vi.fn().mockResolvedValue({ id: 'source' }) };
  const extension = { enqueue: vi.fn().mockResolvedValue({ executionId: 'execution', status: 'PENDING' }) };
  const execution = { id: 'execution', status: 'PENDING', organizationId: 'org', userId: 'actor' };
  const prisma = { workflowExecution: { findFirst: vi.fn().mockResolvedValue(execution) } };
  const controller = new VideosExtendController(videos as unknown as VideosService, extension as unknown as VideoExtensionExecutionService, prisma as unknown as PrismaService);
  return { videos, extension, execution, prisma, run: () => controller.extendVideo({} as Request, user, 'source', dto) };
}
describe('VideosExtendController execution admission', () => {
  it('returns the actual queued tenant execution through its serializer', async () => {
    const f = fixture(); expect(await f.run()).toEqual(f.execution);
    expect(f.videos.findOne).toHaveBeenCalledWith({ id: 'source', organizationId: 'org', isDeleted: false, category: IngredientCategory.VIDEO });
    expect(f.extension.enqueue).toHaveBeenCalledWith(user, 'source', dto);
    expect(f.prisma.workflowExecution.findFirst).toHaveBeenCalledWith({ where: { id: 'execution', organizationId: 'org', userId: 'actor', isDeleted: false } });
    expect(serializeSingle).toHaveBeenCalledWith(expect.anything(), WorkflowExecutionSerializer, f.execution);
  });
  it('never dispatches a missing or foreign source', async () => {
    const f = fixture(); f.videos.findOne.mockResolvedValue(null);
    await expect(f.run()).rejects.toThrow('source not found'); expect(f.extension.enqueue).not.toHaveBeenCalled();
  });
  it('propagates queue failure rather than presenting a saved draft as success', async () => {
    const f = fixture(); f.extension.enqueue.mockRejectedValue(new Error('Queue unavailable'));
    await expect(f.run()).rejects.toThrow('Queue unavailable'); expect(f.prisma.workflowExecution.findFirst).not.toHaveBeenCalled();
  });
  it('keeps model validation and Playground policy while funding only the execution', () => {
    const handler = VideosExtendController.prototype.extendVideo;
    expect(Reflect.getMetadata(ORGANIZATION_MODULE_KEY, VideosExtendController)).toEqual({ moduleId: 'playground', operation: undefined });
    expect(Reflect.getMetadata('__guards__', handler)).toEqual([ModelsGuard]);
    expect(Reflect.getMetadata(CREDITS_KEY, handler)).toBeUndefined();
    expect(Reflect.getMetadata('__interceptors__', handler)).toBeUndefined();
    expect(Reflect.getMetadata('__httpCode__', handler)).toBe(202);
  });
});
