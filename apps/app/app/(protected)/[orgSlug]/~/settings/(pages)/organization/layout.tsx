'use client';

import type { LayoutProps } from '@props/layout/layout.props';

// Organization settings sub-navigation now lives in the Settings sidebar
// (see buildSettingsMenuItems), not in an in-page tab bar. This layout keeps
// only the vertical spacing wrapper for the page content.
export default function OrganizationSettingsLayout({ children }: LayoutProps) {
  return <div className="space-y-6">{children}</div>;
}
