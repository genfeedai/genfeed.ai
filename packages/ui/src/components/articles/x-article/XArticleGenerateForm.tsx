'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/enums';
import type { XArticleGenerateFormProps } from '@props/content/x-article.props';
import Card from '@ui/card/Card';
import { Button } from '@ui/primitives/button';
import { Checkbox } from '@ui/primitives/checkbox';
import FormDropdown from '@ui/primitives/dropdown-field';
import FormControl from '@ui/primitives/field';
import { Input } from '@ui/primitives/input';
import { Textarea } from '@ui/primitives/textarea';
import type { ChangeEvent } from 'react';
import { useState } from 'react';
import { HiSparkles } from 'react-icons/hi2';

const TONE_OPTIONS = [
  { key: 'authoritative', label: 'Authoritative' },
  { key: 'conversational', label: 'Conversational' },
  { key: 'provocative', label: 'Provocative' },
  { key: 'analytical', label: 'Analytical' },
];

export default function XArticleGenerateForm({
  onGenerate,
  isGenerating,
}: XArticleGenerateFormProps) {
  const [prompt, setPrompt] = useState('');
  const [tone, setTone] = useState('authoritative');
  const [targetWordCount, setTargetWordCount] = useState(5000);
  const [keywords, setKeywords] = useState('');
  const [isGenerateHeaderImage, setIsGenerateHeaderImage] = useState(true);

  const handleSubmit = () => {
    if (!prompt.trim() || isGenerating) {
      return;
    }

    const keywordList = keywords
      .split(',')
      .map((k) => k.trim())
      .filter(Boolean);

    onGenerate({
      generateHeaderImage: isGenerateHeaderImage,
      keywords: keywordList.length > 0 ? keywordList : undefined,
      prompt: prompt.trim(),
      targetWordCount,
      tone,
    });
  };

  return (
    <Card className="mx-auto max-w-2xl">
      <div className="space-y-5">
        <div className="mb-2">
          <h3 className="text-lg font-semibold">Generate X Article</h3>
          <p className="text-sm text-foreground/60">
            Describe the long-form article you want to generate
          </p>
        </div>

        <FormControl label="Prompt">
          <Textarea
            rows={4}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Describe the article topic, angle, and key points to cover..."
          />
        </FormControl>

        <div className="grid gap-4 sm:grid-cols-2">
          <FormControl label="Tone">
            <FormDropdown
              name="xArticleTone"
              value={tone}
              options={TONE_OPTIONS}
              onChange={(e: ChangeEvent<HTMLSelectElement>) =>
                setTone(e.target.value)
              }
            />
          </FormControl>

          <FormControl
            label={`Target Word Count: ${targetWordCount.toLocaleString()}`}
          >
            <Input
              type="range"
              min={2500}
              max={10000}
              step={500}
              value={targetWordCount}
              onChange={(e) => setTargetWordCount(Number(e.target.value))}
              className="mt-2 h-1.5 w-full cursor-pointer appearance-none rounded-full border-0 bg-transparent px-0 py-0 shadow-none accent-primary focus-visible:ring-0"
            />
            <div className="flex justify-between text-xs text-foreground/40">
              <span>2,500</span>
              <span>10,000</span>
            </div>
          </FormControl>
        </div>

        <FormControl label="Keywords">
          <Input
            name="xArticleKeywords"
            value={keywords}
            onChange={(e: ChangeEvent<HTMLInputElement>) =>
              setKeywords(e.target.value)
            }
            placeholder="keyword1, keyword2, keyword3"
          />
        </FormControl>

        <Checkbox
          isChecked={isGenerateHeaderImage}
          onCheckedChange={(checked) =>
            setIsGenerateHeaderImage(checked === true)
          }
          label={<span className="text-sm">Auto-generate header image</span>}
        />

        <Button
          label={isGenerating ? 'Generating...' : 'Generate X Article'}
          variant={ButtonVariant.DEFAULT}
          size={ButtonSize.DEFAULT}
          icon={<HiSparkles className="h-4 w-4" />}
          isLoading={isGenerating}
          isDisabled={!prompt.trim() || isGenerating}
          onClick={handleSubmit}
        />
      </div>
    </Card>
  );
}
