'use client';

import BaseAppLayout from '@/components/layouts/app/AppLayout';
import type { AppLayoutProps } from '@/props/layout/app-layout.props';

export function AppShell(props: AppLayoutProps) {
  return <BaseAppLayout {...props} />;
}

export default AppShell;
