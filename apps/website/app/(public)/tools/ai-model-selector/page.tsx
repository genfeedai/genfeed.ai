import {
  MODEL_SELECTOR_DESCRIPTION,
  MODEL_SELECTOR_FAQ,
  MODEL_SELECTOR_PATH,
  MODEL_SELECTOR_TITLE,
  modelSelectorJsonLd,
} from '@data/ai-model-selector';
import { stringifyJsonLd } from '@data/json-ld';
import { getBenchmarkData } from '@public/benchmark/benchmark-loader';
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
  const [models, benchmark] = await Promise.all([
    getPublicModels(),
    getBenchmarkData(),
  ]);
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
            Free AI model selector
          </h1>
          <p className="mt-4 text-base leading-7 text-muted-foreground">
            Choose what to create. Find your model.
          </p>
        </header>
        <AiModelSelectorContent benchmark={benchmark} models={models} />
        <nav
          aria-label="Related tools"
          className="mt-10 flex flex-wrap gap-x-6 gap-y-3 text-sm text-muted-foreground"
        >
          <Link className="underline underline-offset-4" href="/models">
            Browse all AI models
          </Link>
          <Link
            className="underline underline-offset-4"
            href="/tools/youtube-long-form"
          >
            YouTube to article
          </Link>
          <Link
            className="underline underline-offset-4"
            href="/tools/youtube-clips"
          >
            YouTube clips
          </Link>
        </nav>
        <section
          aria-labelledby="model-faq"
          className="mt-10 border-t border-border pt-6"
        >
          <h2 className="text-2xl font-semibold" id="model-faq">
            AI model selector FAQ
          </h2>
          <dl className="mt-4 grid gap-4 sm:grid-cols-3">
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
