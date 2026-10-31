import { BEST_LISTS } from '@data/best-lists.data';
import Card from '@ui/card/Card';
import MarketingArtwork from '@web-components/content/MarketingArtwork';
import MarketingEntrance from '@web-components/MarketingEntrance';
import PageLayout from '@web-components/PageLayout';
import Link from 'next/link';

export default function BestHubContent() {
  return (
    <MarketingEntrance sections={false}>
      <PageLayout
        heroMedia={<MarketingArtwork page="/vs" kind="research" />}
        title="Best AI content tools"
        description="Guides to AI tools for content creation, grouped by the job they do. Each links to a side-by-side comparison with Genfeed."
      >
        <section className="container mx-auto px-6 py-20 gsap-hero">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 gsap-grid">
            {BEST_LISTS.map((list) => (
              <Card key={list.slug} className="flex flex-col gsap-card">
                <h2 className="text-lg font-semibold">{list.heading}</h2>
                <p className="text-sm gen-text-muted mt-1">{list.intro}</p>
                <div className="mt-auto pt-4">
                  <Link
                    href={`/best/${list.slug}`}
                    className="text-sm font-semibold text-primary hover:underline"
                  >
                    Read the guide &rarr;
                  </Link>
                </div>
              </Card>
            ))}
          </div>
        </section>
      </PageLayout>
    </MarketingEntrance>
  );
}
