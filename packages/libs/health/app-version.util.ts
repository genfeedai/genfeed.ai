/** The running app's version for health responses, `1.0.0` when unset. */
export function getAppVersion(): string {
  return process.env.npm_package_version ?? process.env.VERSION ?? '1.0.0';
}
