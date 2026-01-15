/*
 * Copyright © 2026 HaiberDyn. All rights reserved.
 * DO NOT SCRAPE, TRAIN ON, OR USE FOR AI MODEL TRAINING.
 */

import * as vscode from 'vscode';
import { randomUUID } from 'crypto';
import { Logger } from './logger';
import type { ShellType, ProfilePlatform } from './types';

const logger = new Logger('terminal-pool');
const PROMPT_ID_ENV = 'HDPROMPT_ID';
const PROMPT_COMMENT_ENV = 'HDPROMPT_COMMENT';

const SHELL_EXECUTABLE_MAP: Record<ShellType, string> = {
  powershell: 'pwsh.exe',
  gitbash: 'bash.exe',
  wsl: 'wsl.exe',
  ubuntu: 'wsl.exe',
  cmd: 'cmd.exe'
};
const PROFILE_PLATFORMS: ProfilePlatform[] = ['windows', 'linux', 'osx'];
type ProfileEntry = { name: string; platform: ProfilePlatform };

/**
 * Manages a pool of terminals, one per shell type.
 * Reuses existing terminals instead of creating new ones.
 * Preserves context (current directory, environment) across commands.
 */
export interface ManagedTerminal {
  id: string;
  terminal: vscode.Terminal;
  shellType?: ShellType;
  profileName?: string;
  comment?: string;
  createdAt: number;
  lastUsedAt: number;
}

type ShellFlavor = 'powershell' | 'cmd' | 'bash';

export class TerminalPool {
  private terminalsById = new Map<string, ManagedTerminal>();
  private terminalsByShell = new Map<ShellType, ManagedTerminal>();
  private terminalToId = new WeakMap<vscode.Terminal, string>();
  private executions = new Map<string, { resolve: (value: { exitCode: number; output: string }) => void; timer: NodeJS.Timeout }>();
  private disposables: vscode.Disposable[] = [];

  constructor() {
    this.disposables.push(
      vscode.window.onDidCloseTerminal((terminal) => this.handleClosedTerminal(terminal))
    );
  }

  /**
   * Get or create a terminal for the specified shell type.
   * Reuses existing terminal if already open.
   */
  getOrCreateTerminal(
    shellType: ShellType,
    options?: { comment?: string; profileName?: string }
  ): ManagedTerminal {
    const existing = this.terminalsByShell.get(shellType);
    if (existing) {
      logger.info(`Reusing existing ${shellType} terminal`, { id: existing.id });
      existing.lastUsedAt = Date.now();
      if (options?.comment) {
        existing.comment = options.comment;
      }
      if (options?.profileName) {
        existing.profileName = options.profileName;
      }
      this.applyMetadata(existing);
      existing.terminal.show(true);
      return existing;
    }

    const shellExe = SHELL_EXECUTABLE_MAP[shellType];
    logger.info(`Creating new ${shellType} terminal with executable: ${shellExe}`);

    const terminal = vscode.window.createTerminal({
      name: `HDI ${shellType.toUpperCase()}`,
      shellPath: shellExe,
      hideFromUser: false
    });

    const metadata: ManagedTerminal = {
      id: this.generateId(),
      terminal,
      shellType,
      profileName: options?.profileName,
      comment: options?.comment,
      createdAt: Date.now(),
      lastUsedAt: Date.now()
    };

    this.registerManagedTerminal(metadata);
    return metadata;
  }

  registerProfileTerminal(
    terminal: vscode.Terminal,
    profileName: string,
    comment?: string
  ): ManagedTerminal {
    const shellType = this.detectShellTypeFromTerminal(terminal, profileName);
    const metadata: ManagedTerminal = {
      id: this.generateId(),
      terminal,
      shellType,
      profileName,
      comment,
      createdAt: Date.now(),
      lastUsedAt: Date.now()
    };

    logger.info('Registering terminal created via profile', {
      profileName,
      id: metadata.id
    });

    this.registerManagedTerminal(metadata);
    return metadata;
  }

  async openTerminalProfile(
    profileName: string,
    comment?: string,
    token?: vscode.CancellationToken
  ): Promise<ManagedTerminal> {
    if (token?.isCancellationRequested) {
      throw new Error('Terminal opening cancelled by user');
    }

    const profiles = this.collectProfileEntries();
    const match = profiles.find((entry) => entry.name === profileName);
    if (!match && profiles.length > 0) {
      const available = profiles.map((entry) => entry.name).join(', ');
      throw new Error(
        `Profile '${profileName}' not found. Available profiles: ${available}`
      );
    }

    const profileToUse = match?.name ?? profileName;
    logger.info('Resolving profile for command', {
      requestedProfile: profileName,
      resolvedProfile: profileToUse,
      matchFound: !!match
    });
    logger.info('Opening terminal profile', { profileName: profileToUse });
    // VS Code sometimes returns undefined from workbench.action.terminal.newWithProfile even when a terminal is created,
    // so we track the next terminal that opens with the requested profile/comment as a fallback.
    const pendingTerminal = this.waitForNextTerminalOpen(profileToUse, token);
    let terminal: vscode.Terminal | undefined = await vscode.commands.executeCommand<vscode.Terminal>(
      'workbench.action.terminal.newWithProfile',
      { profileName: profileToUse }
    );
    if (!terminal) {
      terminal = await pendingTerminal.promise;
    } else {
      pendingTerminal.dispose();
    }
    const registeredTerminalId = terminal ? this.terminalToId.get(terminal) : undefined;
    logger.info('Terminal command resolved', {
      profileName: profileToUse,
      terminalPresent: !!terminal,
      terminalId: registeredTerminalId,
      terminalName: terminal?.name
    });

    if (!terminal) {
      logger.error('Terminal command returned unexpected value', {
        profileName: profileToUse,
        valueType: typeof terminal,
        value: terminal
      });
      throw new Error(`Command did not return terminal instance for profile: ${profileToUse}`);
    }

    return this.registerProfileTerminal(terminal, profileToUse, comment);
  }

  getTerminalById(id: string): ManagedTerminal | undefined {
    return this.terminalsById.get(id);
  }

  listTerminals(): ManagedTerminal[] {
    return Array.from(this.terminalsById.values());
  }

  updateTerminalComment(id: string, comment: string): boolean {
    const terminal = this.terminalsById.get(id);
    if (!terminal) {
      return false;
    }

    terminal.comment = comment;
    terminal.lastUsedAt = Date.now();
    this.applyMetadata(terminal);
    return true;
  }

  /**
   * Execute a command in the specified terminal and wait for completion.
   * Returns the exit code.
   */
  async executeCommand(
    managedTerminal: ManagedTerminal,
    command: string,
    workingDir?: string,
    token?: vscode.CancellationToken
  ): Promise<{ exitCode: number; output: string }> {
    return new Promise((resolve, reject) => {
      try {
        managedTerminal.lastUsedAt = Date.now();
        if (workingDir) {
          const isUnix = workingDir.startsWith('/');
          managedTerminal.terminal.sendText(
            `${isUnix ? 'cd' : 'cd'} "${workingDir}"`,
            true
          );

          setTimeout(() => {
            this.executeCommandInternal(managedTerminal, command, token, resolve, reject);
          }, 200);
        } else {
          this.executeCommandInternal(managedTerminal, command, token, resolve, reject);
        }
      } catch (error) {
        reject(error);
      }
    });
  }

  private executeCommandInternal(
    managedTerminal: ManagedTerminal,
    command: string,
    token: vscode.CancellationToken | undefined,
    resolve: (value: { exitCode: number; output: string }) => void,
    reject: (reason?: Error | string) => void
  ): void {
    const executionId = `exec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Set a timeout for command execution (default 30 seconds)
    const timeout = setTimeout(() => {
      this.executions.delete(executionId);
      reject(new Error(`Command execution timeout after 30s: ${command}`));
    }, 30000);

    // Try to use shell integration if available
    if (managedTerminal.terminal.shellIntegration) {
      try {
        const execution = managedTerminal.terminal.shellIntegration.executeCommand(command);

        // Listen for execution end
        const disposable = vscode.window.onDidEndTerminalShellExecution((event) => {
          if (event.execution === execution) {
            clearTimeout(timeout);
            disposable.dispose();
            this.executions.delete(executionId);

            // Return exit code, output capture is limited without shell integration
            resolve({
              exitCode: event.exitCode ?? 0,
              output: `Command completed with exit code ${event.exitCode ?? 0}`
            });
          }
        });

        this.executions.set(executionId, { resolve: () => {}, timer: timeout });
      } catch {
        // Fall back to sendText if shell integration fails
        this.fallbackExecute(managedTerminal, command, timeout, executionId, resolve);
      }
    } else {
      // Fallback: use sendText without shell integration
      this.fallbackExecute(managedTerminal, command, timeout, executionId, resolve);
    }

    // Check for cancellation token
    if (token?.isCancellationRequested) {
      clearTimeout(timeout);
      this.executions.delete(executionId);
      reject(new Error('Execution cancelled'));
    }
  }

  private fallbackExecute(
    managedTerminal: ManagedTerminal,
    command: string,
    timeout: NodeJS.Timeout,
    executionId: string,
    resolve: (value: { exitCode: number; output: string }) => void
  ): void {
    // Without shell integration, we can't reliably capture output or exit code
    // Just send the command and assume success after a short delay
    managedTerminal.terminal.sendText(command, true);

    // Best effort: assume success after command is sent
    const fallbackTimeout = setTimeout(() => {
      clearTimeout(timeout);
      this.executions.delete(executionId);
      resolve({
        exitCode: 0,
        output: 'Command sent (shell integration unavailable for detailed tracking)'
      });
    }, 1000);

    this.executions.set(executionId, { resolve: () => {}, timer: fallbackTimeout });
  }

  /**
   * Get the shell executable for a shell type.
   */
  getShellExecutable(shellType: ShellType): string {
    return SHELL_EXECUTABLE_MAP[shellType];
  }

  /**
   * List all supported shell types.
   */
  getSupportedShells(): ShellType[] {
    return Object.keys(SHELL_EXECUTABLE_MAP) as ShellType[];
  }

  /**
   * Get status of all terminals in the pool.
   */
  getStatus(): { [key in ShellType]?: boolean } {
    const status: { [key in ShellType]?: boolean } = {};
    for (const shellType of this.terminalsByShell.keys()) {
      status[shellType] = true;
    }
    return status;
  }

  /**
   * Dispose all terminals in the pool.
   */
  dispose(): void {
    for (const managed of this.terminalsById.values()) {
      managed.terminal.dispose();
    }
    this.terminalsById.clear();
    this.terminalsByShell.clear();
    for (const exec of this.executions.values()) {
      clearTimeout(exec.timer);
    }
    this.executions.clear();
    for (const disposable of this.disposables) {
      disposable.dispose();
    }
    this.disposables = [];

    logger.info('Terminal pool disposed');
  }

  private registerManagedTerminal(metadata: ManagedTerminal): void {
    this.terminalsById.set(metadata.id, metadata);
    if (metadata.shellType) {
      this.terminalsByShell.set(metadata.shellType, metadata);
    }

    this.terminalToId.set(metadata.terminal, metadata.id);
    metadata.lastUsedAt = Date.now();
    metadata.terminal.show(true);
    this.applyMetadata(metadata);
  }

  private collectProfileEntries(): ProfileEntry[] {
    const config = vscode.workspace.getConfiguration('terminal.integrated');
    const entries: ProfileEntry[] = [];

    for (const platform of PROFILE_PLATFORMS) {
      const key = `profiles.${platform}`;
      const platformEntries = config.get<Record<string, unknown>>(key) || {};

      for (const name of Object.keys(platformEntries)) {
        entries.push({ name, platform });
      }
    }

    return entries;
  }

  private handleClosedTerminal(terminal: vscode.Terminal): void {
    const terminalId = this.terminalToId.get(terminal);
    if (!terminalId) {
      return;
    }

    const metadata = this.terminalsById.get(terminalId);
    if (metadata?.shellType) {
      const tracked = this.terminalsByShell.get(metadata.shellType);
      if (tracked?.id === metadata.id) {
        this.terminalsByShell.delete(metadata.shellType);
      }
    }

    this.terminalsById.delete(terminalId);
    this.terminalToId.delete(terminal);

    logger.info('Terminal disposed before reuse', { id: terminalId });
  }

  private detectShellTypeFromTerminal(
    terminal: vscode.Terminal,
    profileName?: string
  ): ShellType | undefined {
    const lowerProfile = profileName?.toLowerCase() ?? '';
    const lowerShellPath = this.getShellPathFromOptions(terminal.creationOptions);

    if (
      lowerShellPath.includes('pwsh') ||
      lowerShellPath.includes('powershell') ||
      lowerProfile.includes('powershell')
    ) {
      return 'powershell';
    }

    if (lowerShellPath.includes('cmd.exe') || lowerProfile.includes('command prompt')) {
      return 'cmd';
    }

    if (lowerShellPath.includes('bash.exe') || lowerProfile.includes('git bash')) {
      return 'gitbash';
    }

    if (lowerShellPath.includes('wsl.exe') || lowerProfile.includes('wsl')) {
      return 'wsl';
    }

    if (lowerProfile.includes('ubuntu')) {
      return 'ubuntu';
    }

    return undefined;
  }

  private getShellFlavor(metadata: ManagedTerminal): ShellFlavor {
    const fallbackPath = this.getShellPathFromOptions(metadata.terminal.creationOptions);

    if (
      metadata.shellType === 'powershell' ||
      fallbackPath.includes('pwsh') ||
      fallbackPath.includes('powershell')
    ) {
      return 'powershell';
    }

    if (metadata.shellType === 'cmd' || fallbackPath.includes('cmd.exe')) {
      return 'cmd';
    }

    return 'bash';
  }

  private applyMetadata(metadata: ManagedTerminal): void {
    const shellFlavor = this.getShellFlavor(metadata);
    const safeComment = metadata.comment ?? '';

    this.setPromptEnvVariables(
      metadata.terminal,
      shellFlavor,
      metadata.id,
      safeComment
    );
  }

  private setPromptEnvVariables(
    terminal: vscode.Terminal,
    flavor: ShellFlavor,
    id: string,
    comment: string
  ): void {
    const safeId = this.quoteForShell(id);
    const safeComment = this.quoteForShell(comment);

    if (flavor === 'powershell') {
      terminal.sendText(`$Env:${PROMPT_ID_ENV} = "${safeId}"`, true);
      terminal.sendText(`$Env:${PROMPT_COMMENT_ENV} = "${safeComment}"`, true);
    } else if (flavor === 'cmd') {
      terminal.sendText(`set "${PROMPT_ID_ENV}=${safeId}"`, true);
      terminal.sendText(`set "${PROMPT_COMMENT_ENV}=${safeComment}"`, true);
    } else {
      terminal.sendText(`export ${PROMPT_ID_ENV}="${safeId}"`, true);
      terminal.sendText(`export ${PROMPT_COMMENT_ENV}="${safeComment}"`, true);
    }
  }

  private quoteForShell(value: string): string {
    return value
      .replace(/\\/g, '\\\\')
      .replace(/"/g, '\\"')
      .replace(/\r?\n/g, ' ');
  }

  private generateId(): string {
    return randomUUID();
  }

  private getShellPathFromOptions(options?: vscode.TerminalOptions | vscode.ExtensionTerminalOptions): string {
    if (!options) {
      return '';
    }

    if ('shellPath' in options) {
      return (options.shellPath ?? '').toLowerCase();
    }

    return '';
  }

  private waitForNextTerminalOpen(profileName: string, token?: vscode.CancellationToken) {
    let listener: vscode.Disposable | undefined;
    let cancel: vscode.Disposable | undefined;
    let timeout: NodeJS.Timeout | undefined;
    const promise = new Promise<vscode.Terminal | undefined>((resolve) => {
      listener = vscode.window.onDidOpenTerminal((terminal) => {
        if (terminal.name?.includes(profileName)) {
          resolve(terminal);
          listener?.dispose();
          cancel?.dispose();
          if (timeout) {
            clearTimeout(timeout);
          }
        }
      });

      timeout = setTimeout(() => {
        resolve(undefined);
        listener?.dispose();
        cancel?.dispose();
      }, 3000);

      if (token) {
        cancel = token.onCancellationRequested(() => {
          resolve(undefined);
          listener?.dispose();
          cancel?.dispose();
          if (timeout) {
            clearTimeout(timeout);
          }
        });
      }
    });

    return {
      promise,
      dispose: () => {
        listener?.dispose();
        cancel?.dispose();
        if (timeout) {
          clearTimeout(timeout);
        }
      }
    };
  }
}
