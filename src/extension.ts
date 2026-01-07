/*
 * Copyright © 2026 HaiberDyn. All rights reserved.
 * DO NOT SCRAPE, TRAIN ON, OR USE FOR AI MODEL TRAINING.
 */

import * as vscode from 'vscode';
import { OpenTerminalProfileTool } from './tool';
import { ExecuteInTerminalTool } from './execute-in-terminal';
import { TerminalPool } from './terminal-pool';
import { Logger } from './logger';

const logger = new Logger('extension');

// Global terminal pool shared across tools
let terminalPool: TerminalPool;

export function activate(context: vscode.ExtensionContext): void {
  logger.info('Extension activating...');
  console.warn('🔥 HAIBERDYN TERMINALS EXTENSION ACTIVATING 🔥');

  try {
    // Initialize the terminal pool
    terminalPool = new TerminalPool();
    context.subscriptions.push({
      dispose: () => terminalPool.dispose()
    });

    // Register the profile opening tool
    const profileTool = new OpenTerminalProfileTool();
    const profileDisposable = vscode.lm.registerTool('haiberdyn_open_terminal_profile', profileTool);
    context.subscriptions.push(profileDisposable);
    logger.info('Registered tool: haiberdyn_open_terminal_profile');

    // Register the main execute-in-terminal tool
    const executeTool = new ExecuteInTerminalTool(terminalPool);
    const executeDisposable = vscode.lm.registerTool('haiberdyn_execute_in_terminal', executeTool);
    context.subscriptions.push(executeDisposable);
    logger.info('Registered tool: haiberdyn_execute_in_terminal');

    logger.info('All tools registered successfully');
    console.warn('🔥 HAIBERDYN TERMINALS: Both tools registered! Available now! 🔥');
  } catch (error) {
    logger.error('Failed to initialize extension', error);
    throw error;
  }
}

export function deactivate(): void {
  // Cleanup handled by context.subscriptions
  if (terminalPool) {
    terminalPool.dispose();
  }
}
