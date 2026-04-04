'use client';

import { competitors } from '@data/competitors.data';
import { useMarketingEntrance } from '@hooks/ui/use-marketing-entrance';
import Card from '@ui/card/Card';
import PageLayout from '@web-components/PageLayout';
import Link from 'next/link';

export default function VsHubContent() {
  const containerRef = useMarketingEntrance({ sections: false });

  return (
    <div ref={containerRef}>
      <PageLayout
        title="Compare Genfeed"
        description="See how Genfeed compares to other AI content platforms. Choose the right tool for your needs."
      >
        <section className="container mx-auto px-6 py-20 gsap-hero">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 gsap-grid">
            {competitors.map((competitor) => (
              <Card key={competitor.slug} className="flex flex-col gsap-card">
                <h3 className="text-lg font-bold">{competitor.name}</h3>
                <p className="text-sm gen-text-muted mt-1">
                  {competitor.tagline}
                </p>
                <p className="text-sm gen-text-muted mt-3">
                  {competitor.pricing}
                </p>
                <div className="mt-auto pt-4">
                  <Link
                    href={`/vs/${competitor.slug}`}
                    className="text-sm font-semibold text-primary hover:underline"
                  >
                    Compare &rarr;
                  </Link>
                </div>
              </Card>
            ))}
          </div>
        </section>
      </PageLayout>
    </div>
  );
}
