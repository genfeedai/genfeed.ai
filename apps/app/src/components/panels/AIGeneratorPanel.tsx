'use client';

import type { WorkflowFile } from '@genfeedai/types';
import { Bot, Loader2, Send, Sparkles, Trash2, Upload, User, X } from 'lucide-react';
import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { useUIStore } from '@genfeedai/workflow-ui/stores';
import { useWorkflowStore } from '@/store/workflowStore';
import { PanelContainer } from './PanelContainer';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  workflow?: WorkflowFile;
  timestamp: Date;
  error?: boolean;
}

let messageId = 0;

function AIGeneratorPanelComponent() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Abort any in-flight request when component unmounts
  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

  const toggleAIGenerator = useUIStore((s) => s.toggleAIGenerator);
  const loadWorkflow = useWorkflowStore((s) => s.loadWorkflow);

  const scrollToBottom = useCallback(() => {
    setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 100);
  }, []);

  const handleSend = useCallback(async () => {
    if (!input.trim() || isLoading) return;

    // Abort any previous in-flight request
    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    const userMessage: Message = {
      content: input.trim(),
      id: `msg-${++messageId}`,
      role: 'user',
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);
    scrollToBottom();

    try {
      const conversationHistory = messages.map((m) => ({
        content: m.content,
        role: m.role,
      }));

      const response = await fetch('/api/ai/generate-workflow', {
        body: JSON.stringify({
          conversationHistory,
          prompt: userMessage.content,
        }),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
        signal: controller.signal,
      });

      const data = await response.json();

      const assistantMessage: Message = {
        content: data.message || data.error || 'Failed to generate workflow',
        error: !data.success,
        id: `msg-${++messageId}`,
        role: 'assistant',
        timestamp: new Date(),
        workflow: data.workflow,
      };

      setMessages((prev) => [...prev, assistantMessage]);
      scrollToBottom();
    } catch (error) {
      // Don't show error message if request was aborted
      if (controller.signal.aborted) return;

      const errorMessage: Message = {
        content: error instanceof Error ? error.message : 'Failed to connect to AI service',
        error: true,
        id: `msg-${++messageId}`,
        role: 'assistant',
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorMessage]);
      scrollToBottom();
    } finally {
      if (!controller.signal.aborted) {
        setIsLoading(false);
      }
    }
  }, [input, isLoading, messages, scrollToBottom]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend]
  );

  const handleLoadWorkflow = useCallback(
    (workflow: WorkflowFile) => {
      loadWorkflow(workflow);
      toggleAIGenerator();
    },
    [loadWorkflow, toggleAIGenerator]
  );

  const handleClear = useCallback(() => {
    setMessages([]);
  }, []);

  return (
    <PanelContainer className="w-80 h-full border-l border-[var(--border)] bg-[var(--background)] flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b border-[var(--border)]">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-[var(--primary)]" />
          <span className="font-medium text-sm">AI Workflow Generator</span>
        </div>
        <div className="flex items-center gap-1">
          {messages.length > 0 && (
            <button
              onClick={handleClear}
              className="p-1.5 hover:bg-[var(--muted)] rounded transition"
              title="Clear conversation"
            >
              <Trash2 className="w-4 h-4 text-[var(--muted-foreground)]" />
            </button>
          )}
          <button
            onClick={toggleAIGenerator}
            className="p-1.5 hover:bg-[var(--muted)] rounded transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-3 space-y-4">
        {messages.length === 0 && (
          <div className="text-center py-8 text-[var(--muted-foreground)]">
            <Bot className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p className="text-sm font-medium mb-2">Describe your workflow</p>
            <p className="text-xs">
              Tell me what you want to create, and I'll generate a workflow with the right nodes and
              connections.
            </p>
            <div className="mt-4 space-y-2 text-xs text-left">
              <p className="font-medium text-[var(--foreground)]">Examples:</p>
              <button
                onClick={() =>
                  setInput('Create a workflow that generates an image and converts it to video')
                }
                className="block w-full text-left p-2 bg-[var(--muted)] rounded hover:bg-[var(--muted)]/80 transition"
              >
                "Generate an image and convert it to video"
              </button>
              <button
                onClick={() =>
                  setInput('Split an image into a 2x2 grid and make videos from each piece')
                }
                className="block w-full text-left p-2 bg-[var(--muted)] rounded hover:bg-[var(--muted)]/80 transition"
              >
                "Split image into 2x2 grid and make videos"
              </button>
              <button
                onClick={() =>
                  setInput('Create a 3-scene story with images and stitch into one video')
                }
                className="block w-full text-left p-2 bg-[var(--muted)] rounded hover:bg-[var(--muted)]/80 transition"
              >
                "3-scene story stitched into one video"
              </button>
            </div>
          </div>
        )}

        {messages.map((msg) => (
          <div key={msg.id} className={`flex gap-2 ${msg.role === 'user' ? 'justify-end' : ''}`}>
            {msg.role === 'assistant' && (
              <div className="w-6 h-6 rounded-full bg-[var(--primary)]/20 flex items-center justify-center flex-shrink-0">
                <Bot className="w-3.5 h-3.5 text-[var(--primary)]" />
              </div>
            )}
            <div
              className={`max-w-[85%] rounded-lg p-3 text-sm ${
                msg.role === 'user'
                  ? 'bg-[var(--primary)] text-white'
                  : msg.error
                    ? 'bg-red-500/10 border border-red-500/20'
                    : 'bg-[var(--muted)]'
              }`}
            >
              <p className="whitespace-pre-wrap">{msg.content}</p>

              {msg.workflow && (
                <div className="mt-3 pt-3 border-t border-[var(--border)]">
                  <div className="text-xs text-[var(--muted-foreground)] mb-2">
                    <span className="font-medium">{msg.workflow.name}</span>
                    <span className="mx-1">•</span>
                    <span>{msg.workflow.nodes.length} nodes</span>
                  </div>
                  <button
                    onClick={() => handleLoadWorkflow(msg.workflow!)}
                    className="w-full py-2 bg-[var(--primary)] text-white rounded text-xs font-medium hover:opacity-90 transition flex items-center justify-center gap-2"
                  >
                    <Upload className="w-3 h-3" />
                    Load Workflow
                  </button>
                </div>
              )}
            </div>
            {msg.role === 'user' && (
              <div className="w-6 h-6 rounded-full bg-[var(--muted)] flex items-center justify-center flex-shrink-0">
                <User className="w-3.5 h-3.5" />
              </div>
            )}
          </div>
        ))}

        {isLoading && (
          <div className="flex gap-2">
            <div className="w-6 h-6 rounded-full bg-[var(--primary)]/20 flex items-center justify-center flex-shrink-0">
              <Bot className="w-3.5 h-3.5 text-[var(--primary)]" />
            </div>
            <div className="bg-[var(--muted)] rounded-lg p-3">
              <Loader2 className="w-4 h-4 animate-spin text-[var(--muted-foreground)]" />
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="p-3 border-t border-[var(--border)]">
        <div className="flex gap-2">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Describe the workflow you want..."
            disabled={isLoading}
            className="flex-1 px-3 py-2 text-sm bg-[var(--muted)] border border-[var(--border)] rounded-lg resize-none focus:outline-none focus:ring-1 focus:ring-[var(--primary)] disabled:opacity-50"
            rows={2}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || isLoading}
            className="px-3 bg-[var(--primary)] text-white rounded-lg hover:opacity-90 transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
          </button>
        </div>
        <p className="text-[10px] text-[var(--muted-foreground)] mt-2">
          Press Enter to send, Shift+Enter for new line
        </p>
      </div>
    </PanelContainer>
  );
}

export const AIGeneratorPanel = memo(AIGeneratorPanelComponent);
