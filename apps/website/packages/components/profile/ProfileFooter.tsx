'use client';

import { useThemeLogo } from '@hooks/ui/use-theme-logo/use-theme-logo';
import Image from 'next/image';
import Link from 'next/link';

export default function ProfileFooter() {
  const logoUrl = useThemeLogo();

  return (
    <div className="text-center pt-8 pb-4">
      <Link
        href="/"
        className="flex flex-col items-center gap-3 text-surface/40 hover:text-surface/60 transition-colors"
      >
        {logoUrl && (
          <Image
            src={logoUrl}
            alt="Genfeed"
            width={40}
            height={40}
            sizes="80px"
            className="object-contain dark:invert"
          />
        )}
        <span className="text-sm">Create content with Genfeed</span>
      </Link>
    </div>
  );
}
