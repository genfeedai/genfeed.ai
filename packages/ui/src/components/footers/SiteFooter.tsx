'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import {
  DiscordIcon,
  InstagramIcon,
  TiktokIcon,
  XTwitterIcon,
  YoutubeIcon,
} from '@genfeedai/helpers/ui/icons/brands';
import { EnvironmentService } from '@genfeedai/services/core/environment.service';
import Card from '@ui/card/Card';
import ClientDateTime from '@ui/components/time/ClientDateTime';
import { Button } from '@ui/primitives';
import { Calendar, Mail } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import type { ComponentType } from 'react';

interface FooterLink {
  href: string;
  label: string;
  external?: boolean;
}

interface FooterSection {
  title: string;
  links: FooterLink[];
}

interface SocialLink {
  href: string;
  icon: ComponentType<{ className?: string }>;
  label: string;
}

type FooterVariant = 'default';

interface SiteFooterProps {
  sections: FooterSection[];
  socialLinks?: SocialLink[];
  showNewsletter?: boolean;
  showBookCall?: boolean;
  brandTagline?: string;
  /** Footer background variant */
  variant?: FooterVariant;
  /** Bottom-bar sitemap directory link label */
  sitemapLabel?: string;
}

const DEFAULT_SOCIAL_LINKS: SocialLink[] = [
  {
    href: EnvironmentService.social.youtube,
    icon: YoutubeIcon,
    label: 'YouTube',
  },
  { href: EnvironmentService.social.twitter, icon: XTwitterIcon, label: 'X' },
  {
    href: EnvironmentService.social.discord,
    icon: DiscordIcon,
    label: 'Discord',
  },
  {
    href: EnvironmentService.social.instagram,
    icon: InstagramIcon,
    label: 'Instagram',
  },
  {
    href: EnvironmentService.social.tiktok,
    icon: TiktokIcon,
    label: 'TikTok',
  },
];

const VARIANT_CLASSES: Record<FooterVariant, string> = {
  default: 'border-t border-border bg-background text-foreground',
};

export default function SiteFooter({
  sections,
  socialLinks = DEFAULT_SOCIAL_LINKS,
  showNewsletter = false,
  showBookCall = false,
  brandTagline = 'Genfeed drafts the posts, makes the images and video, and publishes on your schedule.',
  variant = 'default',
  sitemapLabel = 'Sitemap',
}: SiteFooterProps): React.ReactElement {
  return (
    <footer className={cn(VARIANT_CLASSES[variant], 'relative z-20 pt-14')}>
      <div className="container mx-auto px-6">
        <div className="mb-14 grid grid-cols-1 gap-12 lg:grid-cols-[minmax(220px,0.8fr)_minmax(0,2.2fr)]">
          {/* Brand Column */}
          <div>
            <Image
              src={EnvironmentService.logoURL}
              alt="Genfeed"
              width={120}
              height={20}
              className="mb-6 h-5 w-auto dark:invert"
            />

            <p className="mb-8 max-w-sm text-sm font-medium leading-6 text-muted-foreground">
              {brandTagline}
            </p>

            {/* Social icons */}
            <div className="flex gap-2">
              {socialLinks.map((social) => (
                <Link
                  key={social.label}
                  href={social.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
                  aria-label={social.label}
                >
                  <div className="flex size-9 items-center justify-center rounded-md text-muted-foreground transition-colors group-hover:bg-foreground/[0.06] group-hover:text-foreground">
                    <social.icon className="size-4" />
                  </div>
                </Link>
              ))}
            </div>
          </div>

          {/* Navigation + Newsletter */}
          <div className="grid grid-cols-2 gap-x-8 gap-y-10 sm:grid-cols-3 lg:grid-cols-5">
            {sections.map((section) => (
              <div key={section.title}>
                <h3 className="mb-4 text-xs font-semibold text-foreground">
                  {section.title}
                </h3>
                <ul className="space-y-3 text-sm text-muted-foreground">
                  {section.links.map((link) => (
                    <li key={link.href}>
                      <Link
                        href={link.href}
                        {...(link.external && {
                          rel: 'noopener noreferrer',
                          target: '_blank',
                        })}
                        className="transition-colors hover:text-foreground"
                      >
                        {link.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}

            {/* Newsletter Column */}
            {showNewsletter && (
              <div>
                <h3 className="mb-4 flex items-center gap-2 text-xs font-semibold text-foreground">
                  <Mail className="size-4" />
                  Newsletter
                </h3>
                <p className="mb-4 text-sm leading-6 text-muted-foreground">
                  AI content tips and product updates delivered weekly.
                </p>

                <Link
                  href={EnvironmentService.social.substack}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 text-sm font-semibold text-foreground underline underline-offset-4 transition-colors hover:text-foreground/80"
                >
                  Subscribe on Substack
                </Link>
              </div>
            )}
          </div>
        </div>

        {/* Book a Call CTA */}
        {showBookCall && (
          <Card className="mb-24" bodyClassName="p-12">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-8">
              <div className="flex items-center gap-6">
                <div className="flex size-16 items-center justify-center border border-border">
                  <Calendar className="size-7 text-foreground" />
                </div>

                <div>
                  <h3 className="mb-1 text-xl font-semibold uppercase tracking-wide text-foreground">
                    Want to chat?
                  </h3>

                  <p className="text-sm font-medium text-muted-foreground">
                    Schedule a 30-minute call to discuss your content needs.
                  </p>
                </div>
              </div>

              <Button
                size={ButtonSize.PUBLIC}
                variant={ButtonVariant.DEFAULT}
                asChild
              >
                <Link
                  href={EnvironmentService.calendly}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Book a Call
                </Link>
              </Button>
            </div>
          </Card>
        )}

        {/* Bottom Bar */}
        <div className="flex flex-col items-center justify-between gap-4 border-t border-border py-6 text-xs text-muted-foreground md:flex-row">
          <p>
            &copy;{' '}
            <ClientDateTime format={(date) => date.getFullYear().toString()} />{' '}
            GENFEED.AI. ALL RIGHTS RESERVED.
          </p>

          <div className="flex flex-wrap justify-center gap-6">
            <Link
              href="/terms"
              className="transition-colors hover:text-foreground"
            >
              Terms
            </Link>

            <Link
              href="/privacy"
              className="transition-colors hover:text-foreground"
            >
              Privacy
            </Link>

            <Link
              href="/sitemap"
              className="transition-colors hover:text-foreground"
            >
              {sitemapLabel}
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}

export type { FooterSection, FooterVariant, SiteFooterProps, SocialLink };
