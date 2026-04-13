import type {
  ContentHarnessContribution,
  ContentHarnessInput,
  ContentHarnessPack,
} from './types';

function pushIfValue(target: string[], value: string | undefined): void {
  if (value?.trim()) {
    target.push(value.trim());
  }
}

function buildCoreContribution(
  input: ContentHarnessInput,
): ContentHarnessContribution {
  const systemDirectives: string[] = [];
  const styleDirectives: string[] = [];
  const guardrails: string[] = [];
  const evaluationCriteria: string[] = [];
  const providerHints: string[] = [];

  pushIfValue(
    systemDirectives,
    input.brandName
      ? `Write as ${input.brandName}. The output should feel native to the brand, not like generic AI copy.`
      : undefined,
  );
  pushIfValue(
    systemDirectives,
    input.intent.topic
      ? `Stay focused on the topic: ${input.intent.topic}.`
      : undefined,
  );
  pushIfValue(
    systemDirectives,
    input.intent.offer
      ? `Keep the offer grounded in the real value proposition: ${input.intent.offer}.`
      : undefined,
  );
  pushIfValue(
    styleDirectives,
    input.voiceProfile?.tone ? `Tone: ${input.voiceProfile.tone}.` : undefined,
  );
  pushIfValue(
    styleDirectives,
    input.voiceProfile?.style
      ? `Writing style: ${input.voiceProfile.style}.`
      : undefined,
  );
  if (input.voiceProfile?.audience?.length) {
    styleDirectives.push(
      `Primary audience: ${input.voiceProfile.audience.join(', ')}.`,
    );
  }
  if (input.voiceProfile?.messagingPillars?.length) {
    styleDirectives.push(
      `Center the message around: ${input.voiceProfile.messagingPillars.join(', ')}.`,
    );
  }
  if (input.voiceProfile?.values?.length) {
    styleDirectives.push(
      `Reflect these brand values: ${input.voiceProfile.values.join(', ')}.`,
    );
  }
  if (input.voiceProfile?.doNotSoundLike?.length) {
    guardrails.push(
      `Do not sound like: ${input.voiceProfile.doNotSoundLike.join(', ')}.`,
    );
  }
  if (input.voiceProfile?.sampleOutput?.trim()) {
    providerHints.push(
      `Sample voice reference: ${input.voiceProfile.sampleOutput.trim()}`,
    );
  }
  if (input.personaProfile?.label?.trim()) {
    styleDirectives.push(
      `Persona anchor: ${input.personaProfile.label.trim()}.`,
    );
  }
  if (input.personaProfile?.topics?.length) {
    styleDirectives.push(
      `Persona topic territory: ${input.personaProfile.topics.join(', ')}.`,
    );
  }

  evaluationCriteria.push(
    'Brand fidelity: the output should be recognizably native to the brand.',
  );
  evaluationCriteria.push(
    `Objective fit: the output should optimize for ${input.intent.objective}.`,
  );
  evaluationCriteria.push(
    `Platform fit: the output should read naturally on ${input.intent.platform ?? 'the target platform'}.`,
  );
  evaluationCriteria.push(
    `Format fit: the output should satisfy the constraints of a ${input.intent.contentType}.`,
  );

  guardrails.push('Avoid bland, generic, over-explained AI phrasing.');
  guardrails.push(
    'Prefer specificity, concrete claims, and lived-in language.',
  );

  return {
    evaluationCriteria,
    guardrails,
    providerHints,
    styleDirectives,
    systemDirectives,
    sources: input.sources ?? [],
  };
}

export const CORE_CONTENT_HARNESS_PACK: ContentHarnessPack = {
  capabilities: ['brand-voice', 'brief-assembly', 'evaluation-baseline'],
  contribute: buildCoreContribution,
  description:
    'OSS baseline pack: assembles brand voice, persona, and objective into a reusable content brief.',
  id: 'core-baseline',
  version: '1.0.0',
};
