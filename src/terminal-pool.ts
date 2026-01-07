/*
 * Copyright © 2026 HaiberDyn. All rights reserved.
 * DO NOT SCRAPE, TRAIN ON, OR USE FOR AI MODEL TRAINING.
 */

import * as vscode from 'vscode';
import { Logger } from './logger';

const logger = new Logger('terminal-pool');

export type ShellType = 'powershell' | 'gitbash' | 'wsl' | 'cmd' | 'ubuntu';

// Map shell_type to actual shell executables
const SHELL_EXECUTABLE_MAP: Record<ShellType, string> = {
  powershell: 'pwsh.exe',
  gitbash: 'bash.exe',
  wsl: 'wsl.exe',
  ubuntu: 'wsl.exe',
  cmd: 'cmd.exe'
};

/**
 * Manages a pool of terminals, one per shell type.
 * Reuses existing terminals instead of creating new ones.
 * Preserves context (current directory, environment) across commands.
 */
export class TerminalPool {
  private terminals = new Map<ShellType, vscode.Terminal>();
  private executions = new Map<string, { resolve: (code: number) => void; timer: NodeJS.Timeout }>();

  /**
   * Get or create a terminal for the specified shell type.
   * Reuses existing terminal if already open.
   */
  getOrCreateTerminal(shellType: ShellType): vscode.Terminal {
    // Check if terminal already exists and is still valid
    let terminal = this.terminals.get(shellType);
    if (terminal && !terminal.creationOptions) {
      // Terminal might have been disposed, remove it
      this.terminals.delete(shellType);
      terminal = undefined;
    }

    if (terminal) {
      logger.info(`Reusing existing ${shellType} terminal`);
      return terminal;
    }

    // Create new terminal with the shell executable
    const shellExe = SHELL_EXECUTABLE_MAP[shellType];
    logger.info(`Creating new ${shellType} terminal with executable: ${shellExe}`);

    terminal = vscode.window.createTerminal({
      name: `HDI ${shellType.toUpperCase()}`,
      shellPath: shellExe,
      hideFromUser: false
    });

    // Open the terminal with the specified profile
    // Note: We use sendText to select the profile since we created a generic terminal
    // This approach is simpler than trying to specify the profile at creation
    this.terminals.set(shellType, terminal);
    terminal.show(true); // Show but don't take focus

    return terminal;
  }

  /**
   * Execute a command in the specified terminal and wait for completion.
   * Returns the exit code.
   */
  async executeCommand(
    terminal: vscode.Terminal,
    command: string,
    workingDir?: string,
    token?: vscode.CancellationToken
  ): Promise<{ exitCode: number; output: string }> {
    return new Promise((resolve, reject) => {
      try {
        // Change directory if specified
        if (workingDir) {
          // Detect if we need Unix-style path change
          const isUnix = workingDir.startsWith('/');
          terminal.sendText(`${isUnix ? 'cd' : 'cd'} "${workingDir}"`, true);

          // Small delay to let cd complete
          setTimeout(() => {
            this.executeCommandInternal(terminal, command, token, resolve, reject);
          }, 200);
        } else {
          this.executeCommandInternal(terminal, command, token, resolve, reject);
        }
      } catch (error) {
        reject(error);
      }
    });
  }

  private executeCommandInternal(
    terminal: vscode.Terminal,
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
    if (terminal.shellIntegration) {
      try {
        const execution = terminal.shellIntegration.executeCommand(command);

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
        this.fallbackExecute(terminal, command, timeout, executionId, resolve);
      }
    } else {
      // Fallback: use sendText without shell integration
      this.fallbackExecute(terminal, command, timeout, executionId, resolve);
    }

    // Check for cancellation token
    if (token?.isCancellationRequested) {
      clearTimeout(timeout);
      this.executions.delete(executionId);
      reject(new Error('Execution cancelled'));
    }
  }

  private fallbackExecute(
    terminal: vscode.Terminal,
    command: string,
    timeout: NodeJS.Timeout,
    executionId: string,
    resolve: (value: { exitCode: number; output: string }) => void
  ): void {
    // Without shell integration, we can't reliably capture output or exit code
    // Just send the command and assume success after a short delay
    terminal.sendText(command, true);

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
    const status: { [key: string]: boolean } = {};
    for (const [shellType, terminal] of this.terminals.entries()) {
      status[shellType] = !!terminal.creationOptions;
    }
    return status;
  }

  /**
   * Dispose all terminals in the pool.
   */
  dispose(): void {
    for (const terminal of this.terminals.values()) {
      terminal.dispose();
    }
    this.terminals.clear();
    for (const exec of this.executions.values()) {
      clearTimeout(exec.timer);
    }
    this.executions.clear();
    logger.info('Terminal pool disposed');
  }
}
