import type { HttpService } from '@nestjs/axios';
import { of } from 'rxjs';
import { readMetaPages, resolveMetaPageAccess } from './meta-page-access.util';

describe('Meta Page access resolution', () => {
  it('selects the linked Instagram Page on later pages without following next URLs', async () => {
    const get = vi
      .fn()
      .mockReturnValueOnce(
        of({
          data: {
            data: [
              {
                id: 'wrong',
                access_token: 'wrong',
                instagram_business_account: { id: 'other' },
              },
            ],
            paging: {
              next: 'https://untrusted.example/?access_token=secret',
              cursors: { after: 'cursor' },
            },
          },
        }),
      )
      .mockReturnValueOnce(
        of({
          data: {
            data: [
              {
                id: 'selected',
                access_token: 'page-token',
                instagram_business_account: { id: 'ig' },
              },
            ],
          },
        }),
      );
    expect(
      await resolveMetaPageAccess(
        { get } as unknown as HttpService,
        'https://graph.facebook.com/v26.0',
        'user-token',
        { instagramAccountId: 'ig' },
      ),
    ).toEqual({ pageId: 'selected', accessToken: 'page-token' });
    expect(get).toHaveBeenLastCalledWith(
      'https://graph.facebook.com/v26.0/me/accounts',
      expect.objectContaining({
        params: expect.objectContaining({
          after: 'cursor',
          access_token: 'user-token',
        }),
      }),
    );
  });
  it('rejects missing matching Page tokens without borrowing another Page', async () => {
    const get = vi
      .fn()
      .mockReturnValue(
        of({ data: { data: [{ id: 'other', access_token: 'wrong' }] } }),
      );
    await expect(
      resolveMetaPageAccess(
        { get } as unknown as HttpService,
        'https://graph.facebook.com/v26.0',
        'user-token',
        { instagramAccountId: 'ig' },
      ),
    ).rejects.toThrow('Reconnect');
  });
  it('fails closed on a repeated pagination cursor', async () => {
    const get = vi.fn().mockReturnValue(
      of({
        data: {
          data: [],
          paging: { next: 'next', cursors: { after: 'same' } },
        },
      }),
    );
    await expect(
      readMetaPages(
        { get } as unknown as HttpService,
        'https://graph.facebook.com/v26.0',
        'user-token',
      ),
    ).rejects.toThrow('did not advance');
  });
});
