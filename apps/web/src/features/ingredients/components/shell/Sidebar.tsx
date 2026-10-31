'use client';

import MenuShared from '@/components/menus/shared/MenuShared';
import type { MenuSharedProps } from '@/props/navigation/menu.props';

export default function Sidebar(props: MenuSharedProps) {
  return <MenuShared {...props} />;
}
