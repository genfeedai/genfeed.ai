'use client';

import type { TopbarProps } from '@genfeedai/props/navigation/topbar.props';
import TopbarShared from '@/features/ingredients/components/topbars/shared/TopbarShared';

export default function Topbar(props: TopbarProps) {
  return <TopbarShared {...props} />;
}
