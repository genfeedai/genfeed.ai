import { type NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { getPredictionStatus } from '@/lib/replicate/client';
import { getWebhookResult } from '@/lib/replicate/webhook-store';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;

    // First check webhook results (faster if available)
    const webhookResult = getWebhookResult(id);
    if (webhookResult) {
      return NextResponse.json({
        error: webhookResult.error,
        id,
        output: webhookResult.output,
        status: webhookResult.status,
      });
    }

    // Fall back to polling Replicate API
    const prediction = await getPredictionStatus(id);

    return NextResponse.json({
      error: prediction.error,
      id,
      output: prediction.output,
      progress: prediction.status === 'processing' ? 50 : undefined,
      status: prediction.status,
    });
  } catch (error) {
    logger.error('Status check error', error, { context: 'api/status' });
    return NextResponse.json({ error: 'Failed to check status' }, { status: 500 });
  }
}
