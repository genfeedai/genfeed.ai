import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PRISMA_MODEL_METADATA } from '@genfeedai/prisma';
import { describe, expect, it } from 'vitest';
import {
  billingAccountModelNamesFromMetadata,
  discoverBillingAccountModelNames,
  discoverTenantModels,
  tenantModelsFromMetadata,
} from './discover-tenant-models';

const REPOSITORY_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../..',
);

describe('discoverTenantModels', () => {
  it('discovers only models carrying both tenant fields', () => {
    const schema = `
      model Post {
        id             String  @id
        organizationId String
        isDeleted      Boolean @default(false)
      }

      model Organization {
        id        String  @id
        isDeleted Boolean @default(false)
      }

      model AuditLog {
        id             String @id
        organizationId String
      }
    `;

    expect(discoverTenantModels(schema)).toEqual([
      { delegate: 'post', model: 'Post' },
    ]);
  });

  it('matches PRISMA_MODEL_METADATA for the committed schema', () => {
    const schema = readFileSync(
      path.join(REPOSITORY_ROOT, 'packages/prisma/prisma/schema.prisma'),
      'utf8',
    );

    expect(discoverTenantModels(schema)).toEqual(
      tenantModelsFromMetadata(PRISMA_MODEL_METADATA),
    );
    expect(
      tenantModelsFromMetadata(PRISMA_MODEL_METADATA).length,
    ).toBeGreaterThan(0);
  });
});

describe('discoverBillingAccountModelNames', () => {
  it('discovers models carrying billingAccountId regardless of other fields', () => {
    const schema = `
      model CreditBalance {
        id               String  @id
        organizationId   String?
        billingAccountId String?
        isDeleted        Boolean @default(false)
      }

      model BillingAccountMember {
        id               String  @id
        billingAccountId String
      }

      model Post {
        id             String  @id
        organizationId String
        isDeleted      Boolean @default(false)
      }
    `;

    expect(discoverBillingAccountModelNames(schema)).toEqual(
      new Set(['CreditBalance', 'BillingAccountMember']),
    );
  });

  it('matches PRISMA_MODEL_METADATA for the committed schema', () => {
    const schema = readFileSync(
      path.join(REPOSITORY_ROOT, 'packages/prisma/prisma/schema.prisma'),
      'utf8',
    );

    expect(discoverBillingAccountModelNames(schema)).toEqual(
      billingAccountModelNamesFromMetadata(PRISMA_MODEL_METADATA),
    );
    expect(discoverBillingAccountModelNames(schema).size).toBeGreaterThan(0);
    expect(discoverBillingAccountModelNames(schema).has('CreditBalance')).toBe(
      true,
    );
  });
});
