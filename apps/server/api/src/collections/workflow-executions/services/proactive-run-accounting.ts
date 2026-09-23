import { Prisma } from '@genfeedai/prisma';

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function proactiveRunMetadata(
  result: unknown,
): { strategyId: string; threadId?: string } | null {
  const metadata = record(record(result).metadata);
  if (
    metadata.source !== 'proactive' ||
    metadata.canonicalId !== 'agent.turn.execute' ||
    typeof metadata.strategyId !== 'string'
  )
    return null;
  return {
    strategyId: metadata.strategyId,
    ...(typeof metadata.threadId === 'string'
      ? { threadId: metadata.threadId }
      : {}),
  };
}

export async function resolveProactiveConsumedCredits(
  transaction: Prisma.TransactionClient,
  input: { executionId: string; organizationId: string },
): Promise<number> {
  const ledger = await transaction.creditTransaction.findMany({
    where: {
      workflowExecutionId: input.executionId,
      organizationId: input.organizationId,
      isDeleted: false,
      category: { in: ['deduct', 'refund'] },
    },
    select: { amount: true, category: true },
  });
  if (ledger.length > 0) {
    const total = ledger.reduce(
      (sum, entry) =>
        entry.category === 'deduct'
          ? sum.plus(new Prisma.Decimal(entry.amount).abs())
          : sum.minus(new Prisma.Decimal(entry.amount).abs()),
      new Prisma.Decimal(0),
    );
    return Math.max(0, total.toNumber());
  }
  return 0;
}

export function withProactiveConsumedCredits(
  result: unknown,
  creditsUsed: number,
): Record<string, unknown> {
  return {
    ...record(result),
    metadata: {
      ...record(record(result).metadata),
      proactiveCreditsUsed: creditsUsed,
    },
  };
}
