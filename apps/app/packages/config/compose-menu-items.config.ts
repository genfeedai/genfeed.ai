import type { MenuItemConfig } from '@genfeedai/interfaces/ui/menu-config.interface';
import { COMPOSE_ROUTES } from '@ui-constants/compose.constant';
import {
  HiDocumentText,
  HiEnvelope,
  HiOutlineDocumentText,
  HiOutlineEnvelope,
  HiOutlinePencilSquare,
  HiPencilSquare,
} from 'react-icons/hi2';

export const COMPOSE_MENU_ITEMS: MenuItemConfig[] = [
  {
    group: '',
    href: COMPOSE_ROUTES.ARTICLE,
    label: 'Article',
    matchPaths: [COMPOSE_ROUTES.ROOT, COMPOSE_ROUTES.ARTICLE],
    outline: HiOutlineDocumentText,
    solid: HiDocumentText,
  },
  {
    group: '',
    href: COMPOSE_ROUTES.POST,
    label: 'Social Post',
    matchPaths: [COMPOSE_ROUTES.POST],
    outline: HiOutlinePencilSquare,
    solid: HiPencilSquare,
  },
  {
    group: '',
    href: COMPOSE_ROUTES.NEWSLETTER,
    label: 'Newsletter',
    matchPaths: [COMPOSE_ROUTES.NEWSLETTER],
    outline: HiOutlineEnvelope,
    solid: HiEnvelope,
  },
];

export const COMPOSE_LOGO_HREF = COMPOSE_ROUTES.ARTICLE;
