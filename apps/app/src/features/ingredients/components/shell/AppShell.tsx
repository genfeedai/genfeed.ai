'use client';

import type { AppLayoutProps } from '@genfeedai/props/layout/app-layout.props';
import BaseAppLayout from '@ui/layouts/app/AppLayout';

export function AppShell(props: AppLayoutProps) {
  return <BaseAppLayout {...props} />;
}

export default AppShell;
