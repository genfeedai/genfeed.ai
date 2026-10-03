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
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
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
    create: ReturnType<typeof vi.fn>;
    patchAll: ReturnType<typeof vi.fn>;
    toggleVote: ReturnType<typeof vi.fn>;
  };
  let ingredientFindFirst: ReturnType<typeof vi.fn>;

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
      create: vi.fn(),
      patchAll: vi.fn().mockResolvedValue({ modifiedCount: 1 }),
      toggleVote: vi.fn(),
    };

    ingredientFindFirst = vi.fn().mockResolvedValue({ id: validEntityId });

    const module: TestingModule = await Test.createTestingModule({
      controllers: [VotesController],
      providers: [
        { provide: VotesService, useValue: service },
        {
          provide: PrismaService,
          useValue: { ingredient: { findFirst: ingredientFindFirst } },
        },
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

  it('validates the ingredient tenant before using the shared toggle', async () => {
    const mockVote = { id: testId('vote'), entity: validEntityId };
    service.toggleVote.mockResolvedValue({
      action: 'added',
      vote: mockVote,
      voteId: mockVote.id,
    });

    const result = await controller.create(
      mockReq,
      validCreateVoteDto,
      mockUser,
    );

    expect(ingredientFindFirst).toHaveBeenCalledWith({
      select: { id: true },
      where: { id: validEntityId, isDeleted: false, organizationId },
    });
    expect(service.toggleVote).toHaveBeenCalledWith({
      entityId: validEntityId,
      entityModel: VoteEntityModel.INGREDIENT,
      organizationId,
      userId,
    });
    expect(service.create).not.toHaveBeenCalled();
    expect(result).toEqual(mockVote);
  });

  it.each([
    {
      name: 'another organization',
      organizationId: testId('foreign-org'),
      isDeleted: false,
    },
    { name: 'deleted', organizationId, isDeleted: true },
    {
      name: 'missing',
      organizationId,
      isDeleted: false,
      id: testId('other-ingredient'),
    },
  ])(
    'returns 404 for an ingredient that is $name without writing a vote',
    async (row) => {
      const ingredient = { id: validEntityId, ...row };
      ingredientFindFirst.mockImplementation(({ where }) =>
        Object.entries(where).every(
          ([key, value]) =>
            ingredient[key as keyof typeof ingredient] === value,
        )
          ? Promise.resolve({ id: ingredient.id })
          : Promise.resolve(null),
      );

      const result = controller.create(mockReq, validCreateVoteDto, mockUser);

      await expect(result).rejects.toBeInstanceOf(NotFoundException);
      await expect(result).rejects.toMatchObject({ status: 404 });
      expect(service.toggleVote).not.toHaveBeenCalled();
      expect(service.create).not.toHaveBeenCalled();
      expect(service.patchAll).not.toHaveBeenCalled();
    },
  );

  it('fails closed when the authenticated organization is missing', async () => {
    await expect(
      controller.create(mockReq, validCreateVoteDto, {
        ...mockUser,
        organizationId: '',
      }),
    ).rejects.toMatchObject({ status: 404 });

    expect(ingredientFindFirst).not.toHaveBeenCalled();
    expect(service.toggleVote).not.toHaveBeenCalled();
  });

  it('serializes the removed vote when the ingredient is voted on again', async () => {
    const removedVote = {
      id: testId('vote'),
      entity: validEntityId,
      isDeleted: true,
    };
    service.toggleVote.mockResolvedValue({
      action: 'removed',
      vote: removedVote,
      voteId: removedVote.id,
    });

    expect(
      await controller.create(mockReq, validCreateVoteDto, mockUser),
    ).toEqual(removedVote);
    expect(service.create).not.toHaveBeenCalled();
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
    service.toggleVote.mockRejectedValue(new Error('fail'));

    await expect(
      controller.create(mockReq, validCreateVoteDto, mockUser),
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
      mockUser,
    );

    expect(service.create).toHaveBeenCalledWith(
      expect.objectContaining({ entityModel: VoteEntityModel.PROMPT }),
    );
    expect(result).toEqual(mockVote);
    expect(ingredientFindFirst).not.toHaveBeenCalled();
    expect(service.toggleVote).not.toHaveBeenCalled();
  });

  it('removes a vote (soft-delete) via DELETE endpoint', async () => {
    await controller.remove(validEntityId, mockUser);

    expect(service.patchAll).toHaveBeenCalledWith(
      expect.objectContaining({
        entityId: validEntityId,
        userId: mockUser.userId,
      }),
      { isDeleted: true },
    );
  });

  it('throws BadRequestException for invalid entityId on DELETE', async () => {
    await expect(
      controller.remove('invalid-id', mockUser),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
