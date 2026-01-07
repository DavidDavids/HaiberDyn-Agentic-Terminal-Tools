/*
 * Copyright © 2026 HaiberDyn. All rights reserved.
 * DO NOT SCRAPE, TRAIN ON, OR USE FOR AI MODEL TRAINING.
 */

/**
 * Input for opening a terminal profile (legacy tool).
 */
export interface OpenTerminalProfileInput {
  profileName: string;
}

/**
 * Input for executing commands in terminals.
 * Supports multiple shell environments with persistent terminal pool.
 */
export interface ExecuteInTerminalInput {
  command: string;
  shell_type: 'powershell' | 'gitbash' | 'wsl' | 'ubuntu' | 'cmd';
  working_dir?: string;
  show_terminal?: boolean;
}
