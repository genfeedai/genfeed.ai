import type { Product } from '@data/products.data';
import { ButtonVariant } from '@genfeedai/enums';
import { EnvironmentService } from '@services/core/environment.service';
import Card from '@ui/card/Card';
import { Button } from '@ui/primitives/button';
import { Heading } from '@ui/typography/heading';
import { Text } from '@ui/typography/text';
import ButtonRequestAccess from '@web-components/buttons/request-access/button-request-access/ButtonRequestAccess';
import Link from 'next/link';
import { FaGithub } from 'react-icons/fa6';
import { GitHubLink } from './github-link';

type Props = {
  cta: Product['cta'];
  githubUrl: Product['githubUrl'];
  name: Product['name'];
  status: Product['status'];
};

export default function ProductFinalCTA({
  cta,
  githubUrl,
  name,
  status,
}: Props) {
  const bodyText =
    status && githubUrl
      ? `Join the ${status} program and help shape the future of ${name}.`
      : githubUrl
        ? 'Join thousands of creators building the future of AI content.'
        : 'Join thousands of creators using Genfeed to generate and publish AI content at scale.';

  return (
    <section className="max-w-4xl mx-auto pb-20">
      <Card bodyClassName="text-center">
        <Heading size="2xl" className="mb-4">
          Ready to Get Started with {name}?
        </Heading>
        <Text as="p" color="muted" className="mb-6">
          {bodyText}
        </Text>
        <div className="flex flex-col sm:flex-row items-center gap-4 justify-center">
          {status && githubUrl ? (
            <>
              <ButtonRequestAccess label={cta} />
              <GitHubLink href={githubUrl} variant={ButtonVariant.GHOST}>
                View Source
              </GitHubLink>
            </>
          ) : githubUrl ? (
            <Button asChild className="h-12 px-6 text-lg uppercase font-bold">
              <Link href={githubUrl} target="_blank" rel="noopener noreferrer">
                <FaGithub className="size-5" />
                View on GitHub →
              </Link>
            </Button>
          ) : (
            <Link
              href={`${EnvironmentService.apps.app}/sign-up`}
              className="text-primary hover:underline text-lg"
            >
              {cta} →
            </Link>
          )}
        </div>
      </Card>
    </section>
  );
}
