'use client';

import { APP_ROUTES } from '@genfeedai/contracts/constants';
import NotFoundState from '@ui/feedback/NotFoundState';
import Container from '@ui/layout/container/Container';

type Props = {
  type: string;
};

export default function IngredientDetailNotFound({ type }: Props) {
  return (
    <Container>
      <NotFoundState
        backLinkHref={`${APP_ROUTES.ADMIN.CONTENT.INGREDIENTS}/${type}`}
        backLinkLabel={`Back to ${type}`}
        message="The ingredient you're looking for doesn't exist or has been deleted."
        title="Ingredient Not Found"
      />
    </Container>
  );
}
