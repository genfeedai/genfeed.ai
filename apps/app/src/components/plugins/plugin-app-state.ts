import type { PluginAppEntry } from '@genfeedai/props/plugins/organization-plugins-page.props';

/** Installed (or pinned) and allowed, so Open works. */
export function isPluginAppOpenable(app: PluginAppEntry): boolean {
  return app.state === 'installed' || app.state === 'pinned';
}
