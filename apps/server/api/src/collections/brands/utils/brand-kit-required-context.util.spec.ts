import {
  measureBrandKitRequiredTextContext,
  withRequiredTextContext,
} from '@api/collections/brands/utils/brand-kit-required-context.util';
import { BrandOsRevisionStatus } from '@genfeedai/contracts';
import type {
  IBrandKitDraft,
  IBrandOsRevision,
} from '@genfeedai/contracts/interfaces';
import { buildBrandKitDraftFromBrand } from '@genfeedai/helpers';

const ORG = 'org-1';
const BRAND = 'brand-1';

function draft(guidelinesLength: number): IBrandKitDraft {
  const content = buildBrandKitDraftFromBrand({
    description: 'Original',
    id: BRAND,
    label: 'Acme',
  });
  content.organizationId = ORG;
  content.brandId = BRAND;
  const field = content.fields.promptGuidelines;
  if (!field) throw new Error('The draft has no promptGuidelines field');
  field.currentValue = 'g'.repeat(guidelinesLength);
  return content;
}

function revision(
  guidelinesLength: number,
  status: `${BrandOsRevisionStatus}` = BrandOsRevisionStatus.DRAFT,
): IBrandOsRevision {
  return {
    approvedAt: null,
    approvedById: null,
    brandId: BRAND,
    content: draft(guidelinesLength),
    createdAt: '2026-11-25T10:00:00.000Z',
    exportSchemaVersion: '1',
    id: 'rev-1',
    organizationId: ORG,
    status,
    updatedAt: '2026-11-25T10:00:00.000Z',
    version: 1,
  };
}

describe('withRequiredTextContext', () => {
  it('counts a draft under the budget and names the largest field first', () => {
    const { requiredTextContext } = withRequiredTextContext(revision(4000));
    expect(requiredTextContext).toMatchObject({
      maxCharacters: 6000,
      overflowCharacters: 0,
    });
    expect(requiredTextContext?.fields[0]).toEqual({
      characters: 4002,
      field: 'promptGuidelines',
    });
    expect(requiredTextContext?.requiredCharacters).toBeGreaterThan(4002);
  });

  it('reports how far an over-budget draft overshoots', () => {
    const { requiredTextContext } = withRequiredTextContext(revision(6200));
    expect(requiredTextContext?.overflowCharacters).toBe(
      (requiredTextContext?.requiredCharacters ?? 0) - 6000,
    );
    expect(requiredTextContext?.overflowCharacters).toBeGreaterThan(0);
  });

  it('counts an approved revision too, so the meter keeps showing after approval', () => {
    const { requiredTextContext } = withRequiredTextContext(
      revision(6200, BrandOsRevisionStatus.APPROVED),
    );
    expect(requiredTextContext?.overflowCharacters).toBeGreaterThan(0);
  });

  it('leaves a superseded revision without a count', () => {
    const result = withRequiredTextContext(
      revision(6200, BrandOsRevisionStatus.SUPERSEDED),
    );
    expect(result).not.toHaveProperty('requiredTextContext');
  });

  it('adds no count when the kit identity cannot be read', () => {
    const unreadable = { ...revision(10), content: {} as IBrandKitDraft };
    expect(withRequiredTextContext(unreadable)).not.toHaveProperty(
      'requiredTextContext',
    );
    expect(
      measureBrandKitRequiredTextContext(unreadable, unreadable.content),
    ).toBeNull();
  });
});
