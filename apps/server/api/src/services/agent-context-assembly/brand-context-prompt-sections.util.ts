import type {
  AssembledBrandContext,
  BrandContextContribution,
} from '@api/services/agent-context-assembly/interfaces/context-assembly.interface';

export function buildVisualIdentityPrompt(
  context: AssembledBrandContext,
): BrandContextContribution | null {
  if (!context.visualIdentity) {
    return null;
  }

  const visualIdentity = context.visualIdentity;
  const parts: string[] = [];
  if (visualIdentity.primaryColor) {
    parts.push(`- Primary color: ${visualIdentity.primaryColor}`);
  }
  if (visualIdentity.secondaryColor) {
    parts.push(`- Secondary color: ${visualIdentity.secondaryColor}`);
  }
  if (visualIdentity.backgroundColor) {
    parts.push(`- Background color: ${visualIdentity.backgroundColor}`);
  }
  if (visualIdentity.fontFamily) {
    parts.push(`- Font: ${visualIdentity.fontFamily}`);
  }
  if (visualIdentity.logoUrl) {
    parts.push(`- Logo reference: ${visualIdentity.logoUrl}`);
  }
  if (visualIdentity.bannerUrl) {
    parts.push(`- Banner reference: ${visualIdentity.bannerUrl}`);
  }

  const referencesByCategory = new Map<string, string[]>();
  for (const image of visualIdentity.referenceImages ?? []) {
    const labels = referencesByCategory.get(image.category) ?? [];
    labels.push(image.label ? `${image.label} (${image.url})` : image.url);
    referencesByCategory.set(image.category, labels);
  }
  for (const [category, labels] of referencesByCategory) {
    parts.push(`- ${category} references: ${labels.join(', ')}`);
  }

  return parts.length > 0
    ? {
        header: '## Visual Identity',
        content: parts.join('\n'),
        untrusted: true,
      }
    : null;
}

export function buildVoicePromptSections(
  context: AssembledBrandContext,
): BrandContextContribution[] {
  const voice = context.voice;
  if (!voice) {
    return [];
  }

  const parts: string[] = [];
  if (voice.canonicalSource) {
    parts.push(`- Canonical voice source: ${voice.canonicalSource}`);
  }
  if (voice.tone) parts.push(`- Tone: ${voice.tone}`);
  if (voice.style) parts.push(`- Style: ${voice.style}`);
  if (voice.audience) parts.push(`- Target audience: ${voice.audience}`);
  if (voice.messagingPillars?.length) {
    parts.push(`- Messaging pillars: ${voice.messagingPillars.join(', ')}`);
  }
  if (voice.doNotSoundLike?.length) {
    parts.push(`- Avoid sounding like: ${voice.doNotSoundLike.join(', ')}`);
  }
  if (voice.values?.length) {
    parts.push(`- Brand values: ${voice.values.join(', ')}`);
  }
  if (voice.taglines?.length) {
    parts.push(`- Taglines: ${voice.taglines.join(', ')}`);
  }
  if (voice.hashtags?.length) {
    parts.push(`- Hashtags: ${voice.hashtags.join(' ')}`);
  }
  if (voice.approvedHooks?.length) {
    parts.push(`- Approved hook patterns: ${voice.approvedHooks.join(' | ')}`);
  }
  if (voice.bannedPhrases?.length) {
    parts.push(`- Banned phrases: ${voice.bannedPhrases.join(', ')}`);
  }
  if (voice.writingRules?.length) {
    parts.push(
      `- Writing rules:\n${voice.writingRules
        .map((rule) => `  - ${rule}`)
        .join('\n')}`,
    );
  }

  const sections: BrandContextContribution[] = [];
  if (parts.length > 0) {
    sections.push({
      header: '## Brand Voice',
      content: parts.join('\n'),
      untrusted: true,
    });
  }
  if (voice.sampleOutput) {
    sections.push({
      header: '## Voice Example',
      content: voice.sampleOutput,
      untrusted: true,
    });
  }
  if (voice.exemplarTexts?.length) {
    sections.push({
      header: '## Real Posts by This Brand (style reference)',
      instructions:
        'Match their length, casing, punctuation and reply style. Never copy them verbatim.',
      content: voice.exemplarTexts.join('\n\n'),
      untrusted: true,
    });
  }
  return sections;
}

export function buildStrategyPrompt(
  context: AssembledBrandContext,
): BrandContextContribution | null {
  const strategy = context.strategy;
  if (!strategy) {
    return null;
  }

  const parts: string[] = [];
  if (strategy.goals?.length) {
    parts.push(`- Goals: ${strategy.goals.join(', ')}`);
  }
  if (strategy.contentTypes?.length) {
    parts.push(`- Content types: ${strategy.contentTypes.join(', ')}`);
  }
  if (strategy.platforms?.length) {
    parts.push(`- Platforms: ${strategy.platforms.join(', ')}`);
  }
  if (strategy.topics?.length) {
    parts.push(`- Topics: ${strategy.topics.join(', ')}`);
  }
  if (strategy.frequency) {
    parts.push(`- Frequency: ${strategy.frequency}`);
  }
  return parts.length > 0
    ? {
        header: '## Content Strategy',
        content: parts.join('\n'),
        untrusted: true,
      }
    : null;
}
