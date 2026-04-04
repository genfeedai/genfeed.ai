'use client';

import { useThemeLogo } from '@hooks/ui/use-theme-logo/use-theme-logo';
import type { GallerySidebarProps } from '@props/content/gallery.props';
import { EnvironmentService } from '@services/core/environment.service';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useMemo } from 'react';
import {
  HiDocumentText,
  HiLightBulb,
  HiMusicalNote,
  HiPhoto,
  HiTrophy,
  HiVideoCamera,
} from 'react-icons/hi2';

const MENU_CONFIG = [
  { href: '/gallery/videos', Icon: HiVideoCamera, label: 'Videos' },
  { href: '/gallery/images', Icon: HiPhoto, label: 'Images' },
  { href: '/gallery/music', Icon: HiMusicalNote, label: 'Music' },
  { href: '/gallery/posts', Icon: HiDocumentText, label: 'Posts' },
  { href: '/gallery/leaderboard', Icon: HiTrophy, label: 'Leaderboard' },
  { href: '/prompts', Icon: HiLightBulb, label: 'Prompts' },
] as const;

export default function GallerySidebar({ onLinkClick }: GallerySidebarProps) {
  const pathname = usePathname();
  const logoUrl = useThemeLogo();

  // Memoize menu items to prevent re-renders
  const menuItems = useMemo(
    () =>
      MENU_CONFIG.map(({ href, Icon, label }) => ({
        href,
        icon: <Icon className="text-xl" />,
        isActive: pathname === href,
        label,
      })),
    [pathname],
  );

  return (
    <aside className="w-64 h-screen bg-background flex flex-col">
      {/* Logo Section */}
      <div className="p-6 border-b border-white/[0.08]">
        <Link href="/" className="flex items-center gap-3">
          {logoUrl && (
            <Image
              src={logoUrl}
              alt={EnvironmentService.LOGO_ALT}
              className="h-6 w-6 object-contain dark:invert"
              width={24}
              height={24}
              sizes="24px"
              priority
            />
          )}
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
        {menuItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            onClick={onLinkClick}
            className={`flex items-center gap-3 px-4 py-3 transition-all duration-300 ${
              item.isActive
                ? 'bg-primary text-primary-foreground'
                : 'hover:bg-muted'
            }`}
          >
            <span className={item.isActive ? 'text-primary-foreground' : ''}>
              {item.icon}
            </span>
            <span className="font-medium">{item.label}</span>
          </Link>
        ))}
      </nav>

      {/* Footer */}
      <div className="p-4 border-t border-white/[0.08]">
        <p className="text-xs text-foreground/60 text-center">
          © 2024 AI Gallery
        </p>
      </div>
    </aside>
  );
}
