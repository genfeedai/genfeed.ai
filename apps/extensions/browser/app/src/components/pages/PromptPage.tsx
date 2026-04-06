import { ButtonVariant } from '@genfeedai/enums';
import { Button } from '@ui/primitives/button';
import { Textarea } from '@ui/primitives/textarea';
import { useState } from 'react';
import { ButtonSpinner } from '~components/ui';

export default function PromptPage() {
  const [prompt, setPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  function handleSubmit(e: React.FormEvent): void {
    e.preventDefault();

    if (!prompt.trim()) {
      setError('Please enter a prompt');
      return;
    }

    setIsGenerating(true);
    setError('');
    setSuccess(false);

    chrome.runtime.sendMessage(
      {
        event: 'createVideo',
        prompt: prompt.trim(),
      },
      (response) => {
        setIsGenerating(false);

        if (response?.success) {
          setSuccess(true);
          setPrompt('');
          if (response.data?.url) {
            chrome.tabs.create({ url: response.data.url });
          }
        } else {
          setError(response?.error || 'Failed to create video');
        }
      },
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-medium text-gray-900 mb-2">
          Create AI Video
        </h3>
        <p className="text-sm text-gray-600">
          Enter a prompt to generate an AI-powered video
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label
            htmlFor="prompt"
            className="block text-sm font-medium text-gray-700 mb-1"
          >
            Video Prompt
          </label>
          <Textarea
            id="prompt"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="E.g., Create a video about the future of AI technology..."
            className="w-full px-3 py-2 border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
            rows={4}
            disabled={isGenerating}
          />
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 text-sm">
            {error}
          </div>
        )}
        {success && (
          <div className="bg-green-50 border border-green-200 text-green-700 px-3 py-2 text-sm">
            Video created successfully! Opening in a new tab...
          </div>
        )}

        <Button
          type="submit"
          disabled={isGenerating || !prompt.trim()}
          variant={ButtonVariant.DEFAULT}
          className="w-full"
        >
          {isGenerating ? (
            <ButtonSpinner text="Generating..." />
          ) : (
            'Generate Video'
          )}
        </Button>
      </form>

      <div className="border-t pt-4">
        <h4 className="text-sm font-medium text-gray-700 mb-2">Tips:</h4>
        <ul className="text-xs text-gray-600 space-y-1">
          <li>Be specific about the content you want</li>
          <li>Include style preferences (e.g., "animated", "cinematic")</li>
          <li>Mention duration if important (e.g., "30-second video")</li>
          <li>Add target audience for better results</li>
        </ul>
      </div>
    </div>
  );
}
