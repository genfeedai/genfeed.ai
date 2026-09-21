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
   * Margin multiplier applied on top of the base provider-cost markup when
   * computing customer-facing model credit costs. 1.0 = base margin only,
   * 1.2 = +20% markup on top of the base. See `applyMargin` in
   * `@genfeedai/pricing`.
   */
  marginMultiplier: number;

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
  marginMultiplier?: number;
  typedDecisionProvider?: TypedDecisionProviderName;
}
