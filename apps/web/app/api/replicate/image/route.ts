import { type NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { generateImage } from '@/lib/replicate/client';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { nodeId, inputs, config } = body;

    // Build input for Replicate
    const prompt = inputs.prompt || config.inputPrompt || '';
    const images = Array.isArray(inputs.images)
      ? inputs.images
      : inputs.images
        ? [inputs.images]
        : [];

    if (!prompt) {
      return NextResponse.json({ error: 'Prompt is required' }, { status: 400 });
    }

    // Get webhook URL for async notification
    const webhookUrl = process.env.NEXT_PUBLIC_URL
      ? `${process.env.NEXT_PUBLIC_URL}/api/replicate/webhook`
      : undefined;

    const prediction = await generateImage(
      config.model || 'nano-banana-pro',
      {
        aspect_ratio: config.aspectRatio || '1:1',
        image_input: images,
        output_format: config.outputFormat || 'jpg',
        prompt,
        resolution: config.resolution || '2K',
      },
      webhookUrl
    );

    return NextResponse.json({
      nodeId,
      predictionId: prediction.id,
      status: prediction.status,
    });
  } catch (error) {
    logger.error('Image generation error', error, { context: 'api/replicate/image' });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Generation failed' },
      { status: 500 }
    );
  }
}
