'use client';

import { useUIStore } from '@genfeedai/workflow-ui/stores';
import { BookOpen, HelpCircle, MessageCircle, Store } from 'lucide-react';
import { XIcon } from '@/components/toolbar/icons';
import { InfoBox, LinkCard } from '@/components/ui/settings-section';

export function HelpTab() {
  const { openModal, closeModal } = useUIStore();

  const handleShowWelcome = () => {
    closeModal();
    setTimeout(() => openModal('welcome'), 100);
  };

  return (
    <div className="space-y-6">
      {/* Welcome Screen */}
      <div className="space-y-3">
        <h3 className="text-sm font-medium text-foreground">Getting Started</h3>
        <button
          onClick={handleShowWelcome}
          className="flex w-full items-center gap-3 rounded-lg border border-border p-4 text-left transition hover:border-primary/50 hover:bg-secondary/30"
        >
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
            <HelpCircle className="h-5 w-5 text-primary" />
          </div>
          <div>
            <div className="font-medium text-foreground">
              Show Welcome Screen
            </div>
            <p className="text-sm text-muted-foreground">
              View the welcome modal with quick start options
            </p>
          </div>
        </button>
      </div>

      {/* External Links */}
      <div className="space-y-3">
        <h3 className="text-sm font-medium text-foreground">Resources</h3>
        <div className="space-y-2">
          <LinkCard
            href="https://docs.genfeed.ai"
            icon={BookOpen}
            title="Documentation"
            description="Learn how to use Genfeed"
          />
          <LinkCard
            href="https://discord.gg/Qy867n83Z4"
            icon={MessageCircle}
            title="Discord Community"
            description="Get help and share workflows"
          />
          <LinkCard
            href="https://twitter.com/genfeedai"
            icon={XIcon}
            title="Twitter / X"
            description="Follow for updates"
          />
          <LinkCard
            href="https://marketplace.genfeed.ai"
            icon={Store}
            title="Marketplace"
            description="Browse workflows, prompts & assets"
          />
        </div>
      </div>

      {/* Version Info */}
      <InfoBox>
        <div className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">Genfeed</span> v0.1.0
        </div>
      </InfoBox>
    </div>
  );
}
