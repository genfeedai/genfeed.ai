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
}

/** Fields a platform operator may update via `/admin`. */
export interface IUpdatePlatformSettingPayload {
  marginMultiplier?: number;
}
