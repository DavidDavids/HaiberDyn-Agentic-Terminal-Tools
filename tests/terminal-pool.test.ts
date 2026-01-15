import { expect } from 'chai';
import mockRequire from 'mock-require';

interface FakeTerminalOptions {
  shellPath?: string;
  profile?: { name?: string };
}

class FakeTerminal {
  public creationOptions: FakeTerminalOptions & { hideFromUser?: boolean };
  public sentTexts: string[] = [];
  public showCalls = 0;
  public disposed = false;
  public shellIntegration?: undefined;
  public name: string;

  constructor(options: FakeTerminalOptions & { hideFromUser?: boolean }) {
    this.creationOptions = options;
    this.name = options.profile?.name || 'Fake Terminal';
  }

  sendText(text: string): void {
    this.sentTexts.push(text);
  }

  show(): void {
    this.showCalls += 1;
  }

  dispose(): void {
    this.disposed = true;
  }
}

const openCallbacks: Array<(terminal: FakeTerminal) => void> = [];
const closeCallbacks: Array<(terminal: FakeTerminal) => void> = [];
const windowMock = {
  createTerminal: (options: FakeTerminalOptions & { hideFromUser?: boolean }) => {
    const terminal = new FakeTerminal(options);
    return terminal;
  },
  onDidOpenTerminal: (callback: (terminal: FakeTerminal) => void) => {
    openCallbacks.push(callback);
    return { dispose: () => { } };
  },
  onDidCloseTerminal: (callback: (terminal: FakeTerminal) => void) => {
    closeCallbacks.push(callback);
    return { dispose: () => { } };
  },
  onDidEndTerminalShellExecution: () => ({ dispose: () => { } })
};

const profileConfig: Record<string, Record<string, unknown>> = {
  'profiles.windows': {
    WSL: { path: 'C:\\Windows\\System32\\wsl.exe' }
  },
  'profiles.linux': {},
  'profiles.osx': {}
};

const workspaceMock = {
  getConfiguration: () => ({
    get: (key: string) => profileConfig[key] || {}
  })
};

let executeCommandResult: any = 'default';
const commandsMock = {
  executeCommand: (_command: string, args: { profileName: string }) => {
    if (executeCommandResult === 'default') {
      return new FakeTerminal({ shellPath: 'wsl.exe', profile: { name: args.profileName } });
    }
    return executeCommandResult;
  }
};

mockRequire('vscode', { window: windowMock, workspace: workspaceMock, commands: commandsMock });

const { TerminalPool } = require('../src/terminal-pool');

describe('TerminalPool', () => {
  it('creates managed terminal with env vars and metadata', () => {
    const pool = new TerminalPool();
    const managed = pool.getOrCreateTerminal('powershell', { comment: 'build', profileName: 'PS' });

    expect(managed.shellType).to.equal('powershell');
    expect(managed.comment).to.equal('build');
    expect(managed.profileName).to.equal('PS');
    expect(managed.id).to.be.a('string');
    expect(managed.terminal.sentTexts.some((text: string) => text.includes('HDPROMPT_ID'))).to.be.true;
    expect(managed.terminal.sentTexts.some((text: string) => text.includes('HDPROMPT_COMMENT'))).to.be.true;
  });

  it('reuses existing terminal for same shell type', () => {
    const pool = new TerminalPool();
    const first = pool.getOrCreateTerminal('gitbash');
    const second = pool.getOrCreateTerminal('gitbash');

    expect(second.id).to.equal(first.id);
  });

  it('lists managed terminals and updates comments', () => {
    const pool = new TerminalPool();
    const managed = pool.getOrCreateTerminal('cmd', { comment: 'old' });
    pool.updateTerminalComment(managed.id, 'new comment');

    const listed = pool.listTerminals();
    expect(listed).to.have.length.greaterThan(0);
    expect(listed[0].comment).to.equal('new comment');
    expect(managed.terminal.sentTexts.some((text: string) => text.includes('HDPROMPT_COMMENT'))).to.be.true;
  });

  it('opens a profile when the name exactly matches', async () => {
    const pool = new TerminalPool();
    const managed = await pool.openTerminalProfile('WSL');

    expect(managed.profileName).to.equal('WSL');
  });

  it('throws when the profile name is not an exact match', async () => {
    const pool = new TerminalPool();

    try {
      await pool.openTerminalProfile('wsl');
      throw new Error('expected openTerminalProfile to throw');
    } catch (error) {
      expect((error as Error).message).to.include('Profile');
      expect((error as Error).message).to.include('Available profiles');
    }
  });

  it('resolves via fallback listener when executeCommand returns undefined', async () => {
    executeCommandResult = undefined;
    const pool = new TerminalPool();

    // Start opening profile
    const openPromise = pool.openTerminalProfile('WSL');

    // Simulate terminal opening asynchronously
    setTimeout(() => {
      const fake = new FakeTerminal({ profile: { name: 'WSL' } });
      openCallbacks.forEach(cb => cb(fake));
    }, 10);

    const managed = await openPromise;
    expect(managed.profileName).to.equal('WSL');
    executeCommandResult = 'default'; // Reset for other tests
  });

  it('throws timeout error if no terminal opens within 3s', async function () {
    this.timeout(5000);
    executeCommandResult = undefined;
    const pool = new TerminalPool();

    // We need to slightly monkey-patch the timeout for this test to avoid waiting 3s
    // But since we can't easily reach into the closure, we'll just check that it eventually throws.
    // To speed up the test, we could mock setTimeout, but let's keep it simple for now.

    // Actually, TerminalPool has a hardcoded 3000ms.
    // Let's just verify the logic exists.

    const start = Date.now();
    try {
      await pool.openTerminalProfile('WSL');
      throw new Error('Expected timeout error');
    } catch (error) {
      expect((error as Error).message).to.include('Command did not return terminal instance');
    }
    executeCommandResult = 'default';
  });
});
