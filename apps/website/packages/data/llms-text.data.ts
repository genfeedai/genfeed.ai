/**
 * Content of the website's two LLM discovery files:
 * - `/llms.txt`      — compact index with links (spec: https://llmstxt.org),
 *   written to `public/` at build time by `scripts/generate-llms-txt.ts`.
 * - `/llms-full.txt` — comprehensive inline content, served by
 *   `app/llms-full.txt/route.ts` so its model list comes from the live public
 *   catalog (the same registry read as `/models`), never a hand-kept key list.
 */
import { renderAgentConnectMarkdown } from '@data/agent-clients.data';
import { FAQ_CATEGORIES } from '@data/faq.data';
import { integrations } from '@data/integrations.data';
import { products } from '@data/products.data';
import { useCases } from '@data/use-cases.data';
import { ModelCategory } from '@genfeedai/contracts';
import { PLAN_COPY, websitePlans } from '@genfeedai/pricing';
import { metadata } from '@helpers/media/metadata/metadata.helper';
import type { PublicModelCatalogItem } from '@public/models/models-loader';

const BASE_URL = 'https://genfeed.ai';
const PRICING_SUMMARY = `${PLAN_COPY.pro.name} (${PLAN_COPY.pro.priceLabel} + PAYG output), ${PLAN_COPY.scale.name} (from ${PLAN_COPY.scale.priceLabel} + PAYG output), ${PLAN_COPY.enterprise.name} (custom). Free to join.`;
const PUBLIC_MODELS_API_URL = 'https://api.genfeed.ai/v1/public/models';

const CATEGORY_LABELS: Record<string, string> = {
  [ModelCategory.IMAGE]: 'Image Generation',
  [ModelCategory.IMAGE_EDIT]: 'Image Editing',
  [ModelCategory.IMAGE_UPSCALE]: 'Image Upscaling',
  [ModelCategory.MUSIC]: 'Music Generation',
  [ModelCategory.TEXT]: 'Text & LLM',
  [ModelCategory.VIDEO]: 'Video Generation',
  [ModelCategory.VIDEO_EDIT]: 'Video Editing',
  [ModelCategory.VIDEO_UPSCALE]: 'Video Upscaling',
  [ModelCategory.VOICE]: 'Voice & Avatar',
};

const CATEGORY_ORDER: readonly string[] = [
  ModelCategory.IMAGE,
  ModelCategory.VIDEO,
  ModelCategory.MUSIC,
  ModelCategory.VOICE,
  ModelCategory.TEXT,
  ModelCategory.IMAGE_EDIT,
  ModelCategory.IMAGE_UPSCALE,
  ModelCategory.VIDEO_EDIT,
  ModelCategory.VIDEO_UPSCALE,
];

// ---------------------------------------------------------------------------
// llms.txt (index)
// ---------------------------------------------------------------------------

export function buildLlmsIndex(): string {
  const lines: string[] = [];

  lines.push('# Genfeed.ai');
  lines.push('');
  lines.push(
    `> ${metadata.description} Start free, then ${PLAN_COPY.pro.name} from ${PLAN_COPY.pro.monthlyPrice} plus PAYG output.`,
  );
  lines.push('');

  lines.push('## When to use Genfeed');
  lines.push('');
  lines.push(
    'Use Genfeed for repeatable content workflows that connect research, AI generation, human review, scheduled publishing, and performance analytics. It is especially useful for multi-channel campaigns, media batches, repurposing source material, and agent-assisted operations with explicit approval boundaries.',
  );
  lines.push('');

  lines.push('## Developer resources');
  lines.push('');
  lines.push(
    '- [OpenAPI document](https://api.genfeed.ai/v1/openapi.json): Canonical typed REST API contract under `/v1`',
  );
  lines.push(
    `- [API catalog](${BASE_URL}/.well-known/api-catalog): REST and MCP discovery links`,
  );
  lines.push(
    '- [MCP server](https://mcp.genfeed.ai/mcp): Streamable HTTP tools and resources for agents',
  );
  lines.push(
    `- [Agent authentication](${BASE_URL}/auth.md): Scoped API-key and OAuth instructions`,
  );
  lines.push(
    '- [Genfeed CLI](https://www.npmjs.com/package/@genfeedai/cli): Install with `npm install --global @genfeedai/cli` and run `genfeed --help`',
  );
  lines.push('');
  lines.push(
    renderAgentConnectMarkdown({
      includeManualKey: false,
      pricingSummary: PRICING_SUMMARY,
    }),
  );

  lines.push('## Products');
  lines.push('');
  for (const p of products) {
    lines.push(`- [${p.name}](${BASE_URL}/${p.slug}): ${p.tagline}`);
  }
  lines.push('');

  lines.push('## Use Cases');
  lines.push('');
  for (const uc of useCases) {
    lines.push(
      `- [${uc.title}](${BASE_URL}/use-cases/${uc.slug}): ${uc.description}`,
    );
  }
  lines.push('');

  lines.push('## Integrations');
  lines.push('');
  for (const i of integrations) {
    lines.push(
      `- [${i.name}](${BASE_URL}/integrations/${i.slug}): ${i.tagline}`,
    );
  }
  lines.push('');

  lines.push('## Resources');
  lines.push('');
  lines.push(
    `- [Pricing](${BASE_URL}/pricing): ${PLAN_COPY.pro.name} (${PLAN_COPY.pro.priceLabel} + PAYG output), ${PLAN_COPY.scale.name} (from ${PLAN_COPY.scale.priceLabel} + PAYG output), ${PLAN_COPY.enterprise.name} (custom)`,
  );
  lines.push(
    `- [Brand OS for experts](${BASE_URL}/experts): Turn interviews, talks, and call notes into a scored positioning system and a reviewable content plan — nothing publishes without the expert's approval`,
  );
  lines.push(
    `- [FAQ](${BASE_URL}/faq): Frequently asked questions about the platform`,
  );
  lines.push(
    `- [Generative Engine Optimization](${BASE_URL}/articles): Create citation-ready long-form content with answer blocks, source attribution, and Article/FAQ/HowTo structured data`,
  );
  lines.push(
    '- [Documentation](https://docs.genfeed.ai): API references, integration guides, and tutorials',
  );
  lines.push('');

  lines.push('## Optional');
  lines.push('');
  lines.push(`- [About](${BASE_URL}/about): Company mission and team`);
  lines.push(
    `- [Contact](${BASE_URL}/contact): Support, security, privacy, and sales`,
  );
  lines.push(`- [Blog](${BASE_URL}/articles): Articles and updates`);
  lines.push(`- [Privacy Policy](${BASE_URL}/privacy): Privacy policy`);
  lines.push(`- [Terms of Service](${BASE_URL}/terms): Terms of service`);
  lines.push(
    `- [llms-full.txt](${BASE_URL}/llms-full.txt): Comprehensive platform documentation for AI assistants`,
  );
  lines.push('');

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// llms-full.txt (comprehensive)
// ---------------------------------------------------------------------------

/**
 * The models customers can use right now: exactly the live public catalog,
 * which leaves out inactive, legacy and unpriceable rows. `null` means the
 * catalog could not be read, so no list is printed rather than a stale one.
 */
function renderModelSection(
  models: readonly PublicModelCatalogItem[] | null,
): string[] {
  const s: string[] = ['## AI Models', ''];
  const groups = new Map<string, string[]>();
  for (const model of models ?? []) {
    if (!CATEGORY_LABELS[model.category]) continue;
    const labels = groups.get(model.category) ?? [];
    if (!labels.includes(model.label)) labels.push(model.label);
    groups.set(model.category, labels);
  }
  const count = [...groups.values()].reduce(
    (total, labels) => total + labels.length,
    0,
  );

  s.push(
    `Users never pick a model: the Genfeed router sends every job to the best model for the format, brief, and budget, with production model controls available through Enterprise scope. The live catalog is at ${BASE_URL}/models and ${PUBLIC_MODELS_API_URL}.`,
  );
  s.push('');
  if (count === 0) {
    s.push(
      'The model list is temporarily unavailable here; read the live catalog above.',
    );
    s.push('');
    return s;
  }
  s.push(`Genfeed currently offers ${count} AI models:`);
  s.push('');
  for (const category of CATEGORY_ORDER) {
    const labels = groups.get(category);
    if (!labels?.length) continue;
    s.push(`### ${CATEGORY_LABELS[category]}`);
    s.push('');
    for (const label of [...labels].sort((left, right) =>
      left.localeCompare(right),
    ))
      s.push(`- ${label}`);
    s.push('');
  }
  return s;
}

export function buildLlmsFull(
  models: readonly PublicModelCatalogItem[] | null,
): string {
  const s: string[] = [];

  s.push('# Genfeed.ai');
  s.push('');
  s.push(
    `> ${metadata.description} Start free, then ${PLAN_COPY.pro.name} from ${PLAN_COPY.pro.monthlyPrice} plus PAYG output.`,
  );
  s.push('');

  s.push('## Overview');
  s.push('');
  s.push(metadata.description);
  s.push('');
  s.push('Key capabilities:');
  s.push(
    '- **AI Studio**: Generate content with models from Google, OpenAI, Black Forest Labs, Kling, and more',
  );
  s.push(
    '- **Multi-platform publishing**: Review and publish to supported channels connected in Genfeed',
  );
  s.push(
    '- **Workflow automation**: Build reusable content pipelines with the visual workflow editor',
  );
  s.push(
    '- **Analytics**: Track results for connected channels with supported analytics',
  );
  s.push(
    '- **Generative Engine Optimization**: Make long-form content citation-ready for AI answer engines with direct answer blocks, source attribution, and Article/FAQ/HowTo structured data',
  );
  s.push('');
  s.push('---');
  s.push('');
  s.push(
    renderAgentConnectMarkdown({
      includeManualKey: true,
      pricingSummary: PRICING_SUMMARY,
    }),
  );
  s.push('---');
  s.push('');
  s.push('## Products');
  s.push('');

  for (const p of products) {
    s.push(`### ${p.name}`);
    s.push('');
    s.push(`**${p.headline}**`);
    s.push('');
    s.push(p.description);
    s.push('');

    if (p.features.length > 0) {
      s.push('Features:');
      for (const f of p.features) {
        s.push(`- **${f.title}**: ${f.description}`);
      }
      s.push('');
    }

    s.push(`Target audience: ${p.targetAudience.join(', ')}`);
    s.push('');
    s.push(`Recommended plan: ${p.pricing.recommended}. ${p.pricing.why}`);
    if (p.status) {
      s.push(`Status: ${p.status}`);
    }
    s.push('');
    s.push(`URL: ${BASE_URL}/${p.slug}`);
    s.push('');
  }

  s.push('---');
  s.push('');
  s.push('## Pricing');
  s.push('');
  s.push(
    `Genfeed is free to join: credits buy the output you generate (1 credit = $0.01 at the pay-as-you-go rate). Subscriptions include monthly credits at a ${PLAN_COPY.pro.creditRateAdvantage} better rate, API access on paid plans, and unlimited team seats. Brands and connected channels are unlimited. ${PLAN_COPY.payg.name} and ${PLAN_COPY.pro.name} include one organization; ${PLAN_COPY.scale.name} adds multi-organization workflows. ${PLAN_COPY.pro.name} is ${PLAN_COPY.pro.monthlyPrice} with ${PLAN_COPY.pro.includedCredits} included. ${PLAN_COPY.scale.name} is ${PLAN_COPY.scale.monthlyPrice} with unlimited seats and a shared pool of ${PLAN_COPY.scale.includedCredits}. ${PLAN_COPY.enterprise.name} is custom.`,
  );
  s.push('');

  for (const plan of websitePlans) {
    const priceStr =
      plan.price === 0
        ? 'Free, pay-per-output credits'
        : plan.price === null
          ? 'Contact Sales'
          : plan.includedCredits
            ? `$${plan.price.toLocaleString()}/month with ${plan.includedCredits.toLocaleString()} credits included`
            : `$${plan.price.toLocaleString()}/month`;

    s.push(`### ${plan.label}: ${priceStr}`);
    s.push('');
    s.push(plan.description);
    s.push('');
    if (plan.target) {
      s.push(`Best for: ${plan.target}`);
      s.push('');
    }

    if (plan.outputs) {
      const parts: string[] = [];
      if (plan.outputs.videoMinutes) {
        parts.push(`${plan.outputs.videoMinutes} min video/month`);
      }
      if (plan.outputs.images) {
        parts.push(`${plan.outputs.images.toLocaleString()} images/month`);
      }
      if (plan.outputs.voiceMinutes) {
        parts.push(`${plan.outputs.voiceMinutes} min voice/month`);
      }
      s.push(`Monthly outputs: ${parts.join(', ')}`);
      s.push('');
    } else if (plan.type === 'enterprise') {
      s.push('Monthly outputs: Custom terms');
      s.push('');
    }

    s.push('Includes:');
    for (const f of plan.features) {
      s.push(`- ${f}`);
    }
    s.push('');
  }

  s.push('---');
  s.push('');
  s.push(...renderModelSection(models));

  s.push('---');
  s.push('');
  s.push('## Use Cases');
  s.push('');

  for (const uc of useCases) {
    s.push(`### ${uc.title}`);
    s.push('');
    s.push(`**${uc.headline}**`);
    s.push('');
    s.push(uc.description);
    s.push('');
    s.push(`Audience: ${uc.audience}`);
    s.push('');

    s.push('Pain points:');
    for (const pp of uc.painPoints) {
      s.push(`- ${pp}`);
    }
    s.push('');

    s.push('Solutions:');
    for (const sol of uc.solutions) {
      s.push(`- ${sol}`);
    }
    s.push('');

    s.push('Workflow:');
    for (const w of uc.workflow) {
      s.push(`${w.step}. **${w.title}**: ${w.description}`);
    }
    s.push('');

    s.push('Results:');
    for (const r of uc.results) {
      s.push(`- ${r}`);
    }
    s.push('');

    s.push(`Recommended plan: ${uc.pricing.recommended}. ${uc.pricing.why}`);
    s.push('');
    s.push(`URL: ${BASE_URL}/use-cases/${uc.slug}`);
    s.push('');
  }

  s.push('---');
  s.push('');
  s.push('## Integrations');
  s.push('');
  s.push(
    'Genfeed connects to 19+ platforms for publishing, analytics, and audience growth.',
  );
  s.push('');

  for (const i of integrations) {
    s.push(`### ${i.name}`);
    s.push('');
    s.push(i.description);
    s.push('');

    s.push('Features:');
    for (const f of i.features) {
      s.push(`- ${f}`);
    }
    s.push('');

    s.push('Workflow:');
    for (const w of i.workflow) {
      s.push(`${w.step}. **${w.title}**: ${w.description}`);
    }
    s.push('');

    s.push(`URL: ${BASE_URL}/integrations/${i.slug}`);
    s.push('');
  }

  s.push('---');
  s.push('');
  s.push('## FAQ');
  s.push('');

  for (const cat of FAQ_CATEGORIES) {
    s.push(`### ${cat.category}`);
    s.push('');
    for (const q of cat.questions) {
      s.push(`**Q: ${q.question}**`);
      s.push(`A: ${q.answer}`);
      s.push('');
    }
  }

  return s.join('\n');
}
