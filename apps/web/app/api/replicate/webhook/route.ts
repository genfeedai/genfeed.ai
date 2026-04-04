import { type NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { setWebhookResult } from '@/lib/replicate/webhook-store';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, status, output, error } = body;

    // Store the result
    setWebhookResult(id, { error, output, status });

    return NextResponse.json({ received: true });
  } catch (error) {
    logger.error('Webhook error', error, { context: 'api/replicate/webhook' });
    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 });
  }
}
