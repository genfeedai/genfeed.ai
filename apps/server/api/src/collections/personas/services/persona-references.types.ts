import type { AuthenticatedUser } from '@api/auth/interfaces/authenticated-user.interface';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';

/** One stored reference row as the readers select it. */
export interface PersonaReferenceRow {
  /** Absent when the reader did not select it; treated as live. */
  ingredient?: { isDeleted: boolean } | null;
  ingredientId: string;
  position: number;
}

/**
 * A persona row with its stored references. `references` is optional so a
 * reader that did not select them still gets the `[avatarIngredientId]`
 * rollout fallback.
 */
export interface PersonaWithReferences {
  avatarIngredientId: string | null;
  references?: readonly PersonaReferenceRow[];
}

/** Prisma delegates the reference reads and writes use (client or transaction). */
export type PersonaReferencesClient = Pick<
  PrismaService,
  '$queryRaw' | 'ingredient' | 'persona' | 'personaReference'
>;

/** Who is changing a character's references, for the sharing check. */
export interface PersonaReferenceActor {
  apiKeyContext?: Pick<AuthenticatedUser, 'isApiKey' | 'scopes'>;
  isSuperAdmin?: boolean;
  userId: string;
}

/** Scope of one reference write: the caller's organization and brand. */
export interface PersonaReferenceScope {
  actor: PersonaReferenceActor;
  brandId: string | null | undefined;
  organizationId: string;
  personaId: string;
}
