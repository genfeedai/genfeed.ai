import path from 'node:path';
import type { Metadata } from 'next';
import { generateStaticParamsFor, importPage } from 'nextra/pages';
import { resolveDescription, toCanonicalUrl } from '../../lib/page-metadata';
import { useMDXComponents as getMDXComponents } from '../../mdx-components';

export const generateStaticParams = generateStaticParamsFor('mdxPath');

/** Nextra resolves content relative to the app root, and so do we. */
const CONTENT_DIR = path.join(process.cwd(), 'content');

/**
 * Nextra returns only what the page's frontmatter and first heading provide, so
 * every route inherited one layout-level description and no canonical tag. Fill
 * both in per page — see ../../lib/page-metadata.ts.
 */
export async function generateMetadata(props: {
  params: Promise<{ mdxPath?: string[] }>;
}): Promise<Metadata> {
  const params = await props.params;
  const { metadata } = await importPage(params.mdxPath);
  const canonical = toCanonicalUrl(params.mdxPath);
  const description = resolveDescription(
    params.mdxPath,
    CONTENT_DIR,
    metadata.description,
  );

  return {
    ...metadata,
    alternates: { ...metadata.alternates, canonical },
    description,
    openGraph: {
      ...metadata.openGraph,
      description,
      title: metadata.title ?? undefined,
      url: canonical,
    },
  };
}

const Wrapper = getMDXComponents().wrapper;

export default async function Page(props: {
  params: Promise<{ mdxPath?: string[] }>;
}) {
  const params = await props.params;
  const result = await importPage(params.mdxPath);
  const { default: MDXContent, ...rest } = result;
  return (
    <Wrapper {...rest}>
      <MDXContent {...props} params={params} />
    </Wrapper>
  );
}
