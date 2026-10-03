import type { PersonasService } from '@api/collections/personas/services/personas.service';
import { noCharacterAdmission } from '@api/collections/personas/utils/character-admission.util';
import { vi } from 'vitest';

/**
 * Stand-in for specs whose subject calls the shared character admission but
 * does not exercise it: every request is admitted with no character.
 */
export function personasServiceStub(): PersonasService {
  return {
    resolveCharacterHandles: vi.fn().mockResolvedValue({
      resolvedIngredientIds: [],
      unresolvedHandles: [],
    }),
    resolveCharacterReferences: vi
      .fn()
      .mockImplementation(async () => noCharacterAdmission()),
  } as unknown as PersonasService;
}
