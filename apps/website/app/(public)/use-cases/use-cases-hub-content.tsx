'use client';

import { useCases } from '@data/use-cases.data';
import { useMarketingEntrance } from '@hooks/ui/use-marketing-entrance';
import Card from '@ui/card/Card';
import PageLayout from '@web-components/PageLayout';
import Link from 'next/link';

export default function UseCasesHubContent() {
  const containerRef = useMarketingEntrance({ sections: false });

  return (
    <div ref={containerRef}>
      <PageLayout
        title="Genfeed Use Cases"
        description="See how creators, agencies, e-commerce brands, and founders put Genfeed to work."
      >
        <section className="container mx-auto px-6 py-20 gsap-hero">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 gsap-grid">
            {useCases.map((useCase) => (
              <Card key={useCase.slug} className="flex flex-col gsap-card">
                <h3 className="text-lg font-semibold">{useCase.subtitle}</h3>
                <p className="text-sm gen-text-muted mt-1">
                  {useCase.headline}
                </p>
                <p className="text-sm gen-text-muted mt-3">
                  {useCase.audience}
                </p>
                <div className="mt-auto pt-4">
                  <Link
                    href={`/use-cases/${useCase.slug}`}
                    className="text-sm font-semibold text-primary hover:underline"
                  >
                    Read the use case &rarr;
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
