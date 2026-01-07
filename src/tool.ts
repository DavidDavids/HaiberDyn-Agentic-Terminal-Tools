/*
 * Copyright © 2026 HaiberDyn. All rights reserved.
 * DO NOT SCRAPE, TRAIN ON, OR USE FOR AI MODEL TRAINING.
 */

import * as vscode from 'vscode';
import { Logger } from './logger';
import type { OpenTerminalProfileInput } from './types';

const logger = new Logger('haiberdyn-terminal-profile');

export class OpenTerminalProfileTool implements vscode.LanguageModelTool<OpenTerminalProfileInput> {
  async invoke(
    options: vscode.LanguageModelToolInvocationOptions<OpenTerminalProfileInput>,
    token: vscode.CancellationToken
  ): Promise<vscode.LanguageModelToolResult> {
    const input = options.input || {};
    
    // Validate input
    if (!input.profileName || typeof input.profileName !== 'string') {
      const error = 'profileName is required and must be a string';
      logger.error(error);
      throw new Error(error);
    }

    const profileName = input.profileName.trim();
    if (profileName.length === 0) {
      const error = 'profileName cannot be empty';
      logger.error(error);
      throw new Error(error);
    }

    logger.info(`Opening terminal profile: ${profileName}`);

    if (token.isCancellationRequested) {
      throw new Error('Terminal opening cancelled by user');
    }

    try {
      const terminal = await vscode.commands.executeCommand<vscode.Terminal>(
        'workbench.action.terminal.newWithProfile',
        { profileName }
      );

      if (!terminal) {
        throw new Error(`Command did not return terminal instance for profile: ${profileName}`);
      }

      logger.info(`Terminal opened successfully: ${profileName}`);
      const message = `✅ Opened '${profileName}' terminal`;
      
      return new vscode.LanguageModelToolResult([
        new vscode.LanguageModelTextPart(message)
      ]);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error(`Failed to open terminal: ${errorMsg}`);
      
      throw new Error(
        `Failed to open terminal profile '${profileName}': ${errorMsg}. ` +
        `Ensure the profile exists in VS Code Terminal settings.`
      );
    }
  }

  async prepareInvocation?(
    options: vscode.LanguageModelToolInvocationPrepareOptions<OpenTerminalProfileInput>,
    _token: vscode.CancellationToken
  ): Promise<vscode.PreparedToolInvocation> {
    const input = options.input || {};
    if (!input.profileName || typeof input.profileName !== 'string') {
      return {
        invocationMessage: 'Invalid input: profileName (string) required'
      };
    }
    return { invocationMessage: `Opening terminal profile: ${input.profileName}` };
  }
}

// Export an instance for VS Code to use
export const openTerminalProfileTool = new OpenTerminalProfileTool();
