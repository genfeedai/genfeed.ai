import {
  CUSTOMER_INSTANCE_ROLES,
  CUSTOMER_INSTANCE_STATUSES,
  type CustomerInstanceRole,
  type CustomerInstanceStatus,
} from '@api/collections/customer-instances/schemas/customer-instance.schema';
import { normalizeCustomerInstanceAddress } from '@api/collections/customer-instances/utils/customer-instance-address.util';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { scopedWhere } from '@api/tenancy/scoped-where';
import { Traced } from '@libs/tracing/traced';
import { Injectable } from '@nestjs/common';
import { z } from 'zod';

const MAX_LISTED_INSTANCES = 200;

const reference = z
  .string()
  .trim()
  .min(1)
  .max(200)
  .regex(/^[A-Za-z0-9._:-]+$/);

export const adminCustomerInstanceReferenceSchema = reference;

export const adminCustomerInstanceInputSchema = z
  .object({
    apiUrl: z.string().trim().min(1).max(253),
    role: z.enum(CUSTOMER_INSTANCE_ROLES),
    status: z.enum(CUSTOMER_INSTANCE_STATUSES),
  })
  .strict();

export type AdminCustomerInstanceInput = z.infer<
  typeof adminCustomerInstanceInputSchema
>;

export interface AdminCustomerInstanceView {
  apiUrl: string | null;
  id: string;
  organizationId: string;
  reference: string | null;
  role: CustomerInstanceRole | null;
  status: CustomerInstanceStatus | null;
}

interface StoredInstance {
  config: unknown;
  id: string;
  organizationId: string | null;
  status: string | null;
}

/**
 * Operator write path for dedicated instances (`customer_instances`).
 *
 * Every row an operator attaches to an organization is a dedicated one: the
 * app routes `provider=genfeedai` requests to exactly these rows. The address
 * is validated before it is stored, because the API sends requests to it.
 * `reference` is the operator system's own id for the instance, so repeating a
 * call updates the same row instead of adding another.
 */
@Traced()
@Injectable()
export class AdminCustomerInstancesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(organizationId: string): Promise<AdminCustomerInstanceView[]> {
    await this.assertOrganization(organizationId);
    const rows = await this.prisma.customerInstance.findMany({
      orderBy: { createdAt: 'desc' },
      take: MAX_LISTED_INSTANCES,
      where: scopedWhere(organizationId, {
        config: { equals: 'dedicated', path: ['tier'] },
      }),
    });

    return rows.map((row) => this.toView(row));
  }

  async upsert(
    organizationId: string,
    instanceReference: string,
    input: AdminCustomerInstanceInput,
  ): Promise<AdminCustomerInstanceView> {
    await this.assertOrganization(organizationId);
    const apiUrl = normalizeCustomerInstanceAddress(input.apiUrl);
    const config = {
      apiUrl,
      reference: instanceReference,
      role: input.role,
      tier: 'dedicated',
    };

    const existing = await this.findByReference(
      organizationId,
      instanceReference,
    );
    if (existing) {
      const updated = await this.prisma.customerInstance.update({
        data: { config, status: input.status },
        where: scopedWhere(organizationId, { id: existing.id }),
      });
      return this.toView(updated);
    }

    const created = await this.prisma.customerInstance.create({
      data: { config, organizationId, status: input.status },
    });
    return this.toView(created);
  }

  async remove(
    organizationId: string,
    instanceReference: string,
  ): Promise<void> {
    const existing = await this.findByReference(
      organizationId,
      instanceReference,
    );
    if (!existing) {
      throw new NotFoundException('Customer instance', instanceReference);
    }

    await this.prisma.customerInstance.update({
      data: { isDeleted: true },
      where: scopedWhere(organizationId, { id: existing.id }),
    });
  }

  private async findByReference(
    organizationId: string,
    instanceReference: string,
  ): Promise<StoredInstance | null> {
    return await this.prisma.customerInstance.findFirst({
      where: scopedWhere(organizationId, {
        config: { equals: instanceReference, path: ['reference'] },
      }),
    });
  }

  private async assertOrganization(organizationId: string): Promise<void> {
    // tenant-scope-ignore: Organization is looked up by its own id; the caller is a super admin and every instance read or write below is scoped to this organization.
    const organization = await this.prisma.organization.findFirst({
      select: { id: true },
      where: { id: organizationId, isDeleted: false },
    });
    if (!organization) {
      throw new NotFoundException('Organization', organizationId);
    }
  }

  private toView(row: StoredInstance): AdminCustomerInstanceView {
    const config =
      row.config !== null &&
      typeof row.config === 'object' &&
      !Array.isArray(row.config)
        ? (row.config as Record<string, unknown>)
        : {};

    return {
      apiUrl: typeof config.apiUrl === 'string' ? config.apiUrl : null,
      id: row.id,
      organizationId: row.organizationId ?? '',
      reference: typeof config.reference === 'string' ? config.reference : null,
      role:
        typeof config.role === 'string'
          ? (config.role as CustomerInstanceRole)
          : null,
      status: row.status as CustomerInstanceStatus | null,
    };
  }
}
