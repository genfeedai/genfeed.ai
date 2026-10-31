import type { AppCatalogEntry } from '@/props/apps/organization-apps-page.props';

/** Installed (or pinned) and allowed, so Open works. */
export function isAppCatalogOpenable(app: AppCatalogEntry): boolean {
  return app.state === 'installed' || app.state === 'pinned';
}
