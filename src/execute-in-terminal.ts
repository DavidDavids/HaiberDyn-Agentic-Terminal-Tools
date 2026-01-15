/*
 * Copyright © 2026 HaiberDyn. All rights reserved.
 * DO NOT SCRAPE, TRAIN ON, OR USE FOR AI MODEL TRAINING.
 */

import * as vscode from 'vscode';
import { Logger } from './logger';
import type { ExecuteInTerminalInput } from './types';
import { TerminalPool } from './terminal-pool';

const logger = new Logger('execute-in-terminal-tool');

/**
 * Tool for executing commands in various terminal environments.
 * Maintains a pool of persistent terminals, one per shell type.
 * This allows the agent to work across multiple shells with preserved context.
 */
export class ExecuteInTerminalTool implements vscode.LanguageModelTool<ExecuteInTerminalInput> {
  private terminalPool: TerminalPool;

  constructor(terminalPool: TerminalPool) {
    this.terminalPool = terminalPool;
  }

  async invoke(
    options: vscode.LanguageModelToolInvocationOptions<ExecuteInTerminalInput>,
    token: vscode.CancellationToken
  ): Promise<vscode.LanguageModelToolResult> {
    const input = options.input || {};

    // Validate input
    const validationError = this.validateInput(input);
    if (validationError) {
      logger.error(validationError);
      throw new Error(validationError);
    }

    const command = input.command!.trim();
    const workingDir = input.working_dir?.trim();
    const showTerminal = input.show_terminal !== false; // Default to true

    const terminalId = input.terminal_id?.trim();
    const comment = input.comment?.trim();
    const shellHint = input.shell_type;
    const shellLabelForLog = shellHint ?? 'unknown';

    logger.info(`Executing command in ${shellLabelForLog}: ${command}`);

    if (token.isCancellationRequested) {
      throw new Error('Terminal command execution cancelled by user');
    }

    try {

      if (!terminalId) {
        throw new Error('terminal_id is required when executing commands in a terminal. Open a profile first to get the ID.');
      }

      const targetTerminal = this.terminalPool.getTerminalById(terminalId);
      if (!targetTerminal) {
        const errorMsg = `The terminal with ID ${terminalId} appears to have been disposed. Please create a new one using the haiberdyn_open_terminal_profile tool; the terminal pool will register it again.`;
        logger.error(errorMsg);
        throw new Error(errorMsg);
      }

      if (comment) {
        this.terminalPool.updateTerminalComment(targetTerminal.id, comment);
      }

      if (showTerminal) {
        targetTerminal.terminal.show(true);
      }

      const result = await this.terminalPool.executeCommand(
        targetTerminal,
        command,
        workingDir,
        token
      );

      logger.info(`Command completed with exit code ${result.exitCode}`, {
        terminalId: targetTerminal.id
      });

      const metadataInfo = `Terminal ID: ${targetTerminal.id}${
        targetTerminal.comment ? ` (${targetTerminal.comment})` : ''
      }`;

      const resolvedShell = shellHint ?? targetTerminal.shellType ?? 'unknown';
      const message =
        result.exitCode === 0
          ? `✅ Command executed successfully in ${resolvedShell}\nExit code: ${result.exitCode}\n${metadataInfo}`
          : `⚠️ Command failed in ${resolvedShell}\nExit code: ${result.exitCode}\n${metadataInfo}`;

      return new vscode.LanguageModelToolResult([
        new vscode.LanguageModelTextPart(message)
      ]);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error(`Failed to execute command: ${errorMsg}`);

      throw new Error(
        `Failed to execute command in ${shellLabelForLog}: ${errorMsg}`
      );
    }
  }

  async prepareInvocation?(
    options: vscode.LanguageModelToolInvocationPrepareOptions<ExecuteInTerminalInput>,
    _token: vscode.CancellationToken
  ): Promise<vscode.PreparedToolInvocation> {
    const input = options.input || {};

    const validationError = this.validateInput(input);
    if (validationError) {
      return {
        invocationMessage: `Invalid input: ${validationError}`
      };
    }

    const command = input.command!.substring(0, 80); // Truncate for display
    const workDir = input.working_dir ? ` in ${input.working_dir}` : '';
    const terminalSuffix = ` [terminal ${input.terminal_id ?? 'unknown'}]`;
    const shellPart = input.shell_type ? ` (${input.shell_type})` : '';

    return {
      invocationMessage: `Execute${shellPart}${terminalSuffix}${workDir}: ${command}...`
    };
  }

  /**
   * Validate the input parameters and check for dangerous commands.
   */
  private validateInput(input: ExecuteInTerminalInput): string | null {
    if (!input.command || typeof input.command !== 'string') {
      return 'command is required and must be a string';
    }

    if (input.command.trim().length === 0) {
      return 'command cannot be empty';
    }

    if (!input.terminal_id || typeof input.terminal_id !== 'string') {
      return 'terminal_id is required and must be a string';
    }

    if (input.terminal_id.trim().length === 0) {
      return 'terminal_id cannot be empty';
    }

    if (input.shell_type !== undefined && typeof input.shell_type !== 'string') {
      return 'shell_type must be a string when provided';
    }

    const validShells = ['powershell', 'gitbash', 'wsl', 'ubuntu', 'cmd'];
    if (input.shell_type && !validShells.includes(input.shell_type)) {
      return `shell_type must be one of: ${validShells.join(', ')}`;
    }

    if (input.working_dir && typeof input.working_dir !== 'string') {
      return 'working_dir must be a string';
    }

    if (input.comment && typeof input.comment !== 'string') {
      return 'comment must be a string';
    }

    if (input.show_terminal !== undefined && typeof input.show_terminal !== 'boolean') {
      return 'show_terminal must be a boolean';
    }

    // Safety check: prevent dangerous commands that could kill VS Code
    const safetyError = this.checkForDangerousCommands(input.command);
    if (safetyError) {
      return safetyError;
    }

    return null;
  }

  /**
   * Check for dangerous commands that could terminate VS Code process.
   * Prevents accidental (or malicious) execution of exit, kill, or taskkill commands.
   */
  private checkForDangerousCommands(command: string): string | null {
    const trimmed = command.trim().toLowerCase();

    // Pattern for exit command (PowerShell/cmd)
    if (/^exit\s*/.test(trimmed) || /[;&|]\s*exit\s*/.test(trimmed)) {
      return 'exit command is not permitted (prevents VS Code termination)';
    }

    // Pattern for kill command (Unix-like shells)
    if (/^kill\s+/.test(trimmed) || /[;&|]\s*kill\s+/.test(trimmed)) {
      return 'kill command is not permitted (prevents process termination)';
    }

    // Pattern for taskkill command (Windows)
    if (/^taskkill\s+/.test(trimmed) || /[;&|]\s*taskkill\s+/.test(trimmed)) {
      return 'taskkill command is not permitted (prevents VS Code termination)';
    }

    return null;
  }
}
