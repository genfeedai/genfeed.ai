// Throwaway UI question: how should /pricing foreground Done for you alongside PAYG?
// Three structural variants at /pricing?variant=A|B|C; no checkout or booking writes.
// Run from apps/website: bun run dev:pricing-prototype
import { BOOKING_HREF } from '@data/booking.data';
import {
  CREDIT_VALUE_DOLLARS,
  INTERNAL_CREDIT_COSTS,
  VIDEO_CREDIT_COSTS,
  websitePlans,
} from '@genfeedai/pricing/plans-pricing';
import { serviceOffering } from '@web-components/landing/service-offering.data';

if (process.env.NODE_ENV === 'production') {
  throw new Error('The throwaway pricing prototype is development-only.');
}

const prototypeFile = Bun.file(
  new URL('./pricing-prototype.html', import.meta.url),
);
const prototypeData = JSON.stringify({
  bookingHref: BOOKING_HREF,
  creditValue: CREDIT_VALUE_DOLLARS,
  outputs: [
    { credits: INTERNAL_CREDIT_COSTS.image, label: 'Image · 1K / 2K' },
    { credits: VIDEO_CREDIT_COSTS.video8s, label: 'Short video · 8 seconds' },
    {
      credits: INTERNAL_CREDIT_COSTS.voicePerMinute,
      label: 'Voiceover · 1 minute',
    },
    {
      credits: INTERNAL_CREDIT_COSTS.articlePerPost,
      label: 'Article / SEO post',
    },
  ],
  plans: websitePlans.map((plan) => ({
    features: plan.features,
    includedCredits: plan.includedCredits,
    label: plan.label,
    launchNote: plan.launchNote,
    launchPrice: plan.launchPrice,
    price: plan.price,
    tier: plan.tier,
    valueProposition: plan.valueProposition,
  })),
  service: {
    ...serviceOffering,
    cta: 'Book a call',
    price: 2500,
    priceNote: 'Monthly retainer. Final scope agreed on a call.',
  },
}).replaceAll('<', '\\u003c');

const server = Bun.serve({
  hostname: '127.0.0.1',
  port: Number(process.env.PORT || 0),
  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === '/web-tokens.css') {
      return new Response(
        Bun.file(
          new URL('../../../../../packages/ui/web-tokens.css', import.meta.url),
        ),
      );
    }
    const fontName = url.pathname.slice('/fonts/'.length);
    if (
      url.pathname.startsWith('/fonts/') &&
      ['Satoshi-Regular.woff2', 'Satoshi-Bold.woff2'].includes(fontName)
    ) {
      return new Response(
        Bun.file(
          new URL(
            `../../../../../packages/fonts/files/${fontName}`,
            import.meta.url,
          ),
        ),
      );
    }
    if (url.pathname === '/') {
      return Response.redirect(new URL('/pricing?variant=A', url), 302);
    }
    if (!['/pricing', '/done-for-you'].includes(url.pathname)) {
      return new Response('Prototype route not found', { status: 404 });
    }
    const html = (await prototypeFile.text()).replace(
      '__PROTOTYPE_DATA__',
      prototypeData,
    );
    return new Response(html, {
      headers: {
        'Cache-Control': 'no-store',
        'Content-Type': 'text/html; charset=utf-8',
        'X-Robots-Tag': 'noindex, nofollow',
      },
    });
  },
});
process.stdout.write(
  `Pricing prototype: ${process.env.PORTLESS_URL || server.url}/pricing?variant=A\n`,
);
