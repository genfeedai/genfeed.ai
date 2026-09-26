import {
  GenerateWorkflowWebhookDto,
  PatchWorkflowWebhookDto,
} from '@api/collections/workflows/dto/webhook.dto';
import { WorkflowWebhookAuthType } from '@genfeedai/contracts';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

describe('GenerateWorkflowWebhookDto', () => {
  it('accepts an omitted authType', async () => {
    const dto = plainToInstance(GenerateWorkflowWebhookDto, {});

    expect(await validate(dto)).toHaveLength(0);
  });

  it.each(Object.values(WorkflowWebhookAuthType))(
    'accepts the %s authType',
    async (authType) => {
      const dto = plainToInstance(GenerateWorkflowWebhookDto, { authType });

      expect(await validate(dto)).toHaveLength(0);
    },
  );

  it.each([
    ['a differently-cased value', 'Secret'],
    ['an unsupported scheme', 'hmac'],
    ['an empty string', ''],
    ['a number', 1],
  ])(
    // Regression coverage for #5248: this used to be an inline
    // `{ authType?: 'none' | 'secret' | 'bearer' }` body type, which the
    // global ValidationPipe had no class to validate against, so any value
    // reached `WorkflowWebhookService.generateWebhook` and got persisted —
    // including a value the public trigger endpoint doesn't recognize and,
    // pre-fix, would have skipped auth for entirely.
    'rejects %s',
    async (_label, authType) => {
      const dto = plainToInstance(GenerateWorkflowWebhookDto, { authType });

      expect(await validate(dto)).not.toHaveLength(0);
    },
  );
});

describe('PatchWorkflowWebhookDto', () => {
  it('accepts a boolean rotateSecret', async () => {
    const dto = plainToInstance(PatchWorkflowWebhookDto, {
      rotateSecret: true,
    });

    expect(await validate(dto)).toHaveLength(0);
  });

  it('rejects a non-boolean rotateSecret', async () => {
    const dto = plainToInstance(PatchWorkflowWebhookDto, {
      rotateSecret: 'yes',
    });

    expect(await validate(dto)).not.toHaveLength(0);
  });
});
