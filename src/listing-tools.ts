/*
 * Copyright © 2026 HaiberDyn. All rights reserved.
 * DO NOT SCRAPE, TRAIN ON, OR USE FOR AI MODEL TRAINING.
 */

import * as vscode from 'vscode';
import { Logger } from './logger';
import type { ListManagedTerminalsInput, ProfilePlatform } from './types';
import { TerminalPool } from './terminal-pool';

const logger = new Logger('terminal-listing');

type Platform = ProfilePlatform;

interface ProfileSummary {
  platform: Platform;
  name: string;
  detail: string;
}

export class ListTerminalProfilesTool implements vscode.LanguageModelTool<void> {
  async invoke(
    _options: vscode.LanguageModelToolInvocationOptions<void>,
    token: vscode.CancellationToken
  ): Promise<vscode.LanguageModelToolResult> {
    if (token.isCancellationRequested) {
      throw new Error('Terminal profile listing cancelled');
    }

    const profiles = this.collectProfiles();
    if (profiles.length === 0) {
      return new vscode.LanguageModelToolResult([
        new vscode.LanguageModelTextPart('No terminal profiles defined in VS Code settings.')
      ]);
    }

    const lines = profiles.map((profile) =>
      `- [${profile.platform}] ${profile.name}: ${profile.detail}`
    );

    logger.info('Returning terminal profile list', { count: profiles.length });

    return new vscode.LanguageModelToolResult([
      new vscode.LanguageModelTextPart(`Available terminal profiles:\n${lines.join('\n')}`)
    ]);
  }

  async prepareInvocation?(
    _options: vscode.LanguageModelToolInvocationPrepareOptions<void>,
    _token: vscode.CancellationToken
  ): Promise<vscode.PreparedToolInvocation> {
    return {
      invocationMessage: 'Listing configured VS Code terminal profiles'
    };
  }

  private collectProfiles(): ProfileSummary[] {
    const config = vscode.workspace.getConfiguration('terminal.integrated');
    const platforms: Platform[] = ['windows', 'linux', 'osx'];
    const summaries: ProfileSummary[] = [];

    for (const platform of platforms) {
      const key = `profiles.${platform}`;
      const entries = config.get<Record<string, unknown>>(key) || {};

      for (const [name, profileValue] of Object.entries(entries)) {
        const detail = this.describeProfile(profileValue);
        summaries.push({ platform, name, detail });
      }
    }

    return summaries;
  }

  private describeProfile(profile: unknown): string {
    if (!profile || typeof profile !== 'object') {
      return 'default settings';
    }

    const detailParts: string[] = [];
    const profileRecord = profile as Record<string, unknown>;

    if (typeof profileRecord.path === 'string') {
      detailParts.push(`path=${profileRecord.path}`);
    }

    if (typeof profileRecord.shellPath === 'string') {
      detailParts.push(`shellPath=${profileRecord.shellPath}`);
    }

    if (typeof profileRecord.args === 'string') {
      detailParts.push(`args=${profileRecord.args}`);
    } else if (Array.isArray(profileRecord.args)) {
      detailParts.push(`args=${profileRecord.args.join(' ')}`);
    }

    if (typeof profileRecord.icon === 'string') {
      detailParts.push(`icon=${profileRecord.icon}`);
    }

    if (detailParts.length === 0) {
      return 'default settings';
    }

    return detailParts.join(', ');
  }
}

export class ListManagedTerminalsTool implements vscode.LanguageModelTool<ListManagedTerminalsInput> {
  constructor(private terminalPool: TerminalPool) {}

  async invoke(
    options: vscode.LanguageModelToolInvocationOptions<ListManagedTerminalsInput>,
    token: vscode.CancellationToken
  ): Promise<vscode.LanguageModelToolResult> {
    if (token.isCancellationRequested) {
      throw new Error('Managed terminal listing cancelled');
    }

    const input = options.input || {};
    const filter = input.shell_type;
    const terminals = this.terminalPool
      .listTerminals()
      .filter((entry) => (filter ? entry.shellType === filter : true));

    if (terminals.length === 0) {
      return new vscode.LanguageModelToolResult([
        new vscode.LanguageModelTextPart('No managed terminals currently available.')
      ]);
    }

    const formatted = terminals.map((entry) => {
      const comment = entry.comment ? `comment: ${entry.comment}` : 'no comment';
      const created = new Date(entry.createdAt).toLocaleString();
      const lastUsed = new Date(entry.lastUsedAt).toLocaleString();
      return `- ID ${entry.id} (${entry.shellType ?? 'unknown'}): ${comment}; created: ${created}; last used: ${lastUsed}`;
    });

    logger.info('Returning managed terminal list', { count: terminals.length });

    return new vscode.LanguageModelToolResult([
      new vscode.LanguageModelTextPart(`Managed terminals:\n${formatted.join('\n')}`)
    ]);
  }

  async prepareInvocation?(
    options: vscode.LanguageModelToolInvocationPrepareOptions<ListManagedTerminalsInput>,
    _token: vscode.CancellationToken
  ): Promise<vscode.PreparedToolInvocation> {
    const filter = options.input?.shell_type;
    if (filter) {
      return {
        invocationMessage: `Listing managed terminals filtered by shell_type=${filter}`
      };
    }

    return {
      invocationMessage: 'Listing managed terminals in the pool'
    };
  }
}
