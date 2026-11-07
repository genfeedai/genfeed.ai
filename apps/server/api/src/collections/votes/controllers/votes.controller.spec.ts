import type { AuthenticatedUser } from '@api/auth/interfaces/authenticated-user.interface';

vi.mock('@api/helpers/utils/response/response.util', () => ({
  returnBadRequest: vi.fn((response) => {
    throw { response, status: 400 };
  }),
  returnNotFound: vi.fn((type, id) => ({
    errors: [
      { detail: `${type} ${id} not found`, status: '404', title: 'Not Found' },
    ],
  })),
  serializeCollection: vi.fn((_req, _serializer, data) => data.docs || data),
  serializeSingle: vi.fn((_req, _serializer, data) => data),
}));

import { VotesController } from '@api/collections/votes/controllers/votes.controller';
import { VotesService } from '@api/collections/votes/services/votes.service';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { VoteEntityModel } from '@genfeedai/contracts';
import { testId } from '@helpers/testing/test-id.helper';
import { LoggerService } from '@libs/logger/logger.service';
import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import type { Request } from 'express';

const organizationId = testId('org');
const userId = testId('user');
const validEntityId = testId('entity');

describe('VotesController', () => {
  let controller: VotesController;
  let service: {
    addVote: ReturnType<typeof vi.fn>;
    isEntityInOrganization: ReturnType<typeof vi.fn>;
    removeVote: ReturnType<typeof vi.fn>;
  };

  const mockReq = {} as Request;

  const mockUser: AuthenticatedUser = {
    id: 'user_123',
    brandId: testId('brand'),
    organizationId,
    userId,
  };
  const validCreateVoteDto = {
    entity: validEntityId,
    entityModel: VoteEntityModel.INGREDIENT,
  };

  beforeEach(async () => {
    service = {
      addVote: vi.fn(),
      isEntityInOrganization: vi.fn().mockResolvedValue(true),
      removeVote: vi.fn().mockResolvedValue({ removedCount: 1 }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [VotesController],
      providers: [
        { provide: VotesService, useValue: service },
        {
          provide: LoggerService,
          useValue: { error: vi.fn(), log: vi.fn() },
        },
      ],
    })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<VotesController>(VotesController);
  });

  it.each([VoteEntityModel.INGREDIENT, VoteEntityModel.PROMPT])(
    'adds a %s vote in the caller organization',
    async (entityModel) => {
      const mockVote = { id: testId('vote'), entity: validEntityId };
      service.addVote.mockResolvedValue({ created: true, vote: mockVote });

      const result = await controller.create(
        mockReq,
        { entity: validEntityId, entityModel },
        mockUser,
      );

      expect(service.addVote).toHaveBeenCalledWith({
        entityId: validEntityId,
        entityModel,
        organizationId,
        userId,
      });
      expect(result).toEqual(mockVote);
    },
  );

  it('returns the existing vote when the same vote is posted again', async () => {
    const existing = { id: testId('vote'), isDeleted: false };
    service.addVote.mockResolvedValue({ created: false, vote: existing });

    await controller.create(mockReq, validCreateVoteDto, mockUser);
    const second = await controller.create(
      mockReq,
      validCreateVoteDto,
      mockUser,
    );

    expect(second).toEqual(existing);
    expect(service.removeVote).not.toHaveBeenCalled();
  });

  it.each([VoteEntityModel.INGREDIENT, VoteEntityModel.PROMPT])(
    'returns 404 for a %s outside the caller organization without writing a vote',
    async (entityModel) => {
      service.isEntityInOrganization.mockResolvedValue(false);

      const result = controller.create(
        mockReq,
        { entity: validEntityId, entityModel },
        mockUser,
      );

      await expect(result).rejects.toBeInstanceOf(NotFoundException);
      await expect(result).rejects.toMatchObject({ status: 404 });
      expect(service.addVote).not.toHaveBeenCalled();
    },
  );

  it('fails closed when the authenticated organization is missing', async () => {
    await expect(
      controller.create(mockReq, validCreateVoteDto, {
        ...mockUser,
        organizationId: '',
      }),
    ).rejects.toMatchObject({ status: 404 });

    expect(service.isEntityInOrganization).not.toHaveBeenCalled();
    expect(service.addVote).not.toHaveBeenCalled();
  });

  it('throws BadRequestException when entity is invalid ObjectId', async () => {
    await expect(
      controller.create(
        mockReq,
        { ...validCreateVoteDto, entity: 'invalid-id' },
        mockUser,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('throws BadRequestException when entity is missing', async () => {
    await expect(
      controller.create(
        mockReq,
        {} as Parameters<VotesController['create']>[1],
        mockUser,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('throws BadRequestException when service fails', async () => {
    service.addVote.mockRejectedValue(new Error('fail'));

    await expect(
      controller.create(mockReq, validCreateVoteDto, mockUser),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('removes a vote (soft-delete) via DELETE endpoint', async () => {
    await controller.remove(validEntityId, mockUser);

    expect(service.removeVote).toHaveBeenCalledWith({
      entityId: validEntityId,
      organizationId,
      userId,
    });
  });

  it('throws BadRequestException for invalid entityId on DELETE', async () => {
    await expect(
      controller.remove('invalid-id', mockUser),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
