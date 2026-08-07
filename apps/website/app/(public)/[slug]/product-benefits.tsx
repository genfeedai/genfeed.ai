import type { Product } from '@data/products.data';
import Card from '@ui/card/Card';
import { Heading } from '@ui/typography/heading';
import { Text } from '@ui/typography/text';
import { Check, X } from 'lucide-react';

type Props = {
  benefits: Product['benefits'];
};

export default function ProductBenefits({ benefits }: Props) {
  return (
    <section className="max-w-6xl mx-auto pb-20">
      <Heading size="2xl" className="text-center mb-12">
        Problems We Solve
      </Heading>
      <div className="flex flex-col gap-6">
        {benefits.map((benefit) => (
          <Card key={benefit.problem}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div>
                <div className="flex items-start gap-2 mb-2">
                  <X className="size-6 text-error mt-1 flex-shrink-0" />
                  <Text weight="bold" className="text-error">
                    Problem
                  </Text>
                </div>
                <Text as="p" color="muted" className="ml-8">
                  {benefit.problem}
                </Text>
              </div>
              <div>
                <div className="flex items-start gap-2 mb-2">
                  <Check className="size-6 text-success mt-1 flex-shrink-0" />
                  <Text weight="bold" className="text-success">
                    Solution
                  </Text>
                </div>
                <Text as="p" color="muted" className="ml-8">
                  {benefit.solution}
                </Text>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </section>
  );
}
