import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { runCheckMarketplaceBoundary } from './check-marketplace-boundary';

const testDirs: string[] = [];

afterEach(() => {
  for (const testDir of testDirs.splice(0)) {
    rmSync(testDir, { force: true, recursive: true });
  }
});

function fixture(files: Record<string, string>): string {
  const rootDir = mkdtempSync(path.join(tmpdir(), 'marketplace-boundary-'));
  testDirs.push(rootDir);

  for (const [file, source] of Object.entries(files)) {
    const absolutePath = path.join(rootDir, file);
    mkdirSync(path.dirname(absolutePath), { recursive: true });
    writeFileSync(absolutePath, source);
  }

  return rootDir;
}

describe('check-marketplace-boundary', () => {
  it('accepts public preview and checkout DTOs', () => {
    const rootDir = fixture({
      'packages/contracts/src/interfaces/marketplace/checkout.interface.ts':
        'export interface ICreateCheckoutDto { listingId: string; }',
      'packages/contracts/src/interfaces/marketplace/index.ts':
        "export * from './checkout.interface';\nexport * from './listing.interface';\nexport * from './seller.interface';",
      'packages/contracts/src/interfaces/marketplace/listing.interface.ts':
        'export interface IListingPreview { id: string; title: string; }',
      'packages/contracts/src/interfaces/marketplace/seller.interface.ts':
        'export interface ISellerPreview { id: string; slug: string; }',
      'packages/props/cards/listing-card.props.ts':
        "import type { IListingPreview } from '@genfeedai/contracts/interfaces';\nexport interface ListingCardProps { listing: IListingPreview; }",
      'packages/services/core/environment.service.ts':
        "export const MARKETPLACE_ORIGIN = 'https://marketplace.genfeed.ai';",
    });

    expect(runCheckMarketplaceBoundary({ rootDir }).violations).toEqual([]);
  });

  it('flags private marketplace package imports and dependencies', () => {
    const rootDir = fixture({
      'apps/app/src/example.ts':
        "import { SellerService } from '@marketplace/admin';\nexport { SellerService };",
      'apps/server/api/package.json': JSON.stringify({
        dependencies: { '@genfeedai/marketplace': '1.0.0' },
      }),
    });

    expect(runCheckMarketplaceBoundary({ rootDir }).violations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          file: 'apps/app/src/example.ts',
          specifier: '@marketplace/admin',
        }),
        expect.objectContaining({
          file: 'apps/server/api/package.json',
          specifier: '@genfeedai/marketplace',
        }),
      ]),
    );
  });

  it('flags persistence models and unexpected marketplace contract files', () => {
    const rootDir = fixture({
      'packages/contracts/src/interfaces/marketplace/listing.interface.ts':
        'export interface IListing { id: string; organization: string; }',
      'packages/contracts/src/interfaces/marketplace/purchase.interface.ts':
        'export interface IPurchase { id: string; }',
      'packages/ui/src/example.ts':
        "import type { ISeller } from '@genfeedai/contracts/interfaces';\nexport type Seller = ISeller;",
    });

    expect(runCheckMarketplaceBoundary({ rootDir }).violations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ specifier: 'IListing' }),
        expect.objectContaining({ specifier: 'IPurchase' }),
        expect.objectContaining({ specifier: 'ISeller' }),
        expect.objectContaining({
          file: 'packages/contracts/src/interfaces/marketplace/purchase.interface.ts',
        }),
      ]),
    );
  });
});
