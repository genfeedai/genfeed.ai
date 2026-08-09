/**
 * Operating system of the machine requesting a desktop build.
 *
 * Distinct from `Platform` / `DesktopContentPlatform`, which identify social
 * networks. This one answers "which installer does this visitor need".
 */
export enum DesktopOs {
  MAC_OS = 'macos',
  /** Any OS with no desktop build: Linux, ChromeOS, mobile, or unrecognised. */
  OTHER = 'other',
  WINDOWS = 'windows',
}
