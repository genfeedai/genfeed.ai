import type { LoggerService } from '@libs/logger/logger.service';
import type Stripe from 'stripe';

export type UpcomingInvoicePreview = Pick<
  Stripe.Invoice,
  'amount_due' | 'currency' | 'lines'
>;

// `invoices.createPreview` has no `limit`/pagination param for `lines` (SDK
// 22.6.0), so a preview invoice's first page is capped at Stripe's default
// list size. Preview invoices carry a real id (`upcoming_in_...`) precisely
// so `invoices.listLineItems` can page through the rest. Bound the number of
// pages fetched so a pathological subscription can't loop forever.
export const MAX_UPCOMING_INVOICE_LINE_PAGES = 20;

export async function collectUpcomingInvoiceLines(input: {
  context: { customerId: string; subscriptionId: string; url: string };
  logger: LoggerService;
  stripe: Stripe;
  upcomingInvoice: Stripe.Invoice;
}): Promise<UpcomingInvoicePreview> {
  const { context, logger, stripe, upcomingInvoice } = input;
  if (!upcomingInvoice.lines.has_more) {
    return upcomingInvoice;
  }
  const lines: Stripe.InvoiceLineItem[] = [...upcomingInvoice.lines.data];
  let hasMore: boolean = upcomingInvoice.lines.has_more;
  let pagesFetched = 0;

  while (hasMore && pagesFetched < MAX_UPCOMING_INVOICE_LINE_PAGES) {
    const lastLine = lines.at(-1);
    const nextPage = await stripe.invoices.listLineItems(upcomingInvoice.id, {
      limit: 100,
      ...(lastLine ? { starting_after: lastLine.id } : {}),
    });
    lines.push(...nextPage.data);
    hasMore = nextPage.has_more;
    pagesFetched += 1;
  }

  if (hasMore) {
    logger.warn(
      `${context.url} upcoming invoice preview has more proration lines than could be paginated`,
      {
        customerId: context.customerId,
        linesFetched: lines.length,
        pagesFetched,
        subscriptionId: context.subscriptionId,
      },
    );
  }

  return {
    ...upcomingInvoice,
    lines: { ...upcomingInvoice.lines, data: lines, has_more: hasMore },
  };
}
