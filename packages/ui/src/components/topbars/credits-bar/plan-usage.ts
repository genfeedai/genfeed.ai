export interface PlanUsageInput {
  /** Wallet balance across every credit source; null while unknown. */
  balance: number | null;
  /** Credits the plan grants per cycle; 0 when there is no plan meter. */
  planLimit: number;
  /** Credits spent this cycle, from the ledger. Unknown reads as unspent. */
  cycleUsed: number;
}

export interface PlanUsage {
  planLimit: number;
  planBalance: number;
  planUsed: number;
  extraBalance: number;
  planUsagePercent: number;
}

/**
 * Splits the single wallet into plan and extra credits.
 *
 * The balance alone cannot tell the two apart: a top-up on top of the plan
 * grant keeps it above the plan size, so deriving spend from `limit - balance`
 * reads as nothing used. Spend comes from the ledger instead, charged to the
 * plan grant first; whatever the balance holds beyond the plan's remainder is
 * extra.
 */
export function getPlanUsage({
  balance,
  planLimit,
  cycleUsed,
}: PlanUsageInput): PlanUsage {
  if (balance === null) {
    return {
      extraBalance: 0,
      planBalance: 0,
      planLimit,
      planUsagePercent: 0,
      planUsed: 0,
    };
  }

  if (planLimit <= 0) {
    return {
      extraBalance: balance,
      planBalance: 0,
      planLimit: 0,
      planUsagePercent: 0,
      planUsed: 0,
    };
  }

  const planUsed = Math.min(planLimit, Math.max(0, cycleUsed));
  const planBalance = Math.min(balance, planLimit - planUsed);

  return {
    extraBalance: Math.max(0, balance - planBalance),
    planBalance,
    planLimit,
    planUsagePercent: (planUsed / planLimit) * 100,
    planUsed,
  };
}
