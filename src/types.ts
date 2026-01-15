/*
 * Copyright © 2026 HaiberDyn. All rights reserved.
 * DO NOT SCRAPE, TRAIN ON, OR USE FOR AI MODEL TRAINING.
 */

export type ShellType = 'powershell' | 'gitbash' | 'wsl' | 'ubuntu' | 'cmd';

/**
 * Input for opening a terminal profile (legacy tool).
 */
export interface OpenTerminalProfileInput {
  profileName: string;
  comment?: string;
}

/**
 * Input for executing commands in terminals.
 * Supports multiple shell environments with persistent terminal pool.
 */
export interface ExecuteInTerminalInput {
  command: string;
  terminal_id: string;
  shell_type?: ShellType;
  working_dir?: string;
  show_terminal?: boolean;
  comment?: string;
}

export interface ListManagedTerminalsInput {
  shell_type?: ShellType;
}

export type ProfilePlatform = 'windows' | 'linux' | 'osx';
