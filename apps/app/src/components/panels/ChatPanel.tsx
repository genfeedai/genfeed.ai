'use client';

import type { UIMessage } from 'ai';
import { DefaultChatTransport } from 'ai';
import { Bot, Loader2, MessageSquare, Send, Settings2, Wrench, X } from 'lucide-react';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useChat } from '@ai-sdk/react';
import { Button } from '@/components/ui/button';
import { buildWorkflowContext } from '@/lib/chat/contextBuilder';
import { narrateOperations } from '@/lib/chat/editOperations';
import type { EditOperation } from '@/lib/chat/editOperations';
import { LLM_PROVIDERS } from '@/lib/ai/llm-providers';
import type { LLMProviderType } from '@/lib/ai/llm-providers';
import { useSettingsStore } from '@/store/settingsStore';
import { useWorkflowStore } from '@/store/workflowStore';

function ChatPanelComponent() {
  const isChatOpen = useWorkflowStore((state) => state.isChatOpen);
  const setChatOpen = useWorkflowStore((state) => state.setChatOpen);
  const applyChatEditOperations = useWorkflowStore((state) => state.applyChatEditOperations);
  const nodes = useWorkflowStore((state) => state.nodes);
  const edges = useWorkflowStore((state) => state.edges);

  const llm = useSettingsStore((s) => s.llm);
  const setLLMActiveProvider = useSettingsStore((s) => s.setLLMActiveProvider);
  const setLLMActiveModel = useSettingsStore((s) => s.setLLMActiveModel);
  const isLLMConfigured = useSettingsStore((s) => s.isLLMConfigured);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [inputValue, setInputValue] = useState('');

  const providerInfo = LLM_PROVIDERS[llm.activeProvider];
  const configured = isLLMConfigured();

  // Build workflow context for LLM
  const workflowContext = useMemo(() => buildWorkflowContext(nodes, edges), [nodes, edges]);

  // Create transport with dynamic body
  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: '/api/ai/chat',
        body: {
          apiKey: llm.providers[llm.activeProvider].apiKey ?? '',
          model: llm.activeModel,
          nodeIds: nodes.map((n) => n.id),
          provider: llm.activeProvider,
          workflowContext,
        },
      }),
    [llm.activeProvider, llm.activeModel, llm.providers, workflowContext, nodes]
  );

  const { messages, sendMessage, status, setMessages } = useChat({
    onFinish: ({ message }) => {
      // Process tool call results from message parts
      if (!message.parts) return;

      for (const part of message.parts) {
        if (typeof part.type === 'string' && part.type.startsWith('tool-')) {
          const toolPart = part as {
            type: string;
            state: string;
            output?: Record<string, unknown>;
          };
          if (toolPart.state === 'result' && toolPart.output) {
            const output = toolPart.output;
            if (output.operations && Array.isArray(output.operations)) {
              const ops = output.operations as EditOperation[];
              const { applied, skipped } = applyChatEditOperations(ops);
              const narrative = narrateOperations(ops);

              if (applied > 0 || skipped.length > 0) {
                const summaryText = `Applied ${applied} operation(s):\n${narrative}${skipped.length > 0 ? `\n\nSkipped: ${skipped.join(', ')}` : ''}`;
                setMessages((prev) => [
                  ...prev,
                  {
                    id: `system-${Date.now()}`,
                    parts: [{ text: summaryText, type: 'text' as const }],
                    role: 'assistant' as const,
                  },
                ]);
              }
            }
          }
        }
      }
    },
    transport,
  });

  const isActive = status === 'submitted' || status === 'streaming';

  // Scroll to bottom on new messages
  const prevCountRef = useRef(0);
  if (messages.length !== prevCountRef.current) {
    prevCountRef.current = messages.length;
    // Schedule scroll after render
    setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 50);
  }

  const handleSend = useCallback(() => {
    const trimmed = inputValue.trim();
    if (!trimmed || !configured || isActive) return;
    sendMessage({ text: trimmed });
    setInputValue('');
  }, [inputValue, configured, isActive, sendMessage]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend]
  );

  const setExample = useCallback((text: string) => {
    setInputValue(text);
  }, []);

  if (!isChatOpen) return null;

  return (
    <div className="absolute right-4 top-4 bottom-4 w-[400px] bg-background border border-border rounded-lg shadow-xl flex flex-col z-50">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2">
          <MessageSquare className="w-4 h-4 text-primary" />
          <span className="text-sm font-medium">Workflow Assistant</span>
          <span className="text-[10px] bg-primary/20 text-primary px-1.5 py-0.5 rounded font-medium">
            BYOK
          </span>
        </div>
        <Button variant="ghost" size="icon-sm" onClick={() => setChatOpen(false)}>
          <X className="w-4 h-4" />
        </Button>
      </div>

      {/* Model selector */}
      <div className="px-4 py-2 border-b border-border flex items-center gap-2">
        <Settings2 className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
        <select
          value={llm.activeProvider}
          onChange={(e) => setLLMActiveProvider(e.target.value as LLMProviderType)}
          className="text-xs bg-transparent border-none focus:outline-none text-foreground cursor-pointer"
        >
          {(Object.keys(LLM_PROVIDERS) as LLMProviderType[]).map((p) => (
            <option key={p} value={p}>
              {LLM_PROVIDERS[p].name}
            </option>
          ))}
        </select>
        <span className="text-muted-foreground text-xs">/</span>
        <select
          value={llm.activeModel}
          onChange={(e) => setLLMActiveModel(e.target.value)}
          className="text-xs bg-transparent border-none focus:outline-none text-foreground cursor-pointer flex-1 min-w-0"
        >
          {providerInfo.models.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}
            </option>
          ))}
        </select>
      </div>

      {/* Not configured warning */}
      {!configured && (
        <div className="mx-4 mt-3 px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-xs text-amber-500">
          Add your {providerInfo.name} API key in Settings &gt; API Keys to start chatting.
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {messages.length === 0 && (
          <div className="text-center text-muted-foreground py-8">
            <Bot className="w-10 h-10 mx-auto mb-3 opacity-50" />
            <p className="text-sm font-medium mb-1">Workflow Assistant</p>
            <p className="text-xs mb-4">
              Ask me to create, modify, or explain your workflow. I can add nodes, make connections,
              and update settings.
            </p>
            <div className="space-y-1.5 text-xs text-left">
              <button
                onClick={() => setExample('Add an image generation node connected to a prompt')}
                className="block w-full text-left p-2 bg-muted rounded hover:bg-muted/80 transition"
              >
                &quot;Add an image generation node connected to a prompt&quot;
              </button>
              <button
                onClick={() => setExample('Create a 3-scene video pipeline with stitching')}
                className="block w-full text-left p-2 bg-muted rounded hover:bg-muted/80 transition"
              >
                &quot;Create a 3-scene video pipeline with stitching&quot;
              </button>
              <button
                onClick={() => setExample('What does each node in my workflow do?')}
                className="block w-full text-left p-2 bg-muted rounded hover:bg-muted/80 transition"
              >
                &quot;What does each node in my workflow do?&quot;
              </button>
            </div>
          </div>
        )}

        {messages.map((msg) => (
          <MessageBubble key={msg.id} message={msg} />
        ))}

        {isActive && messages[messages.length - 1]?.role === 'user' && (
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
              <Bot className="w-3.5 h-3.5 text-primary" />
            </div>
            <div className="bg-muted rounded-lg px-3 py-2">
              <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="border-t border-border px-4 py-3">
        <div className="flex items-end gap-2">
          <textarea
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              configured
                ? 'Describe what you want to do...'
                : `Add ${providerInfo.name} API key to start...`
            }
            disabled={!configured || isActive}
            className="flex-1 min-h-[36px] max-h-[120px] px-3 py-2 text-sm bg-background border border-border rounded resize-none focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
            rows={1}
          />
          <Button
            size="icon-sm"
            onClick={handleSend}
            disabled={!inputValue.trim() || !configured || isActive}
          >
            {isActive ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </Button>
        </div>
        <p className="text-[10px] text-muted-foreground mt-1.5">
          {llm.activeProvider !== 'replicate'
            ? `Using your ${providerInfo.name} key`
            : 'Using server Replicate key'}{' '}
          &middot; Enter to send, Shift+Enter for new line
        </p>
      </div>
    </div>
  );
}

/** Renders a single message bubble with parts support */
const MessageBubble = memo(function MessageBubble({ message }: { message: UIMessage }) {
  const isUser = message.role === 'user';

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      {!isUser && (
        <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center shrink-0 mr-2">
          <Bot className="w-3.5 h-3.5 text-primary" />
        </div>
      )}
      <div
        className={`max-w-[85%] px-3 py-2 rounded-lg text-sm ${
          isUser ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground'
        }`}
      >
        {message.parts.map((part, i) => {
          if (part.type === 'text') {
            return (
              <p key={i} className="whitespace-pre-wrap">
                {part.text}
              </p>
            );
          }
          if (typeof part.type === 'string' && part.type.startsWith('tool-')) {
            const toolPart = part as { type: string; state: string };
            const toolName = part.type.replace('tool-', '');
            return (
              <div key={i} className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
                <Wrench className="w-3 h-3" />
                <span>
                  {toolPart.state === 'result' ? 'Used' : 'Calling'} {toolName}
                </span>
                {toolPart.state !== 'result' && <Loader2 className="w-3 h-3 animate-spin" />}
              </div>
            );
          }
          return null;
        })}
      </div>
    </div>
  );
});

export const ChatPanel = memo(ChatPanelComponent);
