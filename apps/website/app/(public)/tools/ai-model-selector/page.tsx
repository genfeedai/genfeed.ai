import {
  MODEL_SELECTOR_DESCRIPTION,
  MODEL_SELECTOR_FAQ,
  MODEL_SELECTOR_PATH,
  MODEL_SELECTOR_TITLE,
  modelSelectorJsonLd,
} from '@data/ai-model-selector';
import { stringifyJsonLd } from '@data/json-ld';
import { getPublicModels } from '@public/models/models-loader';
import AiModelSelectorContent from '@public/tools/ai-model-selector/ai-model-selector-content';
import { SiteFooter } from '@ui/footers';
import { WEBSITE_SECTIONS } from '@web-components/home/_footer';
import { createPageMetadataWithCanonical } from '@web-components/og/marketing-metadata';
import Link from 'next/link';

export const revalidate = 300;
export const generateMetadata = createPageMetadataWithCanonical(
  MODEL_SELECTOR_TITLE,
  MODEL_SELECTOR_DESCRIPTION,
  MODEL_SELECTOR_PATH,
);

export default async function AiModelSelectorPage(): Promise<React.ReactElement> {
  const models = await getPublicModels();
  return (
    <>
      <script type="application/ld+json">
        {stringifyJsonLd(modelSelectorJsonLd())}
      </script>
      <div className="container mx-auto max-w-6xl px-6 py-10 sm:py-14">
        <nav
          aria-label="Breadcrumb"
          className="mb-6 flex flex-wrap gap-2 text-sm text-muted-foreground"
        >
          <Link className="underline-offset-4 hover:underline" href="/">
            Genfeed
          </Link>
          <span aria-hidden="true">/</span>
          <Link className="underline-offset-4 hover:underline" href="/tools">
            Free AI tools
          </Link>
          <span aria-hidden="true">/</span>
          <span aria-current="page">AI model selector</span>
        </nav>
        <header className="mb-8 max-w-3xl">
          <p className="mb-3 text-sm text-muted-foreground">
            Free tool · No signup · Instant matches
          </p>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-5xl">
            Free AI model selector for content creation
          </h1>
          <p className="mt-4 text-base leading-7 text-muted-foreground">
            Find AI models for images, video, writing, voice, and music. Choose
            a format and compare live catalog matches by cost, speed, or
            quality.
          </p>
        </header>
        <AiModelSelectorContent models={models} />
        <section
          aria-labelledby="model-guide"
          className="mt-16 border-t border-border pt-10"
        >
          <h2 className="text-2xl font-semibold" id="model-guide">
            How to choose an AI model for content
          </h2>
          <div className="mt-6 grid gap-6 sm:grid-cols-3">
            <div>
              <h3 className="text-lg font-semibold">Start with the output</h3>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                A writing model cannot replace an image generator. Choose your
                content format first, then narrow image or video models by
                recorded aspect ratios for your channel.
              </p>
            </div>
            <div>
              <h3 className="text-lg font-semibold">Compare the trade-offs</h3>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                Use lower-cost models to explore ideas, speed tiers to shortlist
                faster drafts, and quality tiers to explore final assets. These
                labels describe the registry, not a guarantee about your output.
              </p>
            </div>
            <div>
              <h3 className="text-lg font-semibold">Test a small draft</h3>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                Run the same brief on your shortlist. Review instruction
                following, brand fit, usable output, and actual credit cost
                before scaling a campaign. Keep human approval before
                publishing.
              </p>
            </div>
          </div>
          <div className="mt-8 flex flex-wrap gap-x-6 gap-y-3 text-sm">
            <Link className="underline underline-offset-4" href="/models">
              Browse all AI models
            </Link>
            <Link className="underline underline-offset-4" href="/benchmark">
              Compare model benchmark evidence
            </Link>
            <Link
              className="underline underline-offset-4"
              href="/tools/youtube-long-form"
            >
              Turn YouTube into an article
            </Link>
            <Link
              className="underline underline-offset-4"
              href="/tools/youtube-clips"
            >
              Find clips in a YouTube transcript
            </Link>
          </div>
        </section>
        <section
          aria-labelledby="model-faq"
          className="mt-14 border-t border-border pt-10"
        >
          <h2 className="text-2xl font-semibold" id="model-faq">
            AI model selector FAQ
          </h2>
          <dl className="mt-6 grid gap-6 sm:grid-cols-2">
            {MODEL_SELECTOR_FAQ.map(({ question, answer }) => (
              <div key={question}>
                <dt className="text-base font-semibold">{question}</dt>
                <dd className="mt-2 text-sm leading-6 text-muted-foreground">
                  {answer}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      </div>
      <SiteFooter sections={WEBSITE_SECTIONS} />
    </>
  );
}
