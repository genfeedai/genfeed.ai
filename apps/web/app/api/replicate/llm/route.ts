import { type NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { generateText } from '@/lib/replicate/client';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { nodeId, inputs, config } = body;

    // Build input for Replicate
    const prompt = inputs.prompt || config.inputPrompt || '';

    if (!prompt) {
      return NextResponse.json({ error: 'Prompt is required' }, { status: 400 });
    }

    // Generate text synchronously (LLM is usually fast enough)
    const output = await generateText({
      max_tokens: config.maxTokens || 1024,
      prompt,
      system_prompt: config.systemPrompt,
      temperature: config.temperature || 0.7,
      top_p: config.topP || 0.9,
    });

    return NextResponse.json({
      nodeId,
      output,
      status: 'succeeded',
    });
  } catch (error) {
    logger.error('LLM generation error', error, { context: 'api/replicate/llm' });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Generation failed' },
      { status: 500 }
    );
  }
}
