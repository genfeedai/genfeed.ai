import { describe, expect, it } from 'vitest';
import { type QaCapture, qaCaptureSchema } from './contracts';
import { evaluateOnboardingCapture, loadOnboardingCards } from './onboarding';
import {
  checkFactsOnPage,
  checkNamesBrandContext,
  checkNotRewriteOf,
  checkShortenKeepsIdea,
  checkVoiceIsSpecific,
} from './onboarding-checks';
import { checkIsPost } from './post-shape';

const cards = loadOnboardingCards();
function card(output: string) {
  const found = cards.find((candidate) => candidate.output === output);
  if (!found) throw new Error(`no onboarding card for ${output}`);
  return found;
}

const FACTS = ['pre-seasoned cast-iron skillet', 'ten year warranty'];
const X_DRAFT =
  'KELDER makes a pre-seasoned cast-iron skillet, with a ten year warranty on every pan we ship.';

function capture(
  cardId: string,
  overrides: Record<string, unknown>,
  evidence: Record<string, unknown> = {},
): QaCapture {
  return qaCaptureSchema.parse({
    assetId: null,
    capturedAt: '2026-11-13T12:00:00.000Z',
    cardId,
    creditsCharged: 0,
    model: { model: 'm', provider: 'p', version: null },
    onboarding: {
      brandName: 'KELDER',
      savedFacts: FACTS,
      scenario: 'work-email-real-site',
      ...evidence,
    },
    outcome: 'generated',
    output: X_DRAFT,
    receipt: { brandOs: 'none', receiptId: 'rcpt-1' },
    releaseSha: 'f84ac9f2',
    runId: 'run-1',
    runner: 'grok-bot',
    ...overrides,
  });
}

describe('onboarding cards', () => {
  it('has one card per onboarding output, none publishing', () => {
    expect(cards.map((c) => c.output)).toEqual([
      'brand-scan',
      'voice-analysis',
      'x-draft',
      'instagram-draft',
      'tiktok-draft',
      'linkedin-draft',
      'shorten-retry',
      'master-image',
      'platform-images',
    ]);
    expect(cards.every((c) => c.publish === false)).toBe(true);
  });
});

describe('is-a-post check', () => {
  it.each([
    ['a nine token reply', 'I cannot help with that.'],
    ['an empty-ish stub', 'Introducing KELDER.'],
    [
      'commentary',
      "Sure, here's a post for you about the skillet we make today.",
    ],
    [
      'a refusal',
      "I'm sorry, but I don't have enough information to write this.",
    ],
  ])('fails %s', (_label, text) => {
    expect(checkIsPost(text, { contentKind: 'social-post' }).passed).toBe(
      false,
    );
  });

  it('passes a real post and a short real reply', () => {
    expect(checkIsPost(X_DRAFT, { contentKind: 'social-post' }).passed).toBe(
      true,
    );
    expect(
      checkIsPost('Yes, it works on induction hobs.', { contentKind: 'reply' })
        .passed,
    ).toBe(true);
  });
});

describe('onboarding checks', () => {
  it('finds saved facts on the scanned page and flags one that is not there', () => {
    const page =
      'Our Pre-Seasoned Cast-Iron Skillet. Ten year warranty included!';
    expect(checkFactsOnPage(FACTS, page).passed).toBe(true);
    expect(checkFactsOnPage([...FACTS, 'ships from Oslo'], page).detail).toBe(
      '1 of 3 not found on the page',
    );
  });

  it('flags the generic voice fallback', () => {
    expect(
      checkVoiceIsSpecific({
        audience: 'General audience',
        style: 'Friendly and informative',
        tone: 'Professional',
      }).detail,
    ).toBe('3 of 3 fields are the generic fallback');
    expect(
      checkVoiceIsSpecific({
        audience: 'home cooks',
        style: 'short, precise sentences',
        tone: 'calm',
      }).passed,
    ).toBe(true);
  });

  it('requires a draft to name the brand context, not just exist', () => {
    expect(checkNamesBrandContext(X_DRAFT, 'KELDER', FACTS).passed).toBe(true);
    expect(
      checkNamesBrandContext(
        'We are excited to share something new with our community today.',
        'KELDER',
        FACTS,
      ).passed,
    ).toBe(false);
  });

  it('calls a reworded X draft a rewrite and a new angle not one', () => {
    const rewrite =
      'KELDER makes a pre-seasoned cast-iron skillet, with a ten year warranty on every pan.';
    const newAngle =
      'Packaging that returns to the paper mill: how recycled boxes ship from Gothenburg.';
    expect(checkNotRewriteOf(rewrite, X_DRAFT).passed).toBe(false);
    expect(checkNotRewriteOf(newAngle, X_DRAFT).passed).toBe(true);
  });

  it('accepts a shortened draft that keeps the idea and rejects a blind rewrite', () => {
    const input = `${X_DRAFT} ${X_DRAFT} Oven-safe to 260 degrees, works on induction and gas.`;
    expect(
      checkShortenKeepsIdea(
        'KELDER pre-seasoned cast-iron skillet: ten year warranty, oven-safe, works on induction.',
        input,
        280,
      ).passed,
    ).toBe(true);
    expect(
      checkShortenKeepsIdea(
        'Quality cookware for every kitchen, delivered.',
        input,
        280,
      ).passed,
    ).toBe(false);
  });
});

describe('evaluateOnboardingCapture', () => {
  it('passes a real X draft with a receipt that names the brand context', () => {
    const result = evaluateOnboardingCapture(
      card('x-draft'),
      capture('qa-onboarding-x-draft', {}),
    );
    expect(result.status).toBe('pass');
    expect(result.scenario).toBe('work-email-real-site');
  });

  it('fails a LinkedIn draft under the channel minimum even though it reads as a post', () => {
    const result = evaluateOnboardingCapture(
      card('linkedin-draft'),
      capture(
        'qa-onboarding-linkedin-draft',
        {},
        { xDraft: 'Packaging returns to the paper mill every autumn.' },
      ),
    );
    expect(result.status).toBe('fail');
    expect(
      result.deterministicChecks?.find(
        (check) => check.id === 'draft-meets-channel-minimum',
      )?.detail,
    ).toBe('93/200 minimum characters for the channel');
  });

  it('fails a nine-token draft that was saved and shown anyway', () => {
    const result = evaluateOnboardingCapture(
      card('x-draft'),
      capture('qa-onboarding-x-draft', { output: 'I cannot help with that.' }),
    );
    expect(result.status).toBe('fail');
    expect(
      result.deterministicChecks?.find((check) => check.id === 'is-a-post')
        ?.passed,
    ).toBe(false);
  });

  it('calls a draft with no receipt context-missing', () => {
    const result = evaluateOnboardingCapture(
      card('x-draft'),
      capture('qa-onboarding-x-draft', { receipt: null }),
    );
    expect(result.status).toBe('context-missing');
  });

  it('fails a scan that saved no facts, even though the scan ran', () => {
    const result = evaluateOnboardingCapture(
      card('brand-scan'),
      capture(
        'qa-onboarding-brand-scan',
        { output: null, receipt: null },
        { savedFacts: [], pageText: 'KELDER cookware' },
      ),
    );
    expect(result.status).toBe('fail');
    expect(result.deterministicChecks?.[0]?.id).toBe('scan-has-facts');
  });

  it('refuses a scenario the card is not run on', () => {
    expect(() =>
      evaluateOnboardingCapture(
        card('instagram-draft'),
        capture(
          'qa-onboarding-instagram-draft',
          {},
          { scenario: 'scan-failed-context-form' },
        ),
      ),
    ).toThrow(
      'qa-onboarding-instagram-draft is not run on scenario scan-failed-context-form',
    );
  });

  it('needs an asset for an image card and scores no text checks', () => {
    const missing = evaluateOnboardingCapture(
      card('master-image'),
      capture('qa-onboarding-master-image', { output: null }),
    );
    expect(missing.status).toBe('context-missing');
    const present = evaluateOnboardingCapture(
      card('master-image'),
      capture('qa-onboarding-master-image', {
        output: null,
        assetId: 'asset-1',
      }),
    );
    expect(present.status).toBe('pass');
    expect(present.deterministicChecks).toBeNull();
  });
});
