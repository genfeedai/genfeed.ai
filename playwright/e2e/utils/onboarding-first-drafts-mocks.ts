import type { IOnboardingDraftRun } from '@genfeedai/contracts/interfaces';
import type { Page } from '@playwright/test';

interface FirstDraftsMockOptions {
  /** Called once when the draft request resolves, so a test can record progress. */
  onDrafts?: (request: Record<string, unknown>) => void;
  /** Make the link scan fail so the brand-context round is offered first. */
  isScanFailing?: boolean;
}

const PLATFORMS = ['twitter', 'instagram', 'tiktok', 'linkedin'] as const;

/**
 * Mocks the two onboarding endpoints behind the output-first page: the link
 * scan and the first drafts. Registered per page, so a test sees only its own
 * requests.
 */
export async function setupOnboardingFirstDraftsMocks(
  page: Page,
  options: FirstDraftsMockOptions = {},
): Promise<{ draftRequests: Array<Record<string, unknown>> }> {
  const draftRequests: Array<Record<string, unknown>> = [];
  let saved: IOnboardingDraftRun | null = null;

  await page.route('**/v1/onboarding/brands/*/scan', async (route) => {
    await route.fulfill({
      body: JSON.stringify(
        options.isScanFailing
          ? { reason: 'blocked', status: 'failed' }
          : {
              status: 'scanned',
              summary: {
                name: 'Genfeed',
                suggestions: {
                  audiences: ['Solo founders'],
                  competitors: [],
                  offers: ['An AI studio for content'],
                },
              },
            },
      ),
      contentType: 'application/json',
      status: 200,
    });
  });

  await page.route('**/v1/onboarding/brands/*/drafts', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ json: saved });
      return;
    }
    const request = (route.request().postDataJSON() ?? {}) as Record<
      string,
      unknown
    >;
    draftRequests.push(request);
    options.onDrafts?.(request);
    const round = draftRequests.length;
    saved = {
      id: 'saved-onboarding-run',
      mediaRetriesRemaining: 2,
      status: 'complete',
      verdicts: {},
      result: {
        drafts: PLATFORMS.map((platform) => ({
          isProvisional: false,
          platform,
          postId: `post-${platform}-${round}`,
          receiptId: `receipt-${platform}-${round}`,
          requestKey: `key-${platform}-${round}`,
          text: `Round ${round} ${platform} draft`,
        })),
        imageIngredientId: null,
        imageUrl: null,
        videoStatus: 'failed',
        videoUrl: null,
        requestKey: `key-twitter-${round}`,
        status: 'partial',
      },
    };
    await route.fulfill({ json: saved.result });
  });

  return { draftRequests };
}
