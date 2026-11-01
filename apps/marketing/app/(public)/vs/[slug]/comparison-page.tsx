import type { Competitor } from '@data/competitors.data';
import Card from '@ui/card/Card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@ui/primitives/table';
import ButtonRequestAccess from '@web-components/buttons/request-access/button-request-access/ButtonRequestAccess';
import MarketingArtwork from '@web-components/content/MarketingArtwork';
import PageLayout from '@web-components/PageLayout';
import { Check, X } from 'lucide-react';
import Link from 'next/link';

interface ComparisonCellProps {
  value: boolean | string;
  isBold?: boolean;
}

function ComparisonCell({
  value,
  isBold = false,
}: ComparisonCellProps): React.ReactElement {
  if (typeof value === 'boolean') {
    return value ? (
      <Check className="size-4 text-success mx-auto" />
    ) : (
      <X className="size-4 text-destructive mx-auto" />
    );
  }
  return (
    <span className={`text-sm${isBold ? ' font-semibold' : ''}`}>{value}</span>
  );
}

export default function ComparisonPage({
  competitor,
}: {
  competitor: Competitor;
}) {
  return (
    <PageLayout
      heroMedia={<MarketingArtwork page="/vs/*" />}
      title={`Genfeed vs ${competitor.name}`}
      description={`Why Genfeed tracks revenue and ${competitor.name} doesn't. Compare features and pricing.`}
    >
      <section className="max-w-4xl mx-auto py-20 text-center">
        <h2 className="text-5xl font-semibold mb-4">
          Genfeed vs {competitor.name}
        </h2>
        <p className="text-xl text-muted-foreground">{competitor.tagline}</p>
      </section>

      <section className="max-w-5xl mx-auto pb-20">
        <Table className="table table-zebra w-full">
          <TableHeader>
            <TableRow>
              <TableHead className="text-lg">Feature</TableHead>
              <TableHead className="text-lg text-center">
                {competitor.name}
              </TableHead>
              <TableHead className="text-lg text-center bg-primary/10">
                Genfeed
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {competitor.comparisonTable.map(
              (row: (typeof competitor.comparisonTable)[0]) => (
                <TableRow key={row.feature}>
                  <TableCell className="font-semibold">{row.feature}</TableCell>
                  <TableCell className="text-center">
                    <ComparisonCell value={row.competitor} />
                  </TableCell>
                  <TableCell className="text-center bg-primary/5">
                    <ComparisonCell value={row.genfeed} isBold />
                  </TableCell>
                </TableRow>
              ),
            )}
          </TableBody>
        </Table>
      </section>

      <section className="max-w-4xl mx-auto pb-20">
        <h2 className="text-3xl font-semibold mb-6 text-center">
          Which one fits your work
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card label={`Choose ${competitor.name} when`}>
            <p className="text-sm">{competitor.whenToUseCompetitor}.</p>
            <p className="text-sm gen-text-muted mt-3">
              Built for: {competitor.targetAudience}
            </p>
            <p className="text-sm gen-text-muted mt-1">
              Pricing: {competitor.pricing}
            </p>
          </Card>
          <Card label="Choose Genfeed when">
            <p className="text-sm">{competitor.whenToUseGenFeed}.</p>
            <p className="text-sm gen-text-muted mt-3">
              Free to start, pay per output, or self-host the open-source
              Community build under AGPL-3.0.
            </p>
          </Card>
        </div>
      </section>

      <section className="max-w-4xl mx-auto pb-20">
        <Card label={`What ${competitor.name} does well`}>
          <ul className="space-y-2 text-left">
            {competitor.strengths.map((strength: string) => (
              <li key={strength} className="flex items-start gap-2">
                <Check className="size-4 text-success mt-1 flex-shrink-0" />
                <span className="text-sm">{strength}</span>
              </li>
            ))}
          </ul>
        </Card>
      </section>

      <section className="max-w-4xl mx-auto pb-20">
        <Card label="Why Genfeed" isCentered>
          <ul className="space-y-2 mb-6 text-left max-w-md mx-auto">
            {competitor.genfeedAdvantages.map((advantage: string) => (
              <li key={advantage} className="flex items-start gap-2">
                <Check className="size-4 text-success mt-1 flex-shrink-0" />
                <span className="text-sm">{advantage}</span>
              </li>
            ))}
          </ul>
          <ButtonRequestAccess />
          <Link href="/pricing" className="link mt-4 block">
            View Pricing
          </Link>
        </Card>
      </section>
    </PageLayout>
  );
}
