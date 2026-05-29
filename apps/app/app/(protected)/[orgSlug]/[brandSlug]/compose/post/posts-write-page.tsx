'use client';

import Card from '@ui/card/Card';
import { Input } from '@ui/primitives/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ui/primitives/select';
import { Textarea } from '@ui/primitives/textarea';
import { Suspense } from 'react';
import PostsWriteAccountBar from './posts-write-account-bar';
import PostsWriteActionBar from './posts-write-action-bar';
import { TONE_OPTIONS } from './posts-write-page.helpers';
import PostsWritePreviewPanel from './posts-write-preview-panel';
import PostsWriteThreadEditor from './posts-write-thread-editor';
import { usePostsWritePage } from './usePostsWritePage';

function PostsWritePageContent() {
  const {
    addDraftSegment,
    canGenerate,
    characterLimit,
    connectedCredentials,
    desktop,
    desktopPlatform,
    draftSegments,
    error,
    formatOptions,
    generatePostLabel,
    handleCopyDraft,
    handleGenerate,
    handleStartBlankDraft,
    hasConnectedCredentials,
    hasPrefilledIngredient,
    isSubmitting,
    localContent,
    prompt,
    removeDraftSegment,
    selectedCredential,
    selectedCredentialId,
    selectedFormat,
    setDesktopPlatform,
    setLocalContent,
    setPrompt,
    setSelectedCredentialId,
    setSelectedFormat,
    setTone,
    setWorkingTitle,
    tone,
    updateDraftSegment,
    workingTitle,
  } = usePostsWritePage();

  return (
    <section
      id="post-compose-workspace"
      className="grid gap-6 lg:grid-cols-[1.25fr_0.75fr]"
    >
      <Card
        bodyClassName="gap-0 p-6"
        className="border-white/10 bg-white/[0.03]"
      >
        <div className="grid gap-5">
          <PostsWriteAccountBar
            connectedCredentials={connectedCredentials}
            desktop={desktop}
            desktopPlatform={desktopPlatform}
            formatOptions={formatOptions}
            hasConnectedCredentials={hasConnectedCredentials}
            hasPrefilledIngredient={hasPrefilledIngredient}
            onCredentialChange={setSelectedCredentialId}
            onDesktopPlatformChange={setDesktopPlatform}
            onFormatChange={setSelectedFormat}
            selectedCredential={selectedCredential}
            selectedCredentialId={selectedCredentialId}
            selectedFormat={selectedFormat}
          />

          <div className="grid gap-2 text-sm text-foreground/75">
            <span>Working title</span>
            <Input
              value={workingTitle}
              onChange={(event) => setWorkingTitle(event.target.value)}
              placeholder="Optional internal title for the draft"
            />
          </div>

          <label
            className="grid gap-2 text-sm text-foreground/75"
            htmlFor="post-compose-prompt"
          >
            <span>Prompt</span>
            <Textarea
              id="post-compose-prompt"
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              placeholder="Describe the post you want to generate..."
              className="min-h-28 rounded-xl border border-white/10 bg-black/20 p-3 text-sm text-foreground outline-none transition focus:border-white/20"
            />
          </label>

          {selectedFormat === 'thread' ? (
            <PostsWriteThreadEditor
              characterLimit={characterLimit}
              draftSegments={draftSegments}
              onAddSegment={addDraftSegment}
              onRemoveSegment={removeDraftSegment}
              onUpdateSegment={updateDraftSegment}
            />
          ) : (
            <label
              className="grid gap-2 text-sm text-foreground/75"
              htmlFor="post-compose-draft-content"
            >
              <span>Draft content</span>
              <Textarea
                id="post-compose-draft-content"
                value={localContent}
                onChange={(event) => setLocalContent(event.target.value)}
                placeholder="Write the post here if you just want a clean composer and a copy button."
                className="min-h-44 rounded-xl border border-white/10 bg-black/20 p-3 text-sm text-foreground outline-none transition focus:border-white/20"
              />
            </label>
          )}

          <div className="grid gap-2 text-sm text-foreground/75">
            <span>Tone</span>
            <Select
              value={tone}
              onValueChange={(value) =>
                setTone(value as Parameters<typeof setTone>[0])
              }
            >
              <SelectTrigger aria-label="Tone">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TONE_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {error ? (
            <p role="alert" className="text-sm text-red-400">
              {error}
            </p>
          ) : null}

          <PostsWriteActionBar
            canGenerate={canGenerate}
            canSaveDraft={
              Boolean(selectedCredential) && selectedFormat !== 'x-article'
            }
            generatePostLabel={generatePostLabel}
            isSubmitting={isSubmitting}
            onCopy={() => void handleCopyDraft()}
            onGenerate={() => void handleGenerate(selectedFormat)}
            onSaveDraft={() => void handleStartBlankDraft()}
            selectedFormat={selectedFormat}
          />
        </div>
      </Card>

      <PostsWritePreviewPanel
        characterLimit={characterLimit}
        desktopPlatform={desktopPlatform}
        draftSegments={draftSegments}
        selectedCredential={selectedCredential}
        selectedFormat={selectedFormat}
      />
    </section>
  );
}

export default function PostsWritePage() {
  return (
    <Suspense fallback={null}>
      <PostsWritePageContent />
    </Suspense>
  );
}
