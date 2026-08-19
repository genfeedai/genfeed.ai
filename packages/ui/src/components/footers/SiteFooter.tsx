'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/enums';
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
  brandTagline = 'The premier destination for high-performance creative assets. Redefining the boundaries of content generation.',
  variant = 'default',
}: SiteFooterProps): React.ReactElement {
  return (
    <footer className={cn(VARIANT_CLASSES[variant], 'pt-20 relative z-20')}>
      <div className="container mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_3fr] gap-16 mb-24">
          {/* Brand Column */}
          <div>
            <Image
              src={EnvironmentService.logoURL}
              alt="Genfeed"
              width={120}
              height={20}
              className="mb-10 h-5 w-auto dark:invert"
            />

            <p className="mb-12 max-w-sm font-medium leading-relaxed text-muted-foreground">
              {brandTagline}
            </p>

            {/* Social icons */}
            <div className="flex gap-5">
              {socialLinks.map((social) => (
                <Link
                  key={social.label}
                  href={social.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group"
                  aria-label={social.label}
                >
                  <div className="flex size-12 items-center justify-center border border-border transition-all duration-300 ease-out group-hover:border-foreground group-hover:bg-foreground">
                    <social.icon className="size-5 text-muted-foreground transition-colors duration-300 ease-out group-hover:text-background" />
                  </div>
                </Link>
              ))}
            </div>
          </div>

          {/* Navigation + Newsletter */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-12">
            {sections.map((section) => (
              <div key={section.title}>
                <h4 className="text-[10px] font-semibold uppercase tracking-[0.3em] mb-10">
                  {section.title}
                </h4>
                <ul className="space-y-6 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
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
                <h4 className="text-[10px] font-semibold uppercase tracking-[0.3em] mb-10 flex items-center gap-2">
                  <Mail className="size-4" />
                  Newsletter
                </h4>
                <p className="mb-6 text-sm font-medium leading-relaxed text-muted-foreground">
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
                  <h4 className="mb-1 text-xl font-semibold uppercase tracking-wide text-foreground">
                    Want to chat?
                  </h4>

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
        <div className="flex flex-col items-center justify-between border-t border-border py-10 text-xs font-black text-foreground/30 md:flex-row">
          <p>
            &copy;{' '}
            <ClientDateTime format={(date) => date.getFullYear().toString()} />{' '}
            GENFEED.AI. ALL RIGHTS RESERVED.
          </p>

          <div className="flex flex-wrap justify-center gap-10">
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
          </div>
        </div>
      </div>
    </footer>
  );
}

export type { FooterSection, FooterVariant, SiteFooterProps, SocialLink };
