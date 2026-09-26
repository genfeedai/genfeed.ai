import {
  type BillingAccountScope,
  isBillingAccountScope,
} from './billing-account-scope';

/**
 * Canonical tenant scope for a Prisma `where`.
 *
 * `organizationId` is spread last and is deliberately non-overridable — that is
 * the tenant guarantee, and a caller must never be able to widen past it.
 * `isDeleted` is spread first, so a caller that explicitly asks for tombstones
 * (`{ isDeleted: true }`) gets them rather than being silently clobbered back
 * to the default. This mirrors `BaseService.withSoftDeleteFilter`.
 *
 * The `where` literal is typed on its own here, not against the delegate's
 * `…WhereInput`, so it gets no contextual type from Prisma. Pass enum members
 * rather than their string labels — `status: { in: [IngredientStatus.GENERATED] }`,
 * never `{ in: ['GENERATED'] }` — or the array widens to `string[]` and the
 * result stops satisfying the delegate's input type. Using the enum members is
 * the repository rule regardless; this is where skipping it fails loudly.
 */
export function scopedWhere<W extends Record<string, unknown>>(
  organizationId: string,
  where?: W,
): W & { isDeleted: boolean; organizationId: string } {
  if (!organizationId) {
    throw new Error('scopedWhere: organizationId is required');
  }

  return { isDeleted: false, ...(where as W), organizationId };
}

/**
 * Canonical billing-account scope for a Prisma `where` on a
 * billing-account-shared model (#5217) — `CreditBalance`, `CreditTransaction`,
 * `CreditReservation`, `BillingAccountOrganization`, and any other model that
 * carries `billingAccountId`. `scope` can only come from
 * `resolveBillingAccountAccess`, which proves — via guard-visible,
 * organization-scoped reads — that the caller's organization may use this
 * billing account, and registers it as the request's active scope for the
 * runtime tenant guard (`packages/libs/prisma/tenant-guard.ts`). A raw
 * `billingAccountId` string cannot satisfy this call, by construction.
 *
 * `billingAccountId` is spread last and is deliberately non-overridable,
 * mirroring `scopedWhere`'s `organizationId` guarantee above. `isDeleted` is
 * spread first for the same reason `scopedWhere` does: an explicit
 * `{ isDeleted: true }` from the caller is honored, not silently clobbered.
 */
export function billingAccountScopedWhere<W extends Record<string, unknown>>(
  scope: BillingAccountScope,
  where?: W,
): W & { billingAccountId: string; isDeleted: boolean } {
  // Runtime brand check (#5217, MAJOR 2): the type system blocks a raw
  // string here, but an `as`/`as unknown as BillingAccountScope` cast does
  // not. Verifying the brand at runtime means such a cast still fails loudly
  // instead of quietly forging a scope the caller never actually resolved.
  if (!isBillingAccountScope(scope)) {
    throw new Error(
      'billingAccountScopedWhere: scope must come from resolveBillingAccountAccess',
    );
  }

  return {
    isDeleted: false,
    ...(where as W),
    billingAccountId: scope.billingAccountId,
  };
}

export function brandScope(
  brandId: string | null | undefined,
): { brandId: string } | Record<string, never> {
  return brandId ? { brandId } : {};
}
