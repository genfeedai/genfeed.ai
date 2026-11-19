import { MembersService } from '@api/collections/members/services/members.service';
import { UsersService } from '@api/collections/users/services/users.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Test } from '@nestjs/testing';
import type { NextFunction, Request } from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { UsersSignupNetworkController } from './users-signup-network.controller';

const signupIps = new Map<string, string | null>([
  ['ipv4-user', '::ffff:128.101.101.101'],
  ['ipv6-user', '2001:4860:4860::8888'],
  ['older-user', null],
]);

describe('signup network details', () => {
  it('returns an offline location and the full IP only through the superadmin endpoint', async () => {
    const module = await Test.createTestingModule({
      controllers: [UsersSignupNetworkController],
      providers: [
        UsersService,
        { provide: MembersService, useValue: {} },
        { provide: LoggerService, useValue: { warn: () => undefined } },
        {
          provide: PrismaService,
          useValue: {
            user: {
              findFirst: ({
                where,
              }: {
                where: { id: string; isDeleted: boolean };
              }) => {
                const signupIpAddress = signupIps.get(where.id);
                return signupIpAddress !== undefined &&
                  where.isDeleted === false
                  ? { id: where.id, signupIpAddress }
                  : null;
              },
            },
          },
        },
      ],
    }).compile();
    const app = module.createNestApplication();
    app.use((req: Request, _res: unknown, next: NextFunction) => {
      req.user = {
        id: 'operator',
        isSuperAdmin: req.headers['test-role'] === 'superadmin',
      };
      next();
    });
    await app.init();

    try {
      const api = request(app.getHttpServer());
      const denied = await api
        .get('/users/ipv4-user/signup-network')
        .expect(403);
      expect(denied.text).not.toContain('128.101.101.101');

      const v4 = await api
        .get('/users/ipv4-user/signup-network')
        .set('test-role', 'superadmin')
        .expect('Cache-Control', 'private, no-store')
        .expect(200);
      expect(v4.body.data.attributes).toEqual({
        ipAddress: '::ffff:128.101.101.101',
        location: {
          city: 'Minneapolis',
          region: 'Minnesota',
          country: 'United States',
        },
      });

      const v6 = await api
        .get('/users/ipv6-user/signup-network')
        .set('test-role', 'superadmin')
        .expect(200);
      expect(v6.body.data.attributes).toEqual({
        ipAddress: '2001:4860:4860::8888',
        location: { city: 'Montreal', region: 'Quebec', country: 'Canada' },
      });

      const older = await api
        .get('/users/older-user/signup-network')
        .set('test-role', 'superadmin')
        .expect(200);
      expect(older.body.data.attributes).toEqual({
        ipAddress: null,
        location: null,
      });
    } finally {
      await app.close();
    }
  });
});
