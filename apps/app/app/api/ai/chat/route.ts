import { type NextRequest, NextResponse } from 'next/server';
import { streamText } from 'ai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createOpenAI } from '@ai-sdk/openai';
import { logger } from '@/lib/logger';
import { createChatTools, buildEditSystemPrompt } from '@/lib/chat/tools';
import type { WorkflowContext } from '@/lib/chat/contextBuilder';
import type { SubgraphResult } from '@/lib/chat/subgraphExtractor';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface ChatRequestBody {
  messages: ChatMessage[];
  provider: 'anthropic' | 'openai' | 'replicate';
  model: string;
  apiKey: string;
  workflowContext: WorkflowContext;
  restSummary?: SubgraphResult['restSummary'];
  nodeIds?: string[];
}

function createProviderModel(provider: string, model: string, apiKey: string) {
  switch (provider) {
    case 'anthropic': {
      const anthropic = createAnthropic({ apiKey });
      return anthropic(model);
    }
    case 'openai': {
      const openai = createOpenAI({ apiKey });
      return openai(model);
    }
    case 'replicate': {
      // For Replicate, fall back to server-side env var if no BYOK key
      const openai = createOpenAI({
        apiKey: apiKey || process.env.REPLICATE_API_TOKEN || '',
        baseURL: 'https://openai-proxy.replicate.com/v1',
      });
      return openai(model);
    }
    default:
      throw new Error(`Unsupported provider: ${provider}`);
  }
}

export async function POST(request: NextRequest) {
  try {
    const body: ChatRequestBody = await request.json();
    const { messages, provider, model, apiKey, workflowContext, restSummary, nodeIds } = body;

    if (!messages || messages.length === 0) {
      return NextResponse.json({ error: 'Messages are required' }, { status: 400 });
    }

    if (provider !== 'replicate' && !apiKey) {
      return NextResponse.json(
        { error: `API key required for ${provider}. Add your key in Settings > API Keys.` },
        { status: 401 }
      );
    }

    const providerModel = createProviderModel(provider, model, apiKey);
    const systemPrompt = buildEditSystemPrompt(workflowContext, restSummary);
    const tools = createChatTools(nodeIds ?? []);

    const result = streamText({
      maxOutputTokens: 4096,
      messages,
      model: providerModel,
      system: systemPrompt,
      temperature: 0.3,
      tools,
    });

    return result.toUIMessageStreamResponse();
  } catch (error) {
    logger.error('Chat API error', error, { context: 'api/ai/chat' });

    const message = error instanceof Error ? error.message : 'Chat request failed';
    const status = message.includes('API key') || message.includes('401') ? 401 : 500;

    return NextResponse.json({ error: message }, { status });
  }
}
