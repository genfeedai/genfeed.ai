'use client';

import { ButtonSize, ButtonVariant, CardVariant } from '@genfeedai/enums';
import { cn } from '@helpers/formatting/cn/cn.util';
import { EnvironmentService } from '@services/core/environment.service';
import Card from '@ui/card/Card';
import { Button } from '@ui/primitives';
import Image from 'next/image';
import Link from 'next/link';
import type { ComponentType } from 'react';
import {
  FaDiscord,
  FaInstagram,
  FaTiktok,
  FaXTwitter,
  FaYoutube,
} from 'react-icons/fa6';
import { HiCalendarDays, HiEnvelope } from 'react-icons/hi2';

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
    icon: FaYoutube,
    label: 'YouTube',
  },
  { href: EnvironmentService.social.twitter, icon: FaXTwitter, label: 'X' },
  {
    href: EnvironmentService.social.discord,
    icon: FaDiscord,
    label: 'Discord',
  },
  {
    href: EnvironmentService.social.instagram,
    icon: FaInstagram,
    label: 'Instagram',
  },
  {
    href: EnvironmentService.social.tiktok,
    icon: FaTiktok,
    label: 'TikTok',
  },
];

const VARIANT_CLASSES: Record<FooterVariant, string> = {
  default: 'bg-black border-t border-white/5 dark:border-white/[0.08]',
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
              className="h-5 invert mb-10"
              style={{ width: 'auto' }}
            />

            <p className="text-white/30 max-w-sm mb-12 leading-relaxed font-medium">
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
                  <div className="w-12 h-12 border border-white/[0.08] group-hover:border-white flex items-center justify-center group-hover:bg-white transition-all duration-300 ease-out">
                    <social.icon className="w-5 h-5 text-white/60 group-hover:text-black transition-colors duration-300 ease-out" />
                  </div>
                </Link>
              ))}
            </div>
          </div>

          {/* Navigation + Newsletter */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-12">
            {sections.map((section) => (
              <div key={section.title}>
                <h4 className="text-[10px] font-black uppercase tracking-[0.3em] mb-10">
                  {section.title}
                </h4>
                <ul className="space-y-6 text-xs text-white/30 font-bold uppercase tracking-widest">
                  {section.links.map((link) => (
                    <li key={link.href}>
                      <Link
                        href={link.href}
                        {...(link.external && {
                          rel: 'noopener noreferrer',
                          target: '_blank',
                        })}
                        className="hover:text-white transition-colors"
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
                <h4 className="text-[10px] font-black uppercase tracking-[0.3em] mb-10 flex items-center gap-2">
                  <HiEnvelope className="h-4 w-4" />
                  Newsletter
                </h4>
                <p className="text-sm text-white/30 mb-6 leading-relaxed font-medium">
                  AI content tips and product updates delivered weekly.
                </p>

                <Link
                  href={EnvironmentService.social.substack}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 text-sm font-semibold text-white hover:text-white/80 transition-colors underline underline-offset-4"
                >
                  Subscribe on Substack
                </Link>
              </div>
            )}
          </div>
        </div>

        {/* Book a Call CTA */}
        {showBookCall && (
          <Card
            variant={CardVariant.WHITE}
            className="mb-24"
            bodyClassName="p-12"
          >
            <div className="flex flex-col sm:flex-row items-center justify-between gap-8">
              <div className="flex items-center gap-6">
                <div className="w-16 h-16 border border-black/10 flex items-center justify-center">
                  <HiCalendarDays className="h-7 w-7 text-black" />
                </div>

                <div>
                  <h4 className="text-xl font-black uppercase tracking-wide mb-1 text-black">
                    Want to chat?
                  </h4>

                  <p className="text-black/50 text-sm font-medium">
                    Schedule a 30-minute call to discuss your content needs.
                  </p>
                </div>
              </div>

              <Button
                size={ButtonSize.PUBLIC}
                variant={ButtonVariant.BLACK}
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
        <div
          className="border-t border-white/5 flex flex-col md:flex-row 
        justify-between items-center text-xs text-white/20 font-black py-10"
        >
          <p>
            <span suppressHydrationWarning>
              &copy; {new Date().getFullYear()} GENFEED.AI. ALL RIGHTS RESERVED.
            </span>
          </p>

          <div className="flex flex-wrap justify-center gap-10">
            <Link href="/terms" className="hover:text-white transition-colors">
              Terms
            </Link>

            <Link
              href="/privacy"
              className="hover:text-white transition-colors"
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
