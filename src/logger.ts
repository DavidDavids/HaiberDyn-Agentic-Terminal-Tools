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
    const errorStr = error instanceof Error ? error.stack : String(error);
    console.error(`[${timestamp}] [${this.context}] ERROR: ${message}`, errorStr);
  }

  debug(message: string, data?: unknown): void {
    if (this.isDebug) {
      const timestamp = new Date().toISOString();
      console.debug(`[${timestamp}] [${this.context}] DEBUG: ${message}`, data ? JSON.stringify(data) : '');
    }
  }
}
