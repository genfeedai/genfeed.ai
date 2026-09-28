'use client';

import { REPLY_BOT_FEATURE_FLAG } from '@genfeedai/contracts/constants';
import type { LayoutProps } from '@genfeedai/props/layout/layout.props';
import { useIsSuperAdmin } from '@hooks/auth/use-is-super-admin/use-is-super-admin';
import FeatureGate from '@ui/guards/feature/FeatureGate';

/** The Replies gate, with the superadmin bypass the API guard grants (#5468). */
export default function RepliesFeatureGate({ children }: LayoutProps) {
  const isSuperAdmin = useIsSuperAdmin();

  if (isSuperAdmin) {
    return children;
  }

  return <FeatureGate flagKey={REPLY_BOT_FEATURE_FLAG}>{children}</FeatureGate>;
}
