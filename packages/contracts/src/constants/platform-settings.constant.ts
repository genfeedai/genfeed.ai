/**
 * Sentinel key of the single canonical `platform_settings` row.
 * Shared by the API collection service and the workers margin hydrator so the
 * singleton lookup key never drifts between processes.
 */
export const PLATFORM_SETTING_KEY = 'platform';
