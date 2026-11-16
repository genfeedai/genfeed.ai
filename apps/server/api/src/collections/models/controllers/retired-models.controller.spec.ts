import { RetiredModelsController } from '@api/collections/models/controllers/retired-models.controller';
import { ModelsQueryDto } from '@api/collections/models/dto/models-query.dto';
import { ModelsService } from '@api/collections/models/services/models.service';
import { createPaginatedFixture } from '@api-test/fixtures/ingredient-document.fixture';
import { createModelDocumentFixture } from '@api-test/fixtures/model-document.fixture';
import {
  memberUser,
  sessionOrganizationId,
  tenantReadQuery,
  tenantReadRequest,
} from '@api-test/helpers/tenant-read.fixture';
import { ModelLifecycle } from '@genfeedai/contracts';
import { Test } from '@nestjs/testing';

vi.mock('@helpers/utils/response/response.util', () => ({
  serializeCollection: vi.fn((_req, _serializer, data) => ({
    data: data.docs || data,
  })),
}));

describe('RetiredModelsController', () => {
  let modelsService: { findAll: ReturnType<typeof vi.fn> };
  let controller: RetiredModelsController;

  beforeEach(async () => {
    modelsService = { findAll: vi.fn() };
    const module = await Test.createTestingModule({
      controllers: [RetiredModelsController],
      providers: [{ provide: ModelsService, useValue: modelsService }],
    }).compile();
    controller = module.get(RetiredModelsController);
  });

  it('lists only the retired rows, unpaginated, for a regular member', async () => {
    const retired = createModelDocumentFixture({
      id: 'retired-1',
      key: 'genfeed-ai/old-flux',
      label: 'Old Flux',
      lifecycle: ModelLifecycle.RETIRED,
    });
    modelsService.findAll.mockResolvedValue(createPaginatedFixture([retired]));

    const result = await controller.findRetired(
      tenantReadRequest(),
      memberUser,
      tenantReadQuery(ModelsQueryDto, {}),
    );

    const [input, options] = modelsService.findAll.mock.calls[0];
    expect(input.where).toMatchObject({
      isDeleted: false,
      lifecycle: ModelLifecycle.RETIRED,
      OR: [{ organizationId: null }, { organizationId: sessionOrganizationId }],
    });
    expect(options).toMatchObject({ pagination: false });
    expect(result.data).toMatchObject([
      {
        attributes: { key: 'genfeed-ai/old-flux', label: 'Old Flux' },
        type: 'model',
      },
    ]);
  });
});
