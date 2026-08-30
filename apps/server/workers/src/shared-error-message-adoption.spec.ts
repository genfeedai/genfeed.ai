import { readFileSync } from 'node:fs';

const errorMessageAdoptionSites = [
  {
    fallbacks: ['Publish claim failed', 'Unknown publish completion error'],
    file: './services/scheduled-post-workflow.service.ts',
  },
  {
    fallbacks: [],
    file: './services/post-repeat-scheduler.service.ts',
  },
  {
    fallbacks: ['Publish validation failed', 'unknown'],
    file: './services/scheduled-post-delivery.service.ts',
  },
  {
    fallbacks: ['Failed to start workers service:'],
    file: './main.ts',
  },
  {
    fallbacks: ['Engagement action failed'],
    file: './crons/engagement/cron.engagement-triggers.service.ts',
  },
  {
    fallbacks: ['Post failed'],
    file: './crons/posts/post-publish-error.util.ts',
  },
  {
    fallbacks: [],
    file: './crons/tiktok/cron.tiktok-status.service.ts',
  },
  {
    fallbacks: [],
    file: './crons/youtube/cron.youtube-status.service.ts',
  },
  {
    fallbacks: [],
    file: './processors/api/queues/credit-deduction/credit-deduction.processor.ts',
  },
  {
    fallbacks: [
      'Webhook delivery failed',
      'Failed to record webhook delivery status',
    ],
    file: './processors/api/services/webhook-client/webhook-client.processor.ts',
  },
] as const;

describe('workers shared error-message adoption', () => {
  it.each(errorMessageAdoptionSites)(
    '$file uses the shared extractor without changing fallback text',
    ({ fallbacks, file }) => {
      const source = readFileSync(new URL(file, import.meta.url), 'utf8');

      expect(source).toContain(
        "import { getErrorMessage } from '@libs/utils/error/get-error-message.util';",
      );
      expect(source).not.toMatch(/\(error as Error\)\??\.message/);
      expect(source).not.toMatch(
        /(?:error|completionError|failure) instanceof Error[\s\S]{0,100}?\.message/,
      );
      expect(source).not.toContain('function readErrorMessage');
      for (const fallback of fallbacks) {
        expect(source).toContain(fallback);
      }
    },
  );
});
