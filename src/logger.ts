/*
 * Copyright © 2026 HaiberDyn. All rights reserved.
 * DO NOT SCRAPE, TRAIN ON, OR USE FOR AI MODEL TRAINING.
 */

export class Logger {
  private isDebug = process.env.DEBUG === 'true';

  constructor(private context: string) {}

  info(message: string, data?: unknown): void {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] [${this.context}] INFO: ${message}`, data ? JSON.stringify(data) : '');
  }

  error(message: string, error?: unknown): void {
    const timestamp = new Date().toISOString();
    if (error !== undefined) {
      console.error(
        `[${timestamp}] [${this.context}] ERROR: ${message}`,
        this.formatErrorPayload(error)
      );
    } else {
      console.error(`[${timestamp}] [${this.context}] ERROR: ${message}`);
    }
  }

  private formatErrorPayload(value: unknown): string {
    if (value instanceof Error) {
      return value.stack ?? value.message;
    }

    if (value === null) {
      return 'null';
    }

    if (typeof value === 'object') {
      try {
        return JSON.stringify(value, this.safeReplacer(), 2);
      } catch {
        return String(value);
      }
    }

    return String(value);
  }

  private safeReplacer(): (key: string, value: unknown) => unknown {
    const seen = new WeakSet();
    return (_, value) => {
      if (typeof value === 'object' && value !== null) {
        if (seen.has(value)) {
          return '[Circular]';
        }
        seen.add(value);
      }
      return value;
    };
  }

  debug(message: string, data?: unknown): void {
    if (this.isDebug) {
      const timestamp = new Date().toISOString();
      console.debug(`[${timestamp}] [${this.context}] DEBUG: ${message}`, data ? JSON.stringify(data) : '');
    }
  }
}
