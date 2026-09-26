import type { MarginInputMode } from '../../enums/platform-setting.enum';
import type { TypedDecisionProviderName } from '../ai/typed-decision.interface';
import type { IBaseEntity } from '../core/base.interface';

/**
 * Platform-wide operator settings (singleton).
 *
 * Cross-client business/infra knobs configured from the top-level `/admin`
 * operator area — distinct from per-user `Setting` and per-org
 * `OrganizationSetting`. Access is restricted to platform superadmins.
 */
export interface IPlatformSetting extends IBaseEntity {
  /**
   * Sell/cost ratio applied to provider USD for **generation** billing. 1.0 =
   * provider cost, 3.33 = 70% margin on sell price. See `applyMargin` in
   * `@genfeedai/pricing`. Independent of `marginMultiplierAgentChat` — see
   * issue #5172.
   */
  marginMultiplierGeneration: number;

  /**
   * Sell/cost ratio applied to provider USD for **agent chat** billing. 1.0 =
   * provider cost, 1.7 = 70% markup on provider cost. See
   * `calculateAgentExactCredits` in `@genfeedai/contracts/constants`.
   * Independent of `marginMultiplierGeneration` — see issue #5172.
   */
  marginMultiplierAgentChat: number;

  /**
   * How an operator types and reads both margin multipliers above in
   * `/admin`: a markup percent on provider cost, or a margin percent on sell
   * price. Never changes what is stored or billed — billing always applies
   * `cost × multiplier`. See `multiplierToPercent` / `percentToMultiplier` in
   * `@genfeedai/pricing`.
   */
  marginInputMode: MarginInputMode;

  /**
   * Which provider answers typed decisions (epic #4863). `none` keeps every
   * migrated decision point on its deterministic path.
   *
   * This is enablement, not availability: the `TYPESAFE_API_KEY` credential
   * decides whether a hosted provider is *possible*, an operator decides
   * whether it is *on*. Kept here rather than in the environment so turning a
   * misbehaving vendor off takes a click rather than a deploy.
   */
  typedDecisionProvider: TypedDecisionProviderName;
}

/** Fields a platform operator may update via `/admin`. */
export interface IUpdatePlatformSettingPayload {
  marginMultiplierGeneration?: number;
  marginMultiplierAgentChat?: number;
  marginInputMode?: MarginInputMode;
  typedDecisionProvider?: TypedDecisionProviderName;
}
