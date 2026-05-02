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
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { VoteEntityModel } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import type { Request } from 'express';

describe('VotesController', () => {
  let controller: VotesController;
  let service: { create: vi.Mock; patchAll: vi.Mock };

  const mockReq = {} as Request;

  const mockUser = {
    id: 'user_123',
    publicMetadata: {
      organization: '507f1f77bcf86cd799439013',
      user: '507f191e810c19729de860ea',
    },
  };

  const validEntityId = '507f191e810c19729de860ea';
  const validCreateVoteDto = {
    entity: validEntityId,
    entityModel: VoteEntityModel.INGREDIENT,
  };

  beforeEach(async () => {
    service = {
      create: vi.fn(),
      patchAll: vi.fn().mockResolvedValue({ modifiedCount: 1 }),
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

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('creates a vote', async () => {
    const mockVote = { _id: '1', entity: validEntityId };
    service.create.mockResolvedValue(mockVote);

    const result = await controller.create(
      mockReq,
      validCreateVoteDto,
      mockUser as any,
    );

    expect(service.create).toHaveBeenCalledOnce();
    expect(service.create).toHaveBeenCalledWith({
      entityId: validEntityId,
      entityModel: VoteEntityModel.INGREDIENT,
      userId: mockUser.publicMetadata.user,
    });
    expect(result).toEqual(mockVote);
  });

  it('throws BadRequestException when entity is invalid ObjectId', async () => {
    await expect(
      controller.create(mockReq, { entity: 'invalid-id' }, mockUser as any),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('throws BadRequestException when entity is missing', async () => {
    await expect(
      controller.create(mockReq, {} as any, mockUser as any),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('throws BadRequestException when service fails', async () => {
    service.create.mockRejectedValue(new Error('fail'));

    await expect(
      controller.create(mockReq, { entity: validEntityId }, mockUser as any),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('creates a prompt vote with entity model', async () => {
    const mockVote = {
      _id: '2',
      entity: validEntityId,
      entityModel: VoteEntityModel.PROMPT,
    };
    service.create.mockResolvedValue(mockVote);

    const result = await controller.create(
      mockReq,
      { entity: validEntityId, entityModel: VoteEntityModel.PROMPT },
      mockUser as any,
    );

    expect(service.create).toHaveBeenCalledWith(
      expect.objectContaining({ entityModel: VoteEntityModel.PROMPT }),
    );
    expect(result).toEqual(mockVote);
  });

  it('creates an ingredient vote with entity model', async () => {
    const mockVote = {
      _id: '3',
      entity: validEntityId,
      entityModel: VoteEntityModel.INGREDIENT,
    };
    service.create.mockResolvedValue(mockVote);

    const result = await controller.create(
      mockReq,
      validCreateVoteDto,
      mockUser as any,
    );

    expect(service.create).toHaveBeenCalledWith(
      expect.objectContaining({ entityModel: VoteEntityModel.INGREDIENT }),
    );
    expect(result).toEqual(mockVote);
  });

  it('removes a vote (soft-delete) via DELETE endpoint', async () => {
    await controller.remove(validEntityId, mockUser as any);

    expect(service.patchAll).toHaveBeenCalledWith(
      expect.objectContaining({
        isDeleted: false,
      }),
      { isDeleted: true },
    );
  });

  it('throws BadRequestException for invalid entityId on DELETE', async () => {
    await expect(
      controller.remove('invalid-id', mockUser as any),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
