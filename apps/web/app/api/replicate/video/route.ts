import { type NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { generateVideo } from '@/lib/replicate/client';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { nodeId, inputs, config } = body;

    // Build input for Replicate
    const prompt = inputs.prompt || config.inputPrompt || '';

    if (!prompt) {
      return NextResponse.json({ error: 'Prompt is required' }, { status: 400 });
    }

    // Get webhook URL for async notification
    const webhookUrl = process.env.NEXT_PUBLIC_URL
      ? `${process.env.NEXT_PUBLIC_URL}/api/replicate/webhook`
      : undefined;

    const prediction = await generateVideo(
      config.model || 'veo-3.1-fast',
      {
        aspect_ratio: config.aspectRatio || '16:9',
        duration: config.duration || 8,
        generate_audio: config.generateAudio ?? true,
        image: inputs.image || config.inputImage,
        last_frame: inputs.lastFrame || config.lastFrame,
        negative_prompt: config.negativePrompt,
        prompt,
        reference_images: config.referenceImages,
        resolution: config.resolution || '1080p',
      },
      webhookUrl
    );

    return NextResponse.json({
      nodeId,
      predictionId: prediction.id,
      status: prediction.status,
    });
  } catch (error) {
    logger.error('Video generation error', error, { context: 'api/replicate/video' });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Generation failed' },
      { status: 500 }
    );
  }
}
