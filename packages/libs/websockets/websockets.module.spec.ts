import { describe, expect, it } from 'vitest';

describe('WebSocketModule', () => {
  it('should be importable', async () => {
    const { WebSocketModule } = await import(
      '@libs/websockets/websockets.module'
    );
    expect(WebSocketModule).toBeDefined();
  });
});
