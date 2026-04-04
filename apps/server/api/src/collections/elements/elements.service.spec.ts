import { ElementsBlacklistsService } from '@api/collections/elements/blacklists/services/blacklists.service';
import { ElementsCameraMovementsService } from '@api/collections/elements/camera-movements/services/camera-movements.service';
import { ElementsCamerasService } from '@api/collections/elements/cameras/services/cameras.service';
import { ElementsService } from '@api/collections/elements/elements.service';
import { ElementsLensesService } from '@api/collections/elements/lenses/services/lenses.service';
import { ElementsLightingsService } from '@api/collections/elements/lightings/services/lightings.service';
import { ElementsMoodsService } from '@api/collections/elements/moods/services/moods.service';
import { ElementsScenesService } from '@api/collections/elements/scenes/services/scenes.service';
import { ElementsSoundsService } from '@api/collections/elements/sounds/services/sounds.service';
import { ElementsStylesService } from '@api/collections/elements/styles/services/styles.service';
import { createMockModel } from '@api/shared/testing/mock-model.factory';
import type { LoggerService } from '@libs/logger/logger.service';
import { Types } from 'mongoose';

const mockLoggerService = {
  debug: vi.fn(),
  error: vi.fn(),
  log: vi.fn(),
  warn: vi.fn(),
} as unknown as LoggerService;

function makeSubService<T>(Ctor: new (...args: never[]) => T): T {
  const MockModel = createMockModel({
    isDeleted: false,
    key: 'test',
    label: 'Test',
  });
  // aggregate needs to return an object with exec()
  vi.mocked(MockModel.aggregate).mockReturnValue({
    exec: vi.fn().mockResolvedValue([]),
  } as never);
  vi.mocked(MockModel.aggregatePaginate).mockResolvedValue({
    docs: [],
    hasNextPage: false,
    hasPrevPage: false,
    limit: 10,
    page: 1,
    totalDocs: 0,
    totalPages: 1,
  } as never);
  return new Ctor(MockModel as never, mockLoggerService as never);
}

describe('ElementsService', () => {
  let service: ElementsService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new ElementsService(
      makeSubService(ElementsCamerasService),
      makeSubService(ElementsMoodsService),
      makeSubService(ElementsScenesService),
      makeSubService(ElementsStylesService),
      makeSubService(ElementsSoundsService),
      makeSubService(ElementsBlacklistsService),
      makeSubService(ElementsLightingsService),
      makeSubService(ElementsLensesService),
      makeSubService(ElementsCameraMovementsService),
    );
  });

  it('should be defined', () => expect(service).toBeDefined());

  describe('findAllElements', () => {
    it('should return elements for null org', async () => {
      const result = await service.findAllElements(null);
      expect(result).toBeDefined();
    });

    it('should return elements for a specific org', async () => {
      const orgId = new Types.ObjectId().toString();
      const result = await service.findAllElements(orgId);
      expect(result).toBeDefined();
    });
  });
});
