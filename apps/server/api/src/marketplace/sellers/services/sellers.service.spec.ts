import type { AdminSellerQueryDto } from '@api/marketplace/sellers/dto/admin-seller-query.dto';
import { SellersService } from '@api/marketplace/sellers/services/sellers.service';
import { SellerStatus } from '@genfeedai/enums';
import { BadRequestException } from '@nestjs/common';
import { Types } from 'mongoose';
import { vi } from 'vitest';

describe('SellersService', () => {
  let service: SellersService & {
    findAll: ReturnType<typeof vi.fn>;
    getAdminSellers: SellersService['getAdminSellers'];
    getAdminSellerById: ReturnType<typeof vi.fn>;
    model: {
      findOne: ReturnType<typeof vi.fn>;
    };
    patch: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    service = Object.create(SellersService.prototype) as SellersService & {
      findAll: ReturnType<typeof vi.fn>;
      getAdminSellerById: ReturnType<typeof vi.fn>;
      model: {
        findOne: ReturnType<typeof vi.fn>;
      };
      patch: ReturnType<typeof vi.fn>;
    };
    service.findAll = vi.fn();
    service.getAdminSellerById = vi.fn();
    service.patch = vi.fn();
    service.model = {
      findOne: vi.fn(),
    };
  });

  describe('getAdminSellers', () => {
    it('scopes queries to organization and sanitizes search', async () => {
      service.findAll.mockResolvedValue({ data: [], meta: {} });

      await service.getAdminSellers('507f191e810c19729de860ea', {
        limit: 20,
        page: 1,
        search: 'seller(a+)+$',
        sort: 'totalSales: -1',
        status: SellerStatus.APPROVED,
      } as AdminSellerQueryDto);

      expect(service.findAll).toHaveBeenCalledOnce();
      const [aggregate] = service.findAll.mock.calls[0] as [
        Array<Record<string, unknown>>,
      ];

      expect(aggregate[0]).toEqual(
        expect.objectContaining({
          $match: expect.objectContaining({
            isDeleted: false,
            organization: new Types.ObjectId('507f191e810c19729de860ea'),
            status: SellerStatus.APPROVED,
          }),
        }),
      );
      expect(aggregate[1]).toEqual(
        expect.objectContaining({
          $match: expect.objectContaining({
            $or: expect.arrayContaining([
              expect.objectContaining({
                displayName: expect.objectContaining({
                  $regex: 'seller\\(a\\+\\)\\+\\$',
                }),
              }),
            ]),
          }),
        }),
      );
    });
  });

  describe('setSellerStatus', () => {
    it('throws when seller is outside scoped organization', async () => {
      service.getAdminSellerById.mockResolvedValue(null);

      await expect(
        service.setSellerStatus(
          '507f191e810c19729de860ea',
          '507f1f77bcf86cd799439011',
          SellerStatus.SUSPENDED,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('patches seller status when scoped seller exists', async () => {
      service.getAdminSellerById.mockResolvedValue({ _id: 'seller-1' });
      service.patch.mockResolvedValue({
        _id: 'seller-1',
        status: SellerStatus.SUSPENDED,
      });

      const result = await service.setSellerStatus(
        '507f191e810c19729de860ea',
        'seller-1',
        SellerStatus.SUSPENDED,
      );

      expect(service.patch).toHaveBeenCalledWith('seller-1', {
        status: SellerStatus.SUSPENDED,
      });
      expect(result.status).toBe(SellerStatus.SUSPENDED);
    });
  });

  describe('getAdminPayouts', () => {
    it('defaults payout sorting to totalEarnings descending', async () => {
      const getAdminSellersSpy = vi
        .spyOn(service, 'getAdminSellers')
        .mockResolvedValue({ data: [], meta: {} } as never);

      await service.getAdminPayouts('507f191e810c19729de860ea', {
        limit: 10,
        page: 1,
      });

      expect(getAdminSellersSpy).toHaveBeenCalledWith(
        '507f191e810c19729de860ea',
        expect.objectContaining({
          sort: 'totalEarnings: -1',
        }),
      );
    });
  });
});
