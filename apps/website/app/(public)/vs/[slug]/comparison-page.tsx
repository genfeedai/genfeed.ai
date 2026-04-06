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
import PageLayout from '@web-components/PageLayout';
import Link from 'next/link';
import { FaCheck } from 'react-icons/fa6';
import { HiXMark } from 'react-icons/hi2';

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
      <FaCheck className="w-4 h-4 text-success mx-auto" />
    ) : (
      <HiXMark className="w-4 h-4 text-error mx-auto" />
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
      title={`Genfeed vs ${competitor.name}`}
      description={`Why Genfeed tracks revenue and ${competitor.name} doesn't. Compare features and pricing.`}
    >
      <section className="max-w-4xl mx-auto py-20 text-center">
        <h1 className="text-5xl font-bold mb-4">
          Genfeed vs {competitor.name}
        </h1>
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
        <Card label="Why Genfeed" bodyClassName="text-center">
          <ul className="space-y-2 mb-6 text-left max-w-md mx-auto">
            {competitor.genfeedAdvantages.map((advantage: string) => (
              <li key={advantage} className="flex items-start gap-2">
                <FaCheck className="w-4 h-4 text-success mt-1 flex-shrink-0" />
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
