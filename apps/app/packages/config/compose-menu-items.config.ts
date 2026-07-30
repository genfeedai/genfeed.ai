import { COMPOSE_ROUTES } from '@genfeedai/constants';
import type { MenuItemConfig } from '@genfeedai/interfaces/ui/menu-config.interface';
import { FileText, Mail, PenSquare } from 'lucide-react';

export const COMPOSE_MENU_ITEMS: MenuItemConfig[] = [
  {
    group: '',
    href: COMPOSE_ROUTES.ARTICLE,
    label: 'Article',
    matchPaths: [COMPOSE_ROUTES.ROOT, COMPOSE_ROUTES.ARTICLE],
    outline: FileText,
    solid: FileText,
  },
  {
    group: '',
    href: COMPOSE_ROUTES.POST,
    label: 'Social Post',
    matchPaths: [COMPOSE_ROUTES.POST],
    outline: PenSquare,
    solid: PenSquare,
  },
  {
    group: '',
    href: COMPOSE_ROUTES.NEWSLETTER,
    label: 'Newsletter',
    matchPaths: [COMPOSE_ROUTES.NEWSLETTER],
    outline: Mail,
    solid: Mail,
  },
];

export const COMPOSE_LOGO_HREF = COMPOSE_ROUTES.ARTICLE;
