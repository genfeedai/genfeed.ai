'use client';

import { ButtonVariant } from '@genfeedai/enums';
import { useUIStore } from '@genfeedai/workflow-ui/stores';
import { Button } from '@ui/primitives/button';
import { Input } from '@ui/primitives/input';
import {
  BookOpen,
  FolderOpen,
  LayoutTemplate,
  MessageCircle,
  Plus,
  Sparkles,
  X,
} from 'lucide-react';
import { memo, useCallback, useRef } from 'react';
import { FaXTwitter } from 'react-icons/fa6';
import { logger } from '@/lib/logger';
import { useSettingsStore } from '@/store/settingsStore';
import { useWorkflowStore } from '@/store/workflowStore';

interface ActionCardProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  onClick: () => void;
  badge?: string;
}

function ActionCard({
  icon,
  title,
  description,
  onClick,
  badge,
}: ActionCardProps) {
  return (
    <Button
      variant={ButtonVariant.GHOST}
      withWrapper={false}
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-lg bg-secondary/50 p-3 text-left transition hover:bg-secondary"
    >
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-background">
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="font-medium text-foreground">{title}</span>
          {badge && (
            <span className="rounded bg-primary/20 px-1.5 py-0.5 text-xs font-medium text-primary">
              {badge}
            </span>
          )}
        </div>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
    </Button>
  );
}

interface LinkItemProps {
  icon: React.ReactNode;
  label: string;
  href: string;
}

function LinkItem({ icon, label, href }: LinkItemProps) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-2 text-sm text-muted-foreground transition hover:text-foreground"
    >
      {icon}
      <span>{label}</span>
    </a>
  );
}

function WelcomeModalComponent() {
  const { openModal, closeModal, toggleAIGenerator } = useUIStore();
  const { clearWorkflow } = useWorkflowStore();
  const { setHasSeenWelcome } = useSettingsStore();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleClose = useCallback(() => {
    setHasSeenWelcome(true);
    closeModal();
  }, [setHasSeenWelcome, closeModal]);

  const handleBlankCanvas = useCallback(() => {
    clearWorkflow();
    handleClose();
  }, [clearWorkflow, handleClose]);

  const handleTemplates = useCallback(() => {
    setHasSeenWelcome(true);
    openModal('templates');
  }, [setHasSeenWelcome, openModal]);

  const handleImport = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const data = JSON.parse(event.target?.result as string);

          // Basic validation
          if (!data.nodes || !data.edges || !data.name) {
            logger.error('Invalid workflow file', null, {
              context: 'WelcomeModal',
            });
            return;
          }

          useWorkflowStore.getState().loadWorkflow(data);
          handleClose();
        } catch (error) {
          logger.error('Failed to parse workflow file', error, {
            context: 'WelcomeModal',
          });
        }
      };
      reader.readAsText(file);

      // Reset input
      e.target.value = '';
    },
    [handleClose],
  );

  const handleAIGenerator = useCallback(() => {
    toggleAIGenerator();
    handleClose();
  }, [toggleAIGenerator, handleClose]);

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-50 bg-black/60" onClick={handleClose} />

      {/* Modal */}
      <div className="fixed left-1/2 top-1/2 z-50 w-full max-w-2xl -translate-x-1/2 -translate-y-1/2 rounded-xl bg-card p-6 shadow-2xl">
        {/* Close button */}
        <Button
          variant={ButtonVariant.GHOST}
          withWrapper={false}
          onClick={handleClose}
          className="absolute right-3 top-3 rounded-md p-1.5 text-muted-foreground transition hover:bg-secondary hover:text-foreground"
          ariaLabel="Close"
        >
          <X className="h-5 w-5" />
        </Button>

        <div className="flex gap-8">
          {/* Left side - Branding */}
          <div className="flex w-56 shrink-0 flex-col">
            {/* Logo */}
            <div className="mb-4 flex items-center gap-3">
              <img
                src="https://cdn.genfeed.ai/assets/branding/logo-white.png"
                alt="Genfeed"
                className="h-10 w-10 object-contain"
              />
              <span className="text-xl font-semibold">Genfeed</span>
            </div>

            {/* Description */}
            <p className="mb-8 text-sm leading-relaxed text-muted-foreground">
              A node-based workflow editor for AI content generation. Connect
              nodes to build pipelines that generate images and videos.
            </p>

            {/* Links */}
            <div className="mt-auto flex flex-col gap-3">
              <LinkItem
                icon={<BookOpen className="h-4 w-4" />}
                label="Docs"
                href="https://docs.genfeed.ai"
              />
              <LinkItem
                icon={<MessageCircle className="h-4 w-4" />}
                label="Discord"
                href="https://discord.gg/Qy867n83Z4"
              />
              <LinkItem
                icon={<FaXTwitter className="h-4 w-4" />}
                label="Twitter"
                href="https://twitter.com/genfeedai"
              />
            </div>
          </div>

          {/* Right side - Actions */}
          <div className="flex flex-1 flex-col gap-2">
            <ActionCard
              icon={<Plus className="h-5 w-5 text-muted-foreground" />}
              title="Blank canvas"
              description="Start from scratch"
              onClick={handleBlankCanvas}
            />
            <ActionCard
              icon={<FolderOpen className="h-5 w-5 text-muted-foreground" />}
              title="Import workflow"
              description="Open existing file"
              onClick={handleImport}
            />
            <ActionCard
              icon={
                <LayoutTemplate className="h-5 w-5 text-muted-foreground" />
              }
              title="Templates"
              description="Pre-built workflows"
              onClick={handleTemplates}
            />
            <ActionCard
              icon={<Sparkles className="h-5 w-5 text-primary" />}
              title="AI Generator"
              description="Describe what you want to build"
              onClick={handleAIGenerator}
              badge="BETA"
            />
          </div>
        </div>

        {/* Hidden file input */}
        <Input
          ref={fileInputRef}
          type="file"
          accept=".json"
          onChange={handleFileChange}
          className="hidden"
        />
      </div>
    </>
  );
}

export const WelcomeModal = memo(WelcomeModalComponent);
