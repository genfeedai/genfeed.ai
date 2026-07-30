'use client';

import {
  DiscordIcon,
  InstagramIcon,
  TelegramIcon,
  XTwitterIcon,
} from '@genfeedai/helpers/ui/icons/brands';

interface SocialLinksProps {
  twitterHandle?: string;
  instagramHandle?: string;
  discordHandle?: string;
  telegramHandle?: string;
  className?: string;
}

export default function SocialLinks({
  twitterHandle,
  instagramHandle,
  discordHandle,
  telegramHandle,
  className = '',
}: SocialLinksProps) {
  const links = [
    {
      handle: twitterHandle,
      icon: XTwitterIcon,
      label: 'X/Twitter',
      url: `https://x.com/${twitterHandle}`,
    },
    {
      handle: instagramHandle,
      icon: InstagramIcon,
      label: 'Instagram',
      url: `https://instagram.com/${instagramHandle}`,
    },
    {
      handle: discordHandle,
      icon: DiscordIcon,
      label: 'Discord',
      url: `https://discord.com/users/${discordHandle}`,
    },
    {
      handle: telegramHandle,
      icon: TelegramIcon,
      label: 'Telegram',
      url: `https://t.me/${telegramHandle}`,
    },
  ].filter((link) => link.handle);

  if (links.length === 0) {
    return null;
  }

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      {links.map((link) => (
        <a
          key={link.label}
          href={link.url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-foreground/50 transition-colors hover:text-foreground"
          aria-label={`${link.label}: @${link.handle}`}
          title={`${link.label}: @${link.handle}`}
        >
          <link.icon className="size-4" />
        </a>
      ))}
    </div>
  );
}
