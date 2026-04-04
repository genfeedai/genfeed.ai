/**
 * Build-time generator for llms.txt and llms-full.txt
 *
 * Reads structured data files and outputs two markdown files to public/:
 * - llms.txt    — compact index with links (spec: https://llmstxt.org)
 * - llms-full.txt — comprehensive inline content for AI assistants
 *
 * Run:  bun run scripts/generate-llms-txt.ts
 * Auto: prebuild hook runs this before every `next build`
 */

import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { FAQ_CATEGORIES } from '@data/faq.data';
import { integrations } from '@data/integrations.data';
import { products } from '@data/products.data';
import { useCases } from '@data/use-cases.data';
import { MODEL_OUTPUT_CAPABILITIES } from '@genfeedai/constants/model-capabilities.constant';
import { ModelCategory, ModelKey } from '@genfeedai/enums';
import { websitePlans } from '@helpers/business/pricing/pricing.helper';

const BASE_URL = 'https://genfeed.ai';
const PUBLIC_DIR = resolve(process.cwd(), 'public');

// ---------------------------------------------------------------------------
// Model display names (manual mapping for clean output)
// ---------------------------------------------------------------------------

const MODEL_NAMES: Record<string, string> = {
  'bytedance/seedream-4': 'ByteDance SeedDream 4',
  'bytedance/seedream-4.5': 'ByteDance SeedDream 4.5',
  'deepseek-ai/deepseek-r1': 'DeepSeek R1',
  'google/gemini-2.5-flash': 'Google Gemini 2.5 Flash',
  'google/gemini-3-pro': 'Google Gemini 3 Pro',
  'google/imagen-3': 'Google Imagen 3',
  'google/imagen-3-fast': 'Google Imagen 3 Fast',
  'google/imagen-4': 'Google Imagen 4',
  'google/imagen-4-fast': 'Google Imagen 4 Fast',
  'google/imagen-4-ultra': 'Google Imagen 4 Ultra',
  'google/nano-banana': 'Google Nano Banana',
  'google/nano-banana-pro': 'Google Nano Banana Pro',
  'google/veo-2': 'Google Veo 2',
  'google/veo-3': 'Google Veo 3',
  'google/veo-3-fast': 'Google Veo 3 Fast',
  'google/veo-3.1': 'Google Veo 3.1',
  'google/veo-3.1-fast': 'Google Veo 3.1 Fast',
  'heygen/avatar': 'HeyGen Avatar',
  'ideogram-ai/ideogram-character': 'Ideogram Character',
  'ideogram-ai/ideogram-v3-balanced': 'Ideogram v3 Balanced',
  'ideogram-ai/ideogram-v3-quality': 'Ideogram v3 Quality',
  'ideogram-ai/ideogram-v3-turbo': 'Ideogram v3 Turbo',
  'kwaivgi/kling-v1.6-pro': 'Kling v1.6 Pro',
  'kwaivgi/kling-v2.1': 'Kling v2.1',
  'kwaivgi/kling-v2.1-master': 'Kling v2.1 Master',
  'kwaivgi/kling-v2.5-turbo-pro': 'Kling v2.5 Turbo Pro',
  'luma/reframe-image': 'Luma Reframe (Image)',
  'luma/reframe-video': 'Luma Reframe (Video)',
  'meta/meta-llama-3.1-405b-instruct': 'Meta Llama 3.1 405B',
  'meta/musicgen': 'Meta MusicGen',
  'openai/gpt-5.2': 'OpenAI GPT 5.2',
  'openai/gpt-image-1.5': 'OpenAI GPT Image 1.5',
  'openai/sora-2': 'OpenAI Sora 2',
  'openai/sora-2-pro': 'OpenAI Sora 2 Pro',
  'qwen/qwen-image': 'Qwen Image',
  'runwayml/gen4-image-turbo': 'Runway Gen4 Image Turbo',
  'topazlabs/image-upscale': 'Topaz Image Upscale',
  'topazlabs/video-upscale': 'Topaz Video Upscale',
  'wan-video/wan-2.2-i2v-fast': 'Wan 2.2 Image-to-Video',
  'x-ai/grok-4': 'xAI Grok 4',
  'x-ai/grok-4-fast': 'xAI Grok 4 Fast',
  'x-ai/grok-4.1-fast': 'xAI Grok 4.1 Fast',
  [ModelKey.REPLICATE_BLACK_FOREST_LABS_FLUX_1_1_PRO]: 'FLUX 1.1 Pro',
  [ModelKey.REPLICATE_BLACK_FOREST_LABS_FLUX_2_DEV]: 'FLUX 2 Dev',
  [ModelKey.REPLICATE_BLACK_FOREST_LABS_FLUX_2_FLEX]: 'FLUX 2 Flex',
  [ModelKey.REPLICATE_BLACK_FOREST_LABS_FLUX_2_PRO]: 'FLUX 2 Pro',
  [ModelKey.REPLICATE_BLACK_FOREST_LABS_FLUX_KONTEXT_PRO]: 'FLUX Kontext Pro',
  [ModelKey.REPLICATE_BLACK_FOREST_LABS_FLUX_SCHNELL]: 'FLUX Schnell',
};

function getModelName(value: string): string {
  return MODEL_NAMES[value] ?? value;
}

// ---------------------------------------------------------------------------
// Model filtering
// ---------------------------------------------------------------------------

const SKIP_PREFIXES = ['genfeed-ai/', 'hf/', 'fal-ai/'];
const SKIP_VALUES = new Set<string>([
  'klingai-v2',
  'leonardoai',
  'runwayml',
  'sdxl',
  'replicate/fast-flux-trainer',
  'openai/clip',
]);

function isPublicModel(value: string): boolean {
  if (SKIP_VALUES.has(value)) {
    return false;
  }
  return !SKIP_PREFIXES.some((p) => value.startsWith(p));
}

const CATEGORY_LABELS: Record<string, string> = {
  [ModelCategory.EMBEDDING]: 'Embedding',
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

const CATEGORY_ORDER = [
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

function groupModelsByCategory(): Map<string, string[]> {
  const groups = new Map<string, string[]>();
  const capabilities = MODEL_OUTPUT_CAPABILITIES as Record<
    string,
    { category: ModelCategory }
  >;

  for (const [key, cap] of Object.entries(capabilities)) {
    if (!isPublicModel(key)) {
      continue;
    }
    if (cap.category === ModelCategory.EMBEDDING) {
      continue;
    }

    const list = groups.get(cap.category) ?? [];
    list.push(key);
    groups.set(cap.category, list);
  }

  return groups;
}

// ---------------------------------------------------------------------------
// llms.txt (index)
// ---------------------------------------------------------------------------

function buildLlmsIndex(): string {
  const lines: string[] = [];

  lines.push('# Genfeed.ai');
  lines.push('');
  lines.push(
    '> AI-first content creation platform. Generate videos, images, voice, and articles at scale with 50+ AI models including Google Veo 3, Imagen 4, and OpenAI Sora 2. BYOK free tier or subscriptions from $499/month.',
  );
  lines.push('');

  // Products
  lines.push('## Products');
  lines.push('');
  for (const p of products) {
    lines.push(`- [${p.name}](${BASE_URL}/${p.slug}): ${p.tagline}`);
  }
  lines.push('');

  // Use Cases
  lines.push('## Use Cases');
  lines.push('');
  for (const uc of useCases) {
    lines.push(
      `- [${uc.title}](${BASE_URL}/for/${uc.slug}): ${uc.description}`,
    );
  }
  lines.push('');

  // Integrations
  lines.push('## Integrations');
  lines.push('');
  for (const i of integrations) {
    lines.push(
      `- [${i.name}](${BASE_URL}/integrations/${i.slug}): ${i.tagline}`,
    );
  }
  lines.push('');

  // Resources
  lines.push('## Resources');
  lines.push('');
  lines.push(
    `- [Pricing](${BASE_URL}/pricing): Output-based pricing — BYOK (free), Pro ($499/mo), Scale ($1,499/mo), Enterprise ($4,999/mo)`,
  );
  lines.push(
    `- [FAQ](${BASE_URL}/faq): Frequently asked questions about the platform`,
  );
  lines.push(
    '- [Open Source Core](https://github.com/genfeedai/core): Self-host Genfeed with your own AI keys',
  );
  lines.push(
    '- [Documentation](https://docs.genfeed.ai): API references, integration guides, and tutorials',
  );
  lines.push('');

  // Optional
  lines.push('## Optional');
  lines.push('');
  lines.push(`- [About](${BASE_URL}/about): Company mission and team`);
  lines.push(`- [Blog](${BASE_URL}/articles): Articles and updates`);
  lines.push(`- [Contact](${BASE_URL}/contact): Get in touch`);
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

function buildLlmsFull(): string {
  const s: string[] = [];

  // Header
  s.push('# Genfeed.ai');
  s.push('');
  s.push(
    '> AI-first content creation platform. Generate videos, images, voice, and articles at scale with 50+ AI models including Google Veo 3, Imagen 4, and OpenAI Sora 2. BYOK free tier or subscriptions from $499/month.',
  );
  s.push('');

  // Overview
  s.push('## Overview');
  s.push('');
  s.push(
    'Genfeed.ai is a complete content intelligence platform for creators, agencies, marketers, and founders. Generate professional videos, images, music, voice, and articles using 50+ cutting-edge AI models — then publish everywhere and track what converts.',
  );
  s.push('');
  s.push('Key capabilities:');
  s.push(
    '- **AI Studio**: Generate content with models from Google, OpenAI, Black Forest Labs, Kling, and more',
  );
  s.push(
    '- **Multi-platform publishing**: Publish to 19+ social platforms from one dashboard',
  );
  s.push(
    '- **Workflow automation**: Visual no-code pipeline builder with 44+ node types',
  );
  s.push(
    '- **Analytics**: Track performance and revenue attribution across all channels',
  );
  s.push(
    '- **Open source core**: Self-host for free with your own AI keys (BYOK)',
  );
  s.push('');

  // Products
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
    s.push(`Recommended plan: ${p.pricing.recommended} — ${p.pricing.why}`);
    if (p.status) {
      s.push(`Status: ${p.status}`);
    }
    s.push('');
    s.push(`URL: ${BASE_URL}/${p.slug}`);
    s.push('');
  }

  // Pricing
  s.push('---');
  s.push('');
  s.push('## Pricing');
  s.push('');
  s.push(
    'Genfeed uses output-based pricing. You pay for what you create — videos, images, and voice minutes. No confusing credits.',
  );
  s.push('');

  for (const plan of websitePlans) {
    const priceStr =
      plan.price === 0
        ? 'Free'
        : plan.price === null
          ? 'Contact Sales'
          : `$${plan.price.toLocaleString()}/month`;

    s.push(`### ${plan.label} — ${priceStr}`);
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
      s.push('Monthly outputs: Unlimited');
      s.push('');
    }

    s.push('Includes:');
    for (const f of plan.features) {
      s.push(`- ${f}`);
    }
    s.push('');
  }

  // AI Models
  s.push('---');
  s.push('');
  s.push('## AI Models');
  s.push('');
  s.push(
    'Genfeed integrates 50+ AI models across multiple categories. Models are auto-selected for best quality on Pro tier, or manually selectable on Scale and Enterprise.',
  );
  s.push('');

  const groups = groupModelsByCategory();

  for (const cat of CATEGORY_ORDER) {
    const models = groups.get(cat);
    if (!models || models.length === 0) {
      continue;
    }

    s.push(`### ${CATEGORY_LABELS[cat] ?? cat}`);
    s.push('');
    for (const m of models) {
      s.push(`- ${getModelName(m)}`);
    }
    s.push('');
  }

  // Use Cases
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

    s.push(`Recommended plan: ${uc.pricing.recommended} — ${uc.pricing.why}`);
    s.push('');
    s.push(`URL: ${BASE_URL}/for/${uc.slug}`);
    s.push('');
  }

  // Integrations
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

  // FAQ
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

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main(): void {
  const index = buildLlmsIndex();
  const full = buildLlmsFull();

  writeFileSync(resolve(PUBLIC_DIR, 'llms.txt'), index, 'utf-8');
  writeFileSync(resolve(PUBLIC_DIR, 'llms-full.txt'), full, 'utf-8');

  const indexLines = index.split('\n').length;
  const fullTokensEst = Math.round(full.length / 4);

  console.info(`llms.txt      → ${indexLines} lines, ${index.length} bytes`);
  console.info(
    `llms-full.txt → ~${fullTokensEst.toLocaleString()} tokens, ${full.length} bytes`,
  );
}

main();
