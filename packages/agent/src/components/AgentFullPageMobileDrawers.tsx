import { AgentOutputsPanel } from '@genfeedai/agent/components/AgentOutputsPanel';
import { AgentSetupPanel } from '@genfeedai/agent/components/AgentSetupPanel';
import { AgentSidebarContent } from '@genfeedai/agent/components/AgentSidebarContent';
import type { AgentSetupStatus } from '@genfeedai/agent/components/useAgentSetupStatus';
import type { AgentApiService } from '@genfeedai/agent/services/agent-api.service';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from '@ui/primitives';
import type { ReactElement } from 'react';

type AgentFullPageMobileDrawersProps = {
  apiService: AgentApiService;
  showThreadSidebar: boolean;
  mobileThreadsOpen: boolean;
  onMobileThreadsOpenChange: (open: boolean) => void;
  hasThreadOutputs: boolean;
  mobileOutputsOpen: boolean;
  onMobileOutputsOpenChange: (open: boolean) => void;
  showSetupPanel: boolean;
  mobileSetupOpen: boolean;
  onMobileSetupOpenChange: (open: boolean) => void;
  agentSetup: AgentSetupStatus;
  onOAuthConnect?: (platform: string) => void;
};

export function AgentFullPageMobileDrawers({
  apiService,
  showThreadSidebar,
  mobileThreadsOpen,
  onMobileThreadsOpenChange,
  hasThreadOutputs,
  mobileOutputsOpen,
  onMobileOutputsOpenChange,
  showSetupPanel,
  mobileSetupOpen,
  onMobileSetupOpenChange,
  agentSetup,
  onOAuthConnect,
}: AgentFullPageMobileDrawersProps): ReactElement {
  return (
    <>
      {showThreadSidebar ? (
        <Drawer
          open={mobileThreadsOpen}
          onOpenChange={onMobileThreadsOpenChange}
        >
          <DrawerContent className="max-h-[85vh]">
            <DrawerHeader>
              <DrawerTitle>Threads</DrawerTitle>
            </DrawerHeader>
            <div className="min-h-0 overflow-y-auto pb-6">
              <AgentSidebarContent apiService={apiService} />
            </div>
          </DrawerContent>
        </Drawer>
      ) : null}

      {hasThreadOutputs ? (
        <Drawer
          open={mobileOutputsOpen}
          onOpenChange={onMobileOutputsOpenChange}
        >
          <DrawerContent className="max-h-[85vh]">
            <DrawerHeader>
              <DrawerTitle>Outputs</DrawerTitle>
            </DrawerHeader>
            <div className="min-h-0 overflow-y-auto pb-6">
              <AgentOutputsPanel className="h-full" />
            </div>
          </DrawerContent>
        </Drawer>
      ) : null}

      {showSetupPanel ? (
        <Drawer open={mobileSetupOpen} onOpenChange={onMobileSetupOpenChange}>
          <DrawerContent className="max-h-[85vh]">
            <DrawerHeader>
              <DrawerTitle>Finish setting up</DrawerTitle>
            </DrawerHeader>
            <div className="min-h-0 overflow-y-auto pb-6">
              <AgentSetupPanel
                className="h-full"
                brand={agentSetup.brand}
                connectedConnections={agentSetup.connectedConnections}
                connectedPlatformsCount={agentSetup.connectedPlatformsCount}
                onOAuthConnect={onOAuthConnect}
              />
            </div>
          </DrawerContent>
        </Drawer>
      ) : null}
    </>
  );
}
