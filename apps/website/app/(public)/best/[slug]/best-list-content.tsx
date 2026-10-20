import { type BestList, getBestListEntries } from '@data/best-lists.data';
import Card from '@ui/card/Card';
import ButtonRequestAccess from '@web-components/buttons/request-access/button-request-access/ButtonRequestAccess';
import PageLayout from '@web-components/PageLayout';
import Link from 'next/link';

export default function BestListContent({ list }: { list: BestList }) {
  const entries = getBestListEntries(list);

  return (
    <PageLayout title={list.heading} description={list.description}>
      <section className="max-w-4xl mx-auto py-20">
        <p className="text-xl text-muted-foreground">{list.intro}</p>
        <p className="text-sm gen-text-muted mt-4">
          Published by Genfeed, so Genfeed is listed first. Each other entry
          links to our side-by-side comparison. Check each vendor's site for
          current pricing and features.
        </p>
      </section>

      <section className="max-w-4xl mx-auto pb-12">
        <Card label="How we compare">
          <ul className="space-y-2 text-left list-disc pl-5">
            {list.criteria.map((criterion) => (
              <li key={criterion} className="text-sm">
                {criterion}
              </li>
            ))}
          </ul>
        </Card>
      </section>

      <section className="max-w-4xl mx-auto pb-20">
        <ol className="space-y-6">
          <li>
            <Card label="1. Genfeed">
              <p className="text-sm">{list.genfeedSummary}</p>
              <p className="text-sm mt-3">
                <strong>Pick it when:</strong> {list.genfeedBestFor}
              </p>
              <div className="mt-4">
                <ButtonRequestAccess />
              </div>
            </Card>
          </li>
          {entries.map(({ competitor, position }) => (
            <li key={competitor.slug}>
              <Card label={`${position}. ${competitor.name}`}>
                <p className="text-sm">{competitor.tagline}.</p>
                <p className="text-sm mt-3">
                  <strong>Pick it when:</strong>{' '}
                  {competitor.whenToUseCompetitor}.
                </p>
                <Link
                  href={`/vs/${competitor.slug}`}
                  className="text-sm font-semibold text-primary hover:underline mt-3 inline-block"
                >
                  Genfeed vs {competitor.name} &rarr;
                </Link>
              </Card>
            </li>
          ))}
        </ol>
        {list.notCompared ? (
          <p className="text-sm gen-text-muted mt-6">{list.notCompared}</p>
        ) : null}
      </section>
    </PageLayout>
  );
}
