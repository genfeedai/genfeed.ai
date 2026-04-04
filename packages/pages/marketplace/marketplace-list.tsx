'use client';

import type { LayoutProps } from '@props/layout/layout.props';
import { EnvironmentService } from '@services/core/environment.service';
import Container from '@ui/layout/container/Container';
import Image from 'next/image';
import Link from 'next/link';
import type { ReactNode } from 'react';
import {
  HiChevronRight,
  HiCodeBracket,
  HiDocumentText,
  HiLightBulb,
  HiMusicalNote,
  HiOutlinePhoto,
  HiPhoto,
  HiTrophy,
  HiVideoCamera,
} from 'react-icons/hi2';

const MARKETPLACE_ITEMS = [
  {
    bgImage: `${EnvironmentService.assetsEndpoint}/placeholders/portrait.jpg`,
    description: 'Browse our collection of AI-generated videos',
    href: '/videos',
    icon: <HiVideoCamera className="text-5xl" />,
    label: 'Videos',
  },
  {
    bgImage: `${EnvironmentService.assetsEndpoint}/placeholders/landscape.jpg`,
    description: 'Explore stunning AI-generated images',
    href: '/images',
    icon: <HiPhoto className="text-5xl" />,
    label: 'Images',
  },
  {
    bgImage: `${EnvironmentService.assetsEndpoint}/placeholders/square.jpg`,
    description: 'Listen to AI-composed music',
    href: '/music',
    icon: <HiMusicalNote className="text-5xl" />,
    label: 'Music',
  },
  {
    bgImage: `${EnvironmentService.assetsEndpoint}/placeholders/landscape.jpg`,
    description: 'Read AI-generated articles and content',
    href: '/posts',
    icon: <HiDocumentText className="text-5xl" />,
    label: 'Posts',
  },
  {
    bgImage: `${EnvironmentService.assetsEndpoint}/placeholders/portrait.jpg`,
    description: 'Most viewed video posts',
    href: '/leaderboard',
    icon: <HiTrophy className="text-5xl" />,
    label: 'Leaderboard',
  },
  {
    bgImage: `${EnvironmentService.assetsEndpoint}/placeholders/square.jpg`,
    description: 'Expertly crafted prompts for AI generation',
    href: '/prompts',
    icon: <HiLightBulb className="text-5xl" />,
    label: 'Prompts',
  },
  {
    bgImage: `${EnvironmentService.assetsEndpoint}/placeholders/landscape.jpg`,
    description: 'Automated content workflows ready to deploy',
    href: '/workflows',
    icon: <HiCodeBracket className="text-5xl" />,
    label: 'Workflows',
  },
];

export default function MarketplaceList({ children }: LayoutProps): ReactNode {
  return (
    <Container
      label="Marketplace"
      description="Browse AI content across categories."
      icon={HiOutlinePhoto}
      className="px-4 py-8"
    >
      <div className="text-center mb-12">
        <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold mb-4">
          Marketplace
        </h1>
        <p className="text-lg text-foreground/70">
          Explore our collection of AI-generated content
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
        {MARKETPLACE_ITEMS.map((item, index) => (
          <Link key={index} href={item.href} className="group">
            <div className="h-48 sm:h-60 md:h-72 relative overflow-hidden transform transition-all duration-300 hover:shadow-2xl bg-background">
              <figure className="absolute inset-0">
                <Image
                  src={item.bgImage}
                  alt={item.label}
                  fill
                  sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
                  className="object-cover transition-transform duration-500"
                  priority={index < 3}
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black via-black/50 to-transparent" />
              </figure>

              <div className="relative z-10 flex flex-col justify-end text-white p-6 h-full">
                <div className="transform transition-transform duration-300 group-hover:translate-y-0 translate-y-2">
                  <div className="mb-4 transform transition-all duration-300">
                    {item.icon}
                  </div>
                  <h3 className="text-lg sm:text-xl md:text-2xl font-bold mb-2">
                    {item.label}
                  </h3>
                  <p className="text-sm text-white/90 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                    {item.description}
                  </p>
                </div>
              </div>

              <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                <div className="bg-white/20 backdrop-blur-sm rounded-full p-2">
                  <HiChevronRight className="w-4 h-4 text-white" />
                </div>
              </div>
            </div>
          </Link>
        ))}
      </div>

      {children && <div className="mt-12">{children}</div>}
    </Container>
  );
}
