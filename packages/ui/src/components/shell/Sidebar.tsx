'use client';

import type { MenuSharedProps } from '@genfeedai/props/navigation/menu.props';
import MenuShared from '@ui/menus/shared/MenuShared';

export default function Sidebar(props: MenuSharedProps) {
  return <MenuShared {...props} />;
}
