import { type NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { generateLipSync, type LipSyncModel } from '@/lib/replicate/client';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { nodeId, inputs, config } = body;

    // Audio is required
    const audio = inputs.audio || config.inputAudio;
    if (!audio) {
      return NextResponse.json({ error: 'Audio is required' }, { status: 400 });
    }

    // Need either video or image
    const video = inputs.video || config.inputVideo;
    const image = inputs.image || config.inputImage;
    if (!video && !image) {
      return NextResponse.json(
        { error: 'Either video or image input is required' },
        { status: 400 }
      );
    }

    // Get webhook URL for async notification
    const webhookUrl = process.env.NEXT_PUBLIC_URL
      ? `${process.env.NEXT_PUBLIC_URL}/api/replicate/webhook`
      : undefined;

    const prediction = await generateLipSync(
      (config.model || 'sync/lipsync-2') as LipSyncModel,
      {
        active_speaker: config.activeSpeaker ?? false,
        audio,
        image,
        sync_mode: config.syncMode || 'loop',
        temperature: config.temperature ?? 0.5,
        video,
      },
      webhookUrl
    );

    return NextResponse.json({
      nodeId,
      predictionId: prediction.id,
      status: prediction.status,
    });
  } catch (error) {
    logger.error('Lip-sync generation error', error, { context: 'api/replicate/lipsync' });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Lip-sync generation failed' },
      { status: 500 }
    );
  }
}
