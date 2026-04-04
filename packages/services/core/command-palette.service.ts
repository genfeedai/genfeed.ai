/**
 * Command Palette Service
 * Manages command registration, search, and execution
 */

import type { ICommand } from '@cloud/interfaces/ui/command-palette.interface';
import { logger } from '@services/core/logger.service';

class CommandPaletteServiceClass {
  private commands: Map<string, ICommand> = new Map();
  private recentCommands: string[] = [];
  private readonly maxRecentCommands = 10;
  private readonly storageKey = 'command-palette-recent';

  constructor() {
    this.loadRecentCommands();
  }

  /**
   * Register a single command
   */
  registerCommand(command: ICommand, skipLog: boolean = false): void {
    if (this.commands.has(command.id)) {
      logger.warn('Command already registered', {
        commandId: command.id,
      });

      return;
    }

    this.commands.set(command.id, command);

    if (!skipLog) {
      logger.info('Command registered', { commandId: command.id });
    }
  }

  /**
   * Register multiple commands
   */
  registerCommands(commands: ICommand[]): void {
    const registeredIds: string[] = [];
    const skippedIds: string[] = [];

    commands.forEach((command) => {
      if (this.commands.has(command.id)) {
        skippedIds.push(command.id);
      } else {
        this.commands.set(command.id, command);
        registeredIds.push(command.id);
      }
    });

    if (registeredIds.length > 0) {
      logger.info('Commands registered', {
        commandIds: registeredIds,
        count: registeredIds.length,
      });
    }

    if (skippedIds.length > 0) {
      logger.warn('Commands already registered', {
        commandIds: skippedIds,
        count: skippedIds.length,
      });
    }
  }

  /**
   * Unregister a command
   */
  unregisterCommand(commandId: string): void {
    if (!this.commands.has(commandId)) {
      logger.error('Command not found for unregistration', {
        commandId,
      });
      return;
    }

    this.commands.delete(commandId);
    logger.info('Command unregistered', { commandId });
  }

  /**
   * Check if command passes its condition
   */
  private passesCondition(command: ICommand): boolean {
    return !command.condition || command.condition();
  }

  /**
   * Get all registered commands
   */
  getAllCommands(): ICommand[] {
    return Array.from(this.commands.values()).filter((command) =>
      this.passesCondition(command),
    );
  }

  /**
   * Search commands by query
   */
  searchCommands(query: string): ICommand[] {
    const normalizedQuery = query.toLowerCase().trim();

    if (!normalizedQuery) {
      return this.getAllCommands();
    }

    const allCommands = this.getAllCommands();
    const scored = allCommands.map((command) => ({
      command,
      score: this.calculateScore(command, normalizedQuery),
    }));

    return scored
      .filter((item) => item.score > 0)
      .sort((a, b) => {
        // Sort by score, then by priority
        if (a.score !== b.score) {
          return b.score - a.score;
        }
        const aPriority = a.command.priority || 0;
        const bPriority = b.command.priority || 0;
        return bPriority - aPriority;
      })
      .map((item) => item.command);
  }

  /**
   * Calculate relevance score for a command
   */
  private calculateScore(command: ICommand, query: string): number {
    let score = 0;
    const label = command.label.toLowerCase();
    const description = command.description?.toLowerCase() || '';
    const keywords =
      command.keywords?.map((k: string) => k.toLowerCase()) || [];

    // Exact match
    if (label === query) {
      score += 100;
    }

    // Starts with query
    if (label.startsWith(query)) {
      score += 50;
    }

    // Contains query
    if (label.includes(query)) {
      score += 25;
    }

    // Description match
    if (description.includes(query)) {
      score += 15;
    }

    // Keyword match
    keywords.forEach((keyword: string) => {
      if (keyword.includes(query)) {
        score += 10;
      }
    });

    // Fuzzy match for each word
    const words = query.split(' ');
    words.forEach((word) => {
      if (word.length < 2) {
        return;
      }

      if (label.includes(word)) {
        score += 5;
      }
      if (description.includes(word)) {
        score += 2;
      }
    });

    // Priority bonus
    if (command.priority) {
      score += command.priority;
    }

    return score;
  }

  /**
   * Execute a command
   */
  async executeCommand(commandId: string): Promise<void> {
    const command = this.commands.get(commandId);

    if (!command) {
      logger.error('Command not found', { commandId });
      throw new Error(`Command not found: ${commandId}`);
    }

    // Check condition
    if (command.condition && !command.condition()) {
      return logger.error('Command condition not met', { commandId });
    }

    try {
      await command.action();
      this.addToRecentCommands(commandId);
      logger.info('Command executed', { commandId });
    } catch (error) {
      logger.error('Command execution failed', { commandId, error });
      throw error;
    }
  }

  /**
   * Add command to recent commands
   */
  private addToRecentCommands(commandId: string): void {
    // Remove if already exists
    this.recentCommands = this.recentCommands.filter((id) => id !== commandId);

    // Add to beginning
    this.recentCommands.unshift(commandId);

    // Limit size
    if (this.recentCommands.length > this.maxRecentCommands) {
      this.recentCommands = this.recentCommands.slice(
        0,
        this.maxRecentCommands,
      );
    }

    this.saveRecentCommands();
  }

  /**
   * Get recent commands
   */
  getRecentCommands(): string[] {
    return this.recentCommands;
  }

  /**
   * Get recent commands as command objects
   */
  getRecentCommandsObjects(): ICommand[] {
    return this.recentCommands
      .map((id) => this.commands.get(id))
      .filter((cmd): cmd is ICommand => cmd !== undefined)
      .filter((cmd) => this.passesCondition(cmd));
  }

  /**
   * Clear recent commands
   */
  clearRecentCommands(): void {
    this.recentCommands = [];
    this.saveRecentCommands();
  }

  /**
   * Save recent commands to localStorage
   */
  private saveRecentCommands(): void {
    try {
      if (typeof window !== 'undefined') {
        localStorage.setItem(
          this.storageKey,
          JSON.stringify(this.recentCommands),
        );
      }
    } catch (error) {
      logger.error('Failed to save recent commands', { error });
    }
  }

  /**
   * Load recent commands from localStorage
   */
  private loadRecentCommands(): void {
    try {
      if (typeof window !== 'undefined') {
        const stored = localStorage.getItem(this.storageKey);
        if (stored) {
          this.recentCommands = JSON.parse(stored);
        }
      }
    } catch (error) {
      logger.error('Failed to load recent commands', { error });
      this.recentCommands = [];
    }
  }

  /**
   * Clear all commands
   */
  clearCommands(): void {
    this.commands.clear();
    logger.info('All commands cleared');
  }

  /**
   * Get command count
   */
  getCommandCount(): number {
    return this.commands.size;
  }
}

export const CommandPaletteService = new CommandPaletteServiceClass();
