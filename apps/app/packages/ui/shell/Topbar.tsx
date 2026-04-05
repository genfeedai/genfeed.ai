'use client';

import type { TopbarProps } from '@props/navigation/topbar.props';
import TopbarShared from '@ui/topbars/shared/TopbarShared';

export default function Topbar(props: TopbarProps) {
  return <TopbarShared {...props} />;
}
