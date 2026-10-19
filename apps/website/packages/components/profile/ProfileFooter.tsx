'use client';

import { useThemeLogo } from '@hooks/ui/use-theme-logo/use-theme-logo';
import ProfileSignupCta from '@web-components/profile/ProfileSignupCta';
import Image from 'next/image';
import Link from 'next/link';

interface ProfileFooterProps {
  handle: string;
  referralCode?: string | null;
}

export default function ProfileFooter({
  handle,
  referralCode,
}: ProfileFooterProps) {
  const logoUrl = useThemeLogo();

  return (
    <footer className="flex flex-col items-center gap-8 pt-8 pb-4 text-center">
      <ProfileSignupCta handle={handle} referralCode={referralCode} />

      <Link
        href="/"
        className="flex flex-col items-center gap-3 text-surface/55 hover:text-surface/75 transition-colors"
      >
        {logoUrl && (
          <Image
            src={logoUrl}
            alt="Genfeed"
            width={40}
            height={40}
            className="h-auto object-contain dark:invert"
          />
        )}
        <span className="text-sm">Create content with Genfeed</span>
      </Link>
    </footer>
  );
}
