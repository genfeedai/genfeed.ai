import { deepStrictEqual } from 'node:assert/strict';
import type { PrismaClient } from '@genfeedai/prisma';

export async function runOwnedRuntimeCleanup(
  actions: (() => Promise<unknown>)[],
): Promise<void> {
  const failures: unknown[] = [];
  for (const action of actions) {
    try {
      await action();
    } catch (error) {
      failures.push(error);
    }
  }
  if (failures.length > 0) {
    throw new AggregateError(
      failures,
      'Owned proactive runtime cleanup failed',
    );
  }
}

// Use the actual immutable model's inferred scalar payload, including provenance.
type OwnedPins = Awaited<
  ReturnType<PrismaClient['contentVersionPin']['findMany']>
>;

export function planOwnedPinRetention(
  ownedOrganizationIds: readonly string[],
  pins: OwnedPins,
) {
  const owned = new Set(ownedOrganizationIds);
  const ownedPins = pins.filter((pin) => owned.has(pin.organizationId));
  return {
    pins: ownedPins,
    organizationIds: [...new Set(ownedPins.map((pin) => pin.organizationId))],
    brandIds: [
      ...new Set(
        ownedPins.flatMap((pin) => (pin.brandId === null ? [] : [pin.brandId])),
      ),
    ],
    creatorIds: [...new Set(ownedPins.map((pin) => pin.createdByUserId))],
  };
}

// Disposal is authorized only after every writer stops and retention is discovered.
// Each disposal/proof action and each independent handle close still gets attempted.
export async function runOwnedPinRetentionCleanup<Retention>(
  stopWriters: (() => Promise<unknown>)[],
  readRetention: () => Promise<Retention>,
  disposeAndProve: (retention: Retention) => Promise<void>,
  closeHandles: (() => Promise<unknown>)[],
): Promise<void> {
  await runOwnedRuntimeCleanup([
    async () => {
      await runOwnedRuntimeCleanup(stopWriters);
      const retention = await readRetention();
      await disposeAndProve(retention);
    },
    ...closeHandles,
  ]);
}

export function assertOwnedPinsUnchanged(
  before: OwnedPins,
  after: OwnedPins,
): void {
  deepStrictEqual(after, before);
}
