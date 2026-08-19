'use client';

import {
  DEFAULT_THEME,
  isThemePreference,
  type ThemePreference,
} from '@genfeedai/constants';
import { ButtonVariant } from '@genfeedai/enums';
import { Button } from '@ui/primitives/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@ui/primitives/dropdown-menu';
import { Check, Laptop, Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';

const THEME_LABELS: Record<ThemePreference, string> = {
  dark: 'Dark',
  light: 'Light',
  system: 'System',
};

const THEME_OPTIONS = [
  { icon: Laptop, label: 'System', value: 'system' },
  { icon: Sun, label: 'Light', value: 'light' },
  { icon: Moon, label: 'Dark', value: 'dark' },
] as const;

export default function ThemeMenu() {
  const { setTheme, theme } = useTheme();
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => setIsMounted(true), []);

  const preference =
    isMounted && isThemePreference(theme) ? theme : DEFAULT_THEME;
  const ActiveIcon =
    preference === 'dark' ? Moon : preference === 'light' ? Sun : Laptop;

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button
          ariaLabel={`Appearance: ${THEME_LABELS[preference]}`}
          className="inline-flex size-9 items-center justify-center rounded-full text-foreground/65 transition-colors hover:bg-foreground/[0.06] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          variant={ButtonVariant.UNSTYLED}
          withWrapper={false}
        >
          <ActiveIcon aria-hidden="true" className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-40">
        <DropdownMenuLabel className="text-muted-foreground">
          Appearance
        </DropdownMenuLabel>
        {THEME_OPTIONS.map((option) => {
          const Icon = option.icon;
          const isSelected = preference === option.value;

          return (
            <DropdownMenuItem
              aria-checked={isSelected}
              className="gap-2"
              key={option.value}
              onSelect={() => setTheme(option.value)}
              role="menuitemradio"
            >
              <Icon aria-hidden="true" className="size-4" />
              <span className="flex-1">{option.label}</span>
              {isSelected ? (
                <Check aria-hidden="true" className="size-4" />
              ) : null}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
