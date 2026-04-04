import { describe, expect, it, vi } from 'vitest';

vi.mock('@clerk/backend', () => ({
  verifyToken: vi.fn(),
}));

describe('WebSocketModule', () => {
  it('should be importable', async () => {
    const { WebSocketModule } = await import(
      '@libs/websockets/websockets.module'
    );
    expect(WebSocketModule).toBeDefined();
  });
});
