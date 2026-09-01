import { ThreadsCallbackController } from '@api/services/integrations/threads/controllers/threads-callback.controller';

describe('ThreadsCallbackController', () => {
  const callbackService = {
    getDataDeletionStatus: vi.fn(),
    handleDataDeletion: vi.fn(),
    handleDeauthorization: vi.fn(),
  };
  const controller = new ThreadsCallbackController(callbackService as never);

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('acknowledges a verified deauthorization', async () => {
    callbackService.handleDeauthorization.mockResolvedValue(undefined);

    await expect(controller.deauthorize('signed-request')).resolves.toEqual({
      success: true,
    });
    expect(callbackService.handleDeauthorization).toHaveBeenCalledWith(
      'signed-request',
    );
  });

  it('forwards deletion callbacks and status receipts', async () => {
    callbackService.handleDataDeletion.mockResolvedValue({
      confirmation_code: 'receipt',
      url: 'https://api.genfeed.ai/status/receipt',
    });
    callbackService.getDataDeletionStatus.mockReturnValue('completed');

    await expect(controller.dataDeletion('signed-request')).resolves.toEqual({
      confirmation_code: 'receipt',
      url: 'https://api.genfeed.ai/status/receipt',
    });
    expect(controller.dataDeletionStatus('receipt')).toBe('completed');
  });
});
