'use client';

import { ButtonVariant } from '@genfeedai/enums';
import Card from '@ui/card/Card';
import Container from '@ui/layout/container/Container';
import { Button } from '@ui/primitives/button';
import Link from 'next/link';
import { HiArrowLeft } from 'react-icons/hi2';

type Props = {
  type: string;
};

export default function IngredientDetailNotFound({ type }: Props) {
  return (
    <Container>
      <Card className="text-center">
        <h3 className="text-lg font-bold mb-4">Ingredient Not Found</h3>
        <p className="text-foreground/70 mb-6">
          The ingredient you&apos;re looking for doesn&apos;t exist or has been
          deleted.
        </p>

        <Button
          asChild
          className="inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm font-medium bg-primary text-primary-foreground shadow hover:bg-primary/90 h-9 px-4 py-2"
          variant={ButtonVariant.UNSTYLED}
          withWrapper={false}
        >
          <Link href={`/ingredients/${type}`}>
            <HiArrowLeft /> Back to {type}
          </Link>
        </Button>
      </Card>
    </Container>
  );
}
