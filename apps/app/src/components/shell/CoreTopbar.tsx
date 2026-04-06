'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/enums';
import Button from '@ui/buttons/base/Button';
import { Menu, Moon, Sun, X } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

interface CoreTopbarProps {
  isMenuOpen?: boolean;
  onMenuToggle?: () => void;
}

export default function CoreTopbar({
  isMenuOpen,
  onMenuToggle,
}: CoreTopbarProps) {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const isDark = theme === 'dark';
  const ToggleIcon = isMenuOpen ? X : Menu;

  return (
    <header className="h-full w-full bg-transparent">
      <div className="flex h-full items-center justify-between px-4 sm:px-6">
        <div className="flex items-center gap-2">
          {/* Mobile hamburger */}
          {onMenuToggle ? (
            <Button
              variant={ButtonVariant.GHOST}
              size={ButtonSize.ICON}
              onClick={onMenuToggle}
              ariaLabel={
                isMenuOpen ? 'Close navigation menu' : 'Open navigation menu'
              }
              className="inline-flex h-10 w-10 items-center justify-center text-muted-foreground hover:bg-white/[0.06] hover:text-foreground md:hidden"
              icon={<ToggleIcon className="h-5 w-5" />}
            />
          ) : null}

          <Link
            href="/workspace/overview"
            className="flex items-center gap-2.5"
          >
            <Image
              src="https://cdn.genfeed.ai/assets/branding/logo-white.png"
              alt="Genfeed"
              width={24}
              height={24}
              className="h-6 w-auto"
              unoptimized
            />
            <div className="leading-tight">
              <span className="text-[10px] font-medium uppercase tracking-[0.2em] text-muted-foreground">
                Core OSS
              </span>
            </div>
          </Link>
        </div>

        <div className="flex items-center gap-1">
          <Button
            variant={ButtonVariant.GHOST}
            size={ButtonSize.ICON}
            ariaLabel="Toggle theme"
            onClick={() => setTheme(isDark ? 'light' : 'dark')}
            className={cn(
              'flex h-8 w-8 items-center justify-center text-muted-foreground',
              'hover:bg-white/[0.06] hover:text-foreground',
            )}
            icon={
              mounted ? (
                isDark ? (
                  <Sun className="h-4 w-4" />
                ) : (
                  <Moon className="h-4 w-4" />
                )
              ) : undefined
            }
          />
        </div>
      </div>
    </header>
  );
}
