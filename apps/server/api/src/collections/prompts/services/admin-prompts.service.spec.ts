import {
  ADMIN_GENERATION_CATEGORIES,
  ADMIN_GENERATION_STATUSES,
} from '@api/collections/ingredients/utils/admin-generation-reviews.util';
import type { AdminPromptsQueryDto } from '@api/collections/prompts/dto/admin-prompts-query.dto';
import {
  AdminPromptsService,
  buildAdminPromptsWhere,
} from '@api/collections/prompts/services/admin-prompts.service';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@libs/prisma/tenant-context', () => ({
  crossOrgUnsafe: <T>(work: () => T) => work(),
}));

// A prompt counts as represented only by an ingredient the generation ledger shows.
const shownIngredients = {
  none: {
    category: { in: [...ADMIN_GENERATION_CATEGORIES] },
    isDeleted: false,
    status: { in: [...ADMIN_GENERATION_STATUSES] },
  },
};

const query = (partial: Partial<AdminPromptsQueryDto> = {}) =>
  partial as AdminPromptsQueryDto;

describe('buildAdminPromptsWhere', () => {
  it('keeps only live prompts with no generation', () => {
    expect(buildAdminPromptsWhere(query())).toEqual({
      ingredients: shownIngredients,
      isDeleted: false,
    });
  });

  it('narrows by organization and brand and searches the prompt and user email', () => {
    expect(
      buildAdminPromptsWhere(
        query({ brandId: 'brand-1', organizationId: 'org-1', search: ' cat ' }),
      ),
    ).toEqual({
      OR: [
        { original: { contains: 'cat', mode: 'insensitive' } },
        { enhanced: { contains: 'cat', mode: 'insensitive' } },
        { user: { is: { email: { contains: 'cat', mode: 'insensitive' } } } },
      ],
      brandId: 'brand-1',
      ingredients: shownIngredients,
      isDeleted: false,
      organizationId: 'org-1',
    });
  });
});

describe('AdminPromptsService', () => {
  it('reads across organizations with the owner and organization included', async () => {
    const prompts = { findAll: vi.fn().mockResolvedValue({ docs: [] }) };
    const service = new AdminPromptsService(prompts as never);

    await service.withoutGeneration(query({ page: 1 }));

    const [aggregate] = prompts.findAll.mock.calls[0];
    expect(aggregate.where).toMatchObject({ ingredients: shownIngredients });
    expect(Object.keys(aggregate.include)).toEqual(['organization', 'user']);
  });
});
