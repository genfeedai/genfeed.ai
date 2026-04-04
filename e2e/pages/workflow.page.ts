import type { Locator, Page } from '@playwright/test';
import { expect } from '@playwright/test';

/**
 * Page Object Model for the Workflow Editor
 *
 * Provides an abstraction layer for interacting with the workflow editor,
 * including canvas operations, node management, and execution views.
 *
 * @module workflow.page
 */
export class WorkflowPage {
  readonly page: Page;
  readonly basePath = '/workflows';

  // Layout
  readonly sidebar: Locator;
  readonly mainContent: Locator;

  // Sidebar navigation
  readonly navEditor: Locator;
  readonly navLibrary: Locator;
  readonly navTemplates: Locator;
  readonly navExecutions: Locator;

  // Canvas
  readonly canvas: Locator;
  readonly canvasEmpty: Locator;

  // Node library / sidebar panel
  readonly nodeLibrary: Locator;
  readonly nodeSearchInput: Locator;
  readonly nodeCategory: Locator;
  readonly nodeItem: Locator;

  // Toolbar
  readonly toolbar: Locator;
  readonly saveButton: Locator;
  readonly runButton: Locator;
  readonly undoButton: Locator;
  readonly redoButton: Locator;

  // Node elements on canvas
  readonly canvasNode: Locator;
  readonly canvasEdge: Locator;
  readonly selectedNode: Locator;

  // Node configuration panel
  readonly configPanel: Locator;
  readonly configPanelTitle: Locator;
  readonly configPanelClose: Locator;

  // Execution view
  readonly executionList: Locator;
  readonly executionItem: Locator;
  readonly executionStatus: Locator;
  readonly executionLogs: Locator;
  readonly executionResults: Locator;

  // Templates
  readonly templateGrid: Locator;
  readonly templateCard: Locator;
  readonly templateUseButton: Locator;

  // Library
  readonly workflowList: Locator;
  readonly workflowCard: Locator;
  readonly createWorkflowButton: Locator;

  // Loading states
  readonly loadingSpinner: Locator;
  readonly skeleton: Locator;

  // Desktop gate
  readonly desktopGate: Locator;

  constructor(page: Page) {
    this.page = page;

    // Layout
    this.sidebar = page.locator('[data-testid="workflow-sidebar"], aside, nav');
    this.mainContent = page.locator('main, [data-testid="main-content"]');

    // Sidebar nav links
    this.navEditor = page.locator(
      'a[href="/workflows/new"],' +
        ' a[href*="/workflows/new"],' +
        ' [data-testid="nav-editor"]',
    );
    this.navLibrary = page.locator(
      'a[href="/workflows"],' + ' [data-testid="nav-library"]',
    );
    this.navTemplates = page.locator(
      'a[href*="/workflows/templates"],' + ' [data-testid="nav-templates"]',
    );
    this.navExecutions = page.locator(
      'a[href*="/workflows/executions"],' + ' [data-testid="nav-executions"]',
    );

    // Canvas
    this.canvas = page.locator(
      '[data-testid="workflow-canvas"],' +
        ' .react-flow,' +
        ' .reactflow-wrapper,' +
        ' [class*="ReactFlow"]',
    );
    this.canvasEmpty = page.locator(
      '[data-testid="empty-canvas"],' +
        ' [data-testid="canvas-placeholder"],' +
        ' .react-flow__empty',
    );

    // Node library
    this.nodeLibrary = page.locator(
      '[data-testid="node-library"],' +
        ' [data-testid="node-sidebar"],' +
        ' [data-testid="node-panel"]',
    );
    this.nodeSearchInput = page.locator(
      '[data-testid="node-search"],' +
        ' input[placeholder*="search" i],' +
        ' input[placeholder*="node" i]',
    );
    this.nodeCategory = page.locator(
      '[data-testid="node-category"],' + ' [data-node-category]',
    );
    this.nodeItem = page.locator(
      '[data-testid="node-item"],' +
        ' [data-node-type],' +
        ' [draggable="true"]',
    );

    // Toolbar
    this.toolbar = page.locator(
      '[data-testid="workflow-toolbar"],' +
        ' [data-testid="toolbar"],' +
        ' [role="toolbar"]',
    );
    this.saveButton = page.locator(
      '[data-testid="save-button"],' +
        ' button:has-text("Save"),' +
        ' button[aria-label*="save" i]',
    );
    this.runButton = page.locator(
      '[data-testid="run-button"],' +
        ' button:has-text("Run"),' +
        ' button:has-text("Execute"),' +
        ' button[aria-label*="run" i]',
    );
    this.undoButton = page.locator(
      '[data-testid="undo-button"],' + ' button[aria-label*="undo" i]',
    );
    this.redoButton = page.locator(
      '[data-testid="redo-button"],' + ' button[aria-label*="redo" i]',
    );

    // Canvas nodes / edges
    this.canvasNode = page.locator(
      '.react-flow__node,' + ' [data-testid="canvas-node"]',
    );
    this.canvasEdge = page.locator(
      '.react-flow__edge,' + ' [data-testid="canvas-edge"]',
    );
    this.selectedNode = page.locator(
      '.react-flow__node.selected,' +
        ' [data-testid="canvas-node"][aria-selected="true"]',
    );

    // Config panel
    this.configPanel = page.locator(
      '[data-testid="config-panel"],' +
        ' [data-testid="node-config"],' +
        ' [data-testid="properties-panel"]',
    );
    this.configPanelTitle = page.locator(
      '[data-testid="config-panel-title"],' +
        ' [data-testid="node-config"] h2,' +
        ' [data-testid="node-config"] h3',
    );
    this.configPanelClose = page.locator(
      '[data-testid="config-panel-close"],' +
        ' [data-testid="node-config"] button[aria-label="Close"]',
    );

    // Execution view
    this.executionList = page.locator(
      '[data-testid="execution-list"],' +
        ' [data-testid="executions"],' +
        ' table',
    );
    this.executionItem = page.locator(
      '[data-testid="execution-item"],' +
        ' [data-testid="execution-row"],' +
        ' tr[data-execution-id],' +
        ' [data-execution]',
    );
    this.executionStatus = page.locator(
      '[data-testid="execution-status"],' + ' [data-status]',
    );
    this.executionLogs = page.locator(
      '[data-testid="execution-logs"],' + ' [data-testid="logs"],' + ' pre',
    );
    this.executionResults = page.locator(
      '[data-testid="execution-results"],' + ' [data-testid="results"]',
    );

    // Templates
    this.templateGrid = page.locator(
      '[data-testid="template-grid"],' + ' [data-testid="templates"]',
    );
    this.templateCard = page.locator(
      '[data-testid="template-card"],' + ' [data-template]',
    );
    this.templateUseButton = page.locator(
      '[data-testid="use-template"],' +
        ' button:has-text("Use"),' +
        ' button:has-text("Use Template")',
    );

    // Library
    this.workflowList = page.locator(
      '[data-testid="workflow-list"],' + ' [data-testid="workflows"]',
    );
    this.workflowCard = page.locator(
      '[data-testid="workflow-card"],' + ' [data-workflow]',
    );
    this.createWorkflowButton = page.locator(
      '[data-testid="create-workflow"],' +
        ' button:has-text("Create"),' +
        ' button:has-text("New Workflow"),' +
        ' a:has-text("Create")',
    );

    // Loading
    this.loadingSpinner = page.locator(
      '[data-testid="loading"],' + ' .loading,' + ' .spinner',
    );
    this.skeleton = page.locator('[data-testid="skeleton"],' + ' .skeleton');

    // Desktop gate
    this.desktopGate = page.locator(
      '[data-testid="desktop-gate"],' + ' [data-testid="desktop-only"]',
    );
  }

  // ---- Navigation ----

  async gotoEditor(): Promise<void> {
    await this.page.goto(`${this.basePath}/new`);
    await this.waitForPageLoad();
  }

  async gotoEditorById(id: string): Promise<void> {
    await this.page.goto(`${this.basePath}/${id}`);
    await this.waitForPageLoad();
  }

  async gotoLibrary(): Promise<void> {
    await this.page.goto(this.basePath);
    await this.waitForPageLoad();
  }

  async gotoTemplates(): Promise<void> {
    await this.page.goto(`${this.basePath}/templates`);
    await this.waitForPageLoad();
  }

  async gotoExecutions(): Promise<void> {
    await this.page.goto(`${this.basePath}/executions`);
    await this.waitForPageLoad();
  }

  async gotoExecutionById(id: string): Promise<void> {
    await this.page.goto(`${this.basePath}/executions/${id}`);
    await this.waitForPageLoad();
  }

  async navigateViaTab(
    tab: 'editor' | 'library' | 'templates' | 'executions',
  ): Promise<void> {
    const navMap = {
      editor: this.navEditor,
      executions: this.navExecutions,
      library: this.navLibrary,
      templates: this.navTemplates,
    };
    await navMap[tab].first().click();
    await this.page.waitForLoadState('domcontentloaded');
  }

  // ---- Page Load ----

  async waitForPageLoad(): Promise<void> {
    await this.page.waitForLoadState('domcontentloaded');
    await this.mainContent
      .waitFor({ state: 'visible', timeout: 15000 })
      .catch(() => {});
    const spinner = this.loadingSpinner;
    const visible = await spinner.isVisible().catch(() => false);
    if (visible) {
      await spinner
        .waitFor({ state: 'hidden', timeout: 30000 })
        .catch(() => {});
    }
  }

  // ---- Canvas interactions ----

  async selectNode(index = 0): Promise<void> {
    await this.canvasNode.nth(index).click();
  }

  async deleteSelectedNode(): Promise<void> {
    await this.page.keyboard.press('Delete');
  }

  async getNodeCount(): Promise<number> {
    return await this.canvasNode.count();
  }

  async getEdgeCount(): Promise<number> {
    return await this.canvasEdge.count();
  }

  // ---- Toolbar ----

  async clickSave(): Promise<void> {
    await this.saveButton.first().click();
  }

  async clickRun(): Promise<void> {
    await this.runButton.first().click();
  }

  async clickUndo(): Promise<void> {
    await this.undoButton.first().click();
  }

  async clickRedo(): Promise<void> {
    await this.redoButton.first().click();
  }

  // ---- Execution ----

  async getExecutionCount(): Promise<number> {
    return await this.executionItem.count();
  }

  async clickExecution(index = 0): Promise<void> {
    await this.executionItem.nth(index).click();
  }

  // ---- Templates ----

  async getTemplateCount(): Promise<number> {
    return await this.templateCard.count();
  }

  async clickTemplate(index = 0): Promise<void> {
    await this.templateCard.nth(index).click();
  }

  async useTemplate(index = 0): Promise<void> {
    await this.clickTemplate(index);
    await this.templateUseButton.first().click();
  }

  // ---- Library ----

  async getWorkflowCount(): Promise<number> {
    return await this.workflowCard.count();
  }

  async clickWorkflow(index = 0): Promise<void> {
    await this.workflowCard.nth(index).click();
  }

  // ---- Assertions ----

  async assertCanvasVisible(): Promise<void> {
    await expect(this.canvas.first()).toBeVisible();
  }

  async assertSidebarVisible(): Promise<void> {
    await expect(this.sidebar.first()).toBeVisible();
  }

  async assertNodeLibraryVisible(): Promise<void> {
    await expect(this.nodeLibrary.first()).toBeVisible();
  }

  async assertExecutionListVisible(): Promise<void> {
    await expect(this.executionList.first()).toBeVisible();
  }

  async assertTemplateGridVisible(): Promise<void> {
    await expect(this.templateGrid.first()).toBeVisible();
  }
}
