'use client';

import { GENFEED_BRAND_HANDLE } from '@genfeedai/contracts/constants';
import type { IPublicNewsletterArchive } from '@genfeedai/contracts/interfaces';
import { Heading } from '@ui/typography/heading';
import { Text } from '@ui/typography/text';
import NewsletterIssueMeta from '@web-components/newsletter/NewsletterIssueMeta';
import NewsletterSubscribeForm from '@web-components/newsletter/NewsletterSubscribeForm';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { loadPublicService } from '../../api/load-public-service';

/**
 * Genfeed's own newsletter, sent from the same module customers use (#9728).
 * The latest issue loads after the page does, so the homepage stays static;
 * without it the section is still a working sign-up.
 */
export default function HomeNewsletter(): React.ReactElement {
  const [archive, setArchive] = useState<IPublicNewsletterArchive | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    async function loadLatestIssue() {
      try {
        const service = await loadPublicService();
        const brand =
          await service.findPublicProfileBySlug(GENFEED_BRAND_HANDLE);
        if (!brand || controller.signal.aborted) return;
        const result = await service.findNewsletterArchive(brand.id);
        if (!controller.signal.aborted) setArchive(result);
      } catch {
        // The sign-up works without the latest issue.
      }
    }

    void loadLatestIssue();
    return () => controller.abort();
  }, []);

  const latestIssue = archive?.issues[0] ?? null;

  return (
    <section
      aria-labelledby="home-newsletter-heading"
      className="gen-section-spacing-lg border-b border-foreground/5"
      id="newsletter"
    >
      <div className="container mx-auto grid gap-12 px-6 lg:grid-cols-2 lg:items-center">
        <div className="flex flex-col gap-4" data-reveal="up">
          <Heading
            as="h2"
            className="text-5xl font-semibold leading-tight tracking-[-0.02em] sm:text-6xl"
            id="home-newsletter-heading"
          >
            The Genfeed newsletter.
          </Heading>
          <Text className="max-w-xl text-base leading-7 gen-text-muted">
            What we shipped, what worked on our own feeds, and the workflows
            behind it. Written and sent with Genfeed.
          </Text>
          <NewsletterSubscribeForm
            brandHandle={GENFEED_BRAND_HANDLE}
            brandId={archive?.brand.id}
            className="max-w-md"
            source="homepage"
          />
        </div>

        <aside
          aria-label="Latest issue"
          className="rounded-xl border border-foreground/10 bg-foreground/5 p-6"
          data-reveal="up"
        >
          <p className="text-xs text-muted-foreground">
            From {archive?.brand.label || 'Genfeed'}
          </p>
          {latestIssue ? (
            <div className="mt-4 space-y-3">
              <Heading
                as="h3"
                className="text-2xl font-semibold tracking-tight"
              >
                <Link
                  className="hover:underline underline-offset-4"
                  href={`/newsletter/${latestIssue.id}`}
                >
                  {latestIssue.subject}
                </Link>
              </Heading>
              {latestIssue.summary ? (
                <Text as="p" className="leading-7 text-muted-foreground">
                  {latestIssue.summary}
                </Text>
              ) : null}
              <NewsletterIssueMeta issue={latestIssue} />
            </div>
          ) : (
            <Text as="p" className="mt-4 leading-7 text-muted-foreground">
              One email when there is something worth reading. Unsubscribe in
              one click.
            </Text>
          )}
          <Link
            className="mt-6 inline-flex text-sm underline underline-offset-4"
            href="/newsletter"
          >
            Read past issues
          </Link>
        </aside>
      </div>
    </section>
  );
}
