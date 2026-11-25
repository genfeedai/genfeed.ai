import { SuperAdminGuard } from '@api/common/guards/super-admin.guard';
import { AdminCustomerInstancesController } from '@api/endpoints/admin/customer-instances/admin-customer-instances.controller';
import {
  AdminCustomerInstancesService,
  type AdminCustomerInstanceView,
} from '@api/endpoints/admin/customer-instances/admin-customer-instances.service';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { getTenantContext } from '@libs/prisma/tenant-context';
import { BadRequestException } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { describe, expect, it } from 'vitest';

const stored = new Map<string, AdminCustomerInstanceView>();
const seenTenants: Array<string | undefined> = [];

const service = {
  list: async (organizationId: string) => {
    seenTenants.push(getTenantContext()?.organizationId);
    return [...stored.values()].filter(
      (row) => row.organizationId === organizationId,
    );
  },
  remove: async (organizationId: string, reference: string) => {
    seenTenants.push(getTenantContext()?.organizationId);
    if (!stored.delete(`${organizationId}:${reference}`)) {
      throw new NotFoundException('Customer instance', reference);
    }
  },
  upsert: async (
    organizationId: string,
    reference: string,
    input: { apiUrl: string; role: 'videos'; status: 'running' },
  ) => {
    seenTenants.push(getTenantContext()?.organizationId);
    const row: AdminCustomerInstanceView = {
      apiUrl: input.apiUrl,
      id: `${organizationId}:${reference}`,
      organizationId,
      reference,
      role: input.role,
      status: input.status,
    };
    stored.set(row.id, row);
    return row;
  },
} as unknown as AdminCustomerInstancesService;

describe('AdminCustomerInstancesController', () => {
  const controller = new AdminCustomerInstancesController(service);
  const body = {
    apiUrl: 'https://videos.customer-a.example.com',
    role: 'videos',
    status: 'running',
  };

  it('is open to super admins only', () => {
    const guards = Reflect.getMetadata(
      GUARDS_METADATA,
      AdminCustomerInstancesController,
    );

    expect(guards).toEqual([SuperAdminGuard]);
  });

  it('stores a valid body and lists it under its organization, running in that tenant', async () => {
    const saved = await controller.upsert('org-a', 'inst-1', body);

    expect(saved.data).toMatchObject({
      organizationId: 'org-a',
      reference: 'inst-1',
    });
    expect((await controller.list('org-a')).data).toHaveLength(1);
    expect((await controller.list('org-b')).data).toEqual([]);
    expect(new Set(seenTenants)).toEqual(new Set(['org-a', 'org-b']));
  });

  it.each([
    ['an unknown field', { ...body, organizationId: 'org-b' }],
    ['a missing role', { apiUrl: body.apiUrl, status: 'running' }],
    ['an unknown role', { ...body, role: 'llm-gpu' }],
    ['an unknown status', { ...body, status: 'deleted' }],
    ['no body', undefined],
  ])('rejects %s with a 400', async (_name, payload) => {
    await expect(
      controller.upsert('org-a', 'inst-1', payload),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it.each(['', 'has space', 'a/b', 'x'.repeat(201)])(
    'rejects the reference %j with a 400',
    async (reference) => {
      await expect(
        controller.upsert('org-a', reference, body),
      ).rejects.toBeInstanceOf(BadRequestException);
    },
  );

  it('answers 404 for an instance the organization does not have', async () => {
    await expect(controller.remove('org-b', 'inst-1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
