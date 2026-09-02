import type { LifecycleEmailDeliveryService } from '@api/services/lifecycle-emails/lifecycle-email-delivery.service';
import { LifecycleEmailsController } from '@api/services/lifecycle-emails/lifecycle-emails.controller';

describe('LifecycleEmailsController', () => {
  it('renders unsubscribe feedback with the operating system color scheme', async () => {
    const unsubscribe = vi.fn().mockResolvedValue(true);
    const controller = new LifecycleEmailsController({
      unsubscribe,
    } as unknown as LifecycleEmailDeliveryService);

    const html = await controller.unsubscribe('valid-token');

    expect(unsubscribe).toHaveBeenCalledWith('valid-token');
    expect(html).toContain('<title>Unsubscribed</title>');
    expect(html).toContain('color-scheme: light dark');
    expect(html).toContain('@media (prefers-color-scheme: dark)');
    expect(html).toContain('background:var(--page-background)');
    expect(html).toContain('color:var(--page-foreground)');
    expect(html).not.toContain('background:#050607');
  });
});
