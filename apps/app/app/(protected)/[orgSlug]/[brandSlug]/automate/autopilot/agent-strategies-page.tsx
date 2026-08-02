'use client';

import { APP_ROUTES } from '@genfeedai/constants';
import { ButtonVariant } from '@genfeedai/enums';
import type { AgentStrategy } from '@services/automation/agent-strategies.service';
import AppTable from '@ui/display/table/Table';
import Container from '@ui/layout/container/Container';
import { Button } from '@ui/primitives/button';
import { Cpu, Plus } from 'lucide-react';

import AgentStrategiesEmptyState from './AgentStrategiesEmptyState';
import AgentStrategiesInfoBanner from './AgentStrategiesInfoBanner';
import AgentStrategyDialog from './AgentStrategyDialog';
import { useAgentStrategiesColumns } from './useAgentStrategiesColumns';
import { useAgentStrategiesPage } from './useAgentStrategiesPage';

export default function AgentStrategiesPage() {
  const {
    handleDialogChange,
    handleRowClick,
    handleRunNow,
    handleSubmit,
    handleToggle,
    href,
    isDialogOpen,
    isLoading,
    isSubmitting,
    openCreateDialog,
    openEditDialog,
    selectedStrategy,
    strategies,
  } = useAgentStrategiesPage();

  const { columns, actions } = useAgentStrategiesColumns(
    openEditDialog,
    handleRunNow,
    handleToggle,
  );

  return (
    <>
      <Container
        label="Autopilot"
        description="Use autopilot policies to schedule adaptive agent runs."
        icon={Cpu}
        right={
          <Button
            label={
              <>
                <Plus /> Add Autopilot
              </>
            }
            variant={ButtonVariant.DEFAULT}
            onClick={openCreateDialog}
          />
        }
      >
        <AgentStrategiesInfoBanner
          workflowsHref={href(APP_ROUTES.AUTOMATE.WORKFLOWS)}
        />
        <AppTable<AgentStrategy>
          items={strategies}
          columns={columns}
          actions={actions}
          isLoading={isLoading}
          getRowKey={(strategy) => strategy.id}
          onRowClick={handleRowClick}
          emptyState={
            <AgentStrategiesEmptyState onAddClick={openCreateDialog} />
          }
        />
      </Container>

      <AgentStrategyDialog
        initialStrategy={selectedStrategy}
        isOpen={isDialogOpen}
        isSubmitting={isSubmitting}
        onOpenChange={handleDialogChange}
        onSubmit={handleSubmit}
      />
    </>
  );
}
