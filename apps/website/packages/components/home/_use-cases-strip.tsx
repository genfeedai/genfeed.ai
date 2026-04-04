'use client';

import Card from '@ui/card/Card';
import Link from 'next/link';
import {
  HiBuildingOffice2,
  HiChartBarSquare,
  HiMegaphone,
  HiShoppingCart,
  HiSquares2X2,
} from 'react-icons/hi2';
import { LuArrowRight } from 'react-icons/lu';

const USE_CASE_CARDS = [
  {
    description: 'Run approvals, publishing, and reporting across every client',
    href: '/agencies',
    icon: HiBuildingOffice2,
    label: 'Agencies',
  },
  {
    description:
      'Coordinate output across brands, channels, and campaign windows',
    href: '/use-cases/marketers',
    icon: HiSquares2X2,
    label: 'Multi-Brand Teams',
  },
  {
    description:
      'Turn research into paid and organic creative with KPI visibility',
    href: '/use-cases/marketers',
    icon: HiMegaphone,
    label: 'Performance Marketing',
  },
  {
    description: 'Produce campaign, product, and retention content at scale',
    href: '/use-cases/ecommerce',
    icon: HiShoppingCart,
    label: 'E-commerce',
  },
  {
    description:
      'Track output, throughput, and channel performance in one place',
    href: '/features',
    icon: HiChartBarSquare,
    label: 'Content Ops',
  },
];

export default function UseCasesStrip() {
  return (
    <section className="py-20 px-4">
      <div className="max-w-6xl mx-auto">
        <h2 className="text-3xl font-bold text-center mb-4">
          Built for teams running multiple brands
        </h2>
        <p className="text-center text-foreground/60 mb-12 max-w-2xl mx-auto">
          Agency operations, campaign production, and publishing workflows in
          one system.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          {USE_CASE_CARDS.map((uc) => {
            const Icon = uc.icon;
            return (
              <Link key={uc.label} href={uc.href} className="group">
                <Card className="h-full text-center transition-colors group-hover:border-primary/30">
                  <div className="flex justify-center mb-3">
                    <div className="rounded-xl bg-primary/10 p-3">
                      <Icon className="h-6 w-6 text-primary" />
                    </div>
                  </div>
                  <h3 className="font-semibold mb-1">{uc.label}</h3>
                  <p className="text-sm text-foreground/60 mb-3">
                    {uc.description}
                  </p>
                  <span className="inline-flex items-center gap-1 text-xs text-primary font-medium opacity-0 group-hover:opacity-100 transition-opacity">
                    Learn more <LuArrowRight className="h-3 w-3" />
                  </span>
                </Card>
              </Link>
            );
          })}
        </div>
      </div>
    </section>
  );
}
