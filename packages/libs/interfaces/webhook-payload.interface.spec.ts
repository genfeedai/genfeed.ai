import {
  ClerkWebhookPayload,
  HeygenWebhookPayload,
  KlingAIWebhookPayload,
  LeonardoAIWebhookPayload,
  OpenAIWebhookPayload,
  ReplicateWebhookPayload,
  StripeWebhookPayload,
  VercelWebhookPayload,
  WebhookPayload,
} from '@libs/interfaces/webhook-payload.interface';

describe('WebhookPayloadInterface', () => {
  describe('WebhookPayload', () => {
    it('should allow flexible payload structure', () => {
      const payload: WebhookPayload = {
        added: true,
        any: 'property',
        can: 'be',
        nested: { data: 'structure' },
      };

      expect(payload.any).toBe('property');
      expect(payload.can).toBe('be');
      expect(payload.added).toBe(true);
      expect(payload.nested).toEqual({ data: 'structure' });
    });
  });

  describe('StripeWebhookPayload', () => {
    it('should have required Stripe properties', () => {
      const payload: StripeWebhookPayload = {
        data: { object: { id: 'pi_123' } },
        id: 'evt_123',
        livemode: false,
        object: 'event',
        type: 'payment_intent.succeeded',
      };

      expect(payload.id).toBe('evt_123');
      expect(payload.object).toBe('event');
      expect(payload.type).toBe('payment_intent.succeeded');
      expect(payload.data).toEqual({ object: { id: 'pi_123' } });
      expect(payload.livemode).toBe(false);
    });

    it('should allow livemode to be undefined', () => {
      const payload: StripeWebhookPayload = {
        data: { object: {} },
        id: 'evt_123',
        object: 'event',
        type: 'payment_intent.succeeded',
      };

      expect(payload.livemode).toBeUndefined();
    });
  });

  describe('ClerkWebhookPayload', () => {
    it('should have required Clerk properties', () => {
      const payload: ClerkWebhookPayload = {
        data: {
          email: 'test@example.com',
          id: 'user_123',
        },
        object: 'event',
        type: 'user.created',
      };

      expect(payload.type).toBe('user.created');
      expect(payload.data).toEqual({
        email: 'test@example.com',
        id: 'user_123',
      });
      expect(payload.object).toBe('event');
    });
  });

  describe('ReplicateWebhookPayload', () => {
    it('should have required Replicate properties', () => {
      const payload: ReplicateWebhookPayload = {
        id: 'pred_123',
        output: { result: 'success' },
        status: 'succeeded',
      };

      expect(payload.id).toBe('pred_123');
      expect(payload.status).toBe('succeeded');
      expect(payload.output).toEqual({ result: 'success' });
    });

    it('should allow optional error field', () => {
      const payload: ReplicateWebhookPayload = {
        error: { message: 'Processing failed' },
        id: 'pred_123',
        status: 'failed',
      };

      expect(payload.status).toBe('failed');
      expect(payload.error).toEqual({ message: 'Processing failed' });
      expect(payload.output).toBeUndefined();
    });
  });

  describe('HeygenWebhookPayload', () => {
    it('should have optional Heygen properties', () => {
      const payload: HeygenWebhookPayload = {
        event_type: 'video.completed',
        status: 'completed',
        video_id: 'video_123',
      };

      expect(payload.event_type).toBe('video.completed');
      expect(payload.video_id).toBe('video_123');
      expect(payload.status).toBe('completed');
    });

    it('should allow all properties to be undefined', () => {
      const payload: HeygenWebhookPayload = {};

      expect(payload.event_type).toBeUndefined();
      expect(payload.video_id).toBeUndefined();
      expect(payload.status).toBeUndefined();
    });
  });

  describe('KlingAIWebhookPayload', () => {
    it('should have optional KlingAI properties', () => {
      const payload: KlingAIWebhookPayload = {
        task_id: 'task_123',
        task_status: 'completed',
      };

      expect(payload.task_id).toBe('task_123');
      expect(payload.task_status).toBe('completed');
    });
  });

  describe('LeonardoAIWebhookPayload', () => {
    it('should have optional LeonardoAI properties', () => {
      const payload: LeonardoAIWebhookPayload = {
        data: {
          imageUrl: 'https://example.com/image.jpg',
        },
        generationId: 'gen_123',
        status: 'completed',
      };

      expect(payload.generationId).toBe('gen_123');
      expect(payload.status).toBe('completed');
      expect(payload.data).toEqual({
        imageUrl: 'https://example.com/image.jpg',
      });
    });
  });

  describe('OpenAIWebhookPayload', () => {
    it('should have optional OpenAI properties', () => {
      const payload: OpenAIWebhookPayload = {
        run_id: 'run_456',
        status: 'completed',
        thread_id: 'thread_123',
      };

      expect(payload.thread_id).toBe('thread_123');
      expect(payload.run_id).toBe('run_456');
      expect(payload.status).toBe('completed');
    });
  });

  describe('VercelWebhookPayload', () => {
    it('should have optional Vercel properties', () => {
      const payload: VercelWebhookPayload = {
        deployment: {
          id: 'deploy_123',
          url: 'https://example.com',
        },
        type: 'deployment',
      };

      expect(payload.type).toBe('deployment');
      expect(payload.deployment).toEqual({
        id: 'deploy_123',
        url: 'https://example.com',
      });
    });
  });

  describe('Webhook payload inheritance', () => {
    it('should allow webhook payloads to extend base payload', () => {
      const stripePayload: StripeWebhookPayload = {
        customField: 'custom value', // Extended property
        data: { object: {} },
        id: 'evt_123',
        object: 'event',
        type: 'payment_intent.succeeded',
      };

      expect(stripePayload.customField).toBe('custom value');
    });
  });
});
