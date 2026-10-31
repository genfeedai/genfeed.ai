import type { Product } from '@data/products.data';
import Card from '@ui/card/Card';
import { Heading } from '@ui/typography/heading';
import { Text } from '@ui/typography/text';

type Props = {
  librarySections: NonNullable<Product['librarySections']>;
};

export default function ProductAgentLibrary({ librarySections }: Props) {
  return (
    <section className="max-w-6xl mx-auto pb-20">
      <Heading size="2xl" className="text-center mb-12">
        Agent Library
      </Heading>
      <div className="space-y-8">
        {librarySections.map((section) => (
          <Card key={section.title} label={section.title}>
            <div className="space-y-6">
              {section.description ? (
                <Text as="p" color="muted">
                  {section.description}
                </Text>
              ) : null}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {section.agents.map((agent) => (
                  <div
                    key={agent.name}
                    className="border border-border bg-background p-4"
                  >
                    <Text weight="bold" className="mb-2">
                      {agent.name}
                    </Text>
                    <Text as="p" size="sm" color="muted">
                      {agent.description}
                    </Text>
                  </div>
                ))}
              </div>
            </div>
          </Card>
        ))}
      </div>
    </section>
  );
}
