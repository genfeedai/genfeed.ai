'use client';

import {
  FaDiscord,
  FaInstagram,
  FaTelegram,
  FaXTwitter,
} from 'react-icons/fa6';

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
      icon: FaXTwitter,
      label: 'X/Twitter',
      url: `https://x.com/${twitterHandle}`,
    },
    {
      handle: instagramHandle,
      icon: FaInstagram,
      label: 'Instagram',
      url: `https://instagram.com/${instagramHandle}`,
    },
    {
      handle: discordHandle,
      icon: FaDiscord,
      label: 'Discord',
      url: `https://discord.com/users/${discordHandle}`,
    },
    {
      handle: telegramHandle,
      icon: FaTelegram,
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
          title={`${link.label}: @${link.handle}`}
        >
          <link.icon className="h-4 w-4" />
        </a>
      ))}
    </div>
  );
}
