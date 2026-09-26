-- Split the platform-wide margin knob into a generation multiplier and an
-- agent-chat multiplier, plus a platform-wide markup/margin input-mode
-- toggle. See issue #5172.
--
-- Both new columns are backfilled from the single legacy `marginMultiplier`
-- knob so today's effective sell prices do not move:
--
--  - Generation billed `(cost / 0.30) * marginMultiplier` (the pre-#5172
--    `applyMargin` formula). The new formula drops the hidden `/ 0.30` base
--    and bills `cost * marginMultiplierGeneration` directly, so existing
--    rows are rescaled by 1/0.30 (the untouched 1.0 default becomes 3.33).
--  - Agent chat billed `cost * 1.7 * marginMultiplier` (the hardcoded
--    AGENT_CREDIT_MARGIN_MULTIPLIER constant times the same knob). The new
--    formula bills `cost * marginMultiplierAgentChat` directly, so existing
--    rows are rescaled by 1.7 (the untouched 1.0 default becomes 1.7).
--
-- Both are rounded to 2 decimal places — the precision the operator-facing
-- value is entered and displayed at — which does not change any credit
-- charge computed from them (Math.ceil already rounds every charge up to a
-- whole credit).

-- CreateEnum
CREATE TYPE "MarginInputMode" AS ENUM ('MARKUP', 'MARGIN');

-- AlterTable
ALTER TABLE "platform_settings"
  ADD COLUMN "marginMultiplierGeneration" DOUBLE PRECISION NOT NULL DEFAULT 3.33,
  ADD COLUMN "marginMultiplierAgentChat" DOUBLE PRECISION NOT NULL DEFAULT 1.7,
  ADD COLUMN "marginInputMode" "MarginInputMode" NOT NULL DEFAULT 'MARGIN';

-- Backfill from the single legacy knob (see formulas above).
UPDATE "platform_settings"
SET
  "marginMultiplierGeneration" = ROUND(("marginMultiplier" / 0.30)::numeric, 2),
  "marginMultiplierAgentChat" = ROUND((1.7 * "marginMultiplier")::numeric, 2);

-- AlterTable
ALTER TABLE "platform_settings"
  DROP COLUMN "marginMultiplier";
