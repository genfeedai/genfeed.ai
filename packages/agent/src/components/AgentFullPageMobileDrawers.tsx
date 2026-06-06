import { AgentOutputsPanel } from '@genfeedai/agent/components/AgentOutputsPanel';
import { AgentSidebarContent } from '@genfeedai/agent/components/AgentSidebarContent';
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
};

export function AgentFullPageMobileDrawers({
  apiService,
  showThreadSidebar,
  mobileThreadsOpen,
  onMobileThreadsOpenChange,
  hasThreadOutputs,
  mobileOutputsOpen,
  onMobileOutputsOpenChange,
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
    </>
  );
}
