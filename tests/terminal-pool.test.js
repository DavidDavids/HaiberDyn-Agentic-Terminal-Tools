"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const chai_1 = require("chai");
const mock_require_1 = __importDefault(require("mock-require"));
class FakeTerminal {
    constructor(options) {
        this.sentTexts = [];
        this.showCalls = 0;
        this.disposed = false;
        this.creationOptions = options;
    }
    sendText(text) {
        this.sentTexts.push(text);
    }
    show() {
        this.showCalls += 1;
    }
    dispose() {
        this.disposed = true;
    }
}
const closeCallbacks = [];
const windowMock = {
    createTerminal: (options) => {
        const terminal = new FakeTerminal(options);
        return terminal;
    },
    onDidCloseTerminal: (callback) => {
        closeCallbacks.push(callback);
        return { dispose: () => { } };
    },
    onDidEndTerminalShellExecution: () => ({ dispose: () => { } })
};
(0, mock_require_1.default)('vscode', { window: windowMock });
const { TerminalPool } = require('../src/terminal-pool');
describe('TerminalPool', () => {
    it('creates managed terminal with env vars and metadata', () => {
        const pool = new TerminalPool();
        const managed = pool.getOrCreateTerminal('powershell', { comment: 'build', profileName: 'PS' });
        (0, chai_1.expect)(managed.shellType).to.equal('powershell');
        (0, chai_1.expect)(managed.comment).to.equal('build');
        (0, chai_1.expect)(managed.profileName).to.equal('PS');
        (0, chai_1.expect)(managed.id).to.be.a('string');
        (0, chai_1.expect)(managed.terminal.sentTexts.some((text) => text.includes('HDPROMPT_ID'))).to.be.true;
        (0, chai_1.expect)(managed.terminal.sentTexts.some((text) => text.includes('HDPROMPT_COMMENT'))).to.be.true;
    });
    it('reuses existing terminal for same shell type', () => {
        const pool = new TerminalPool();
        const first = pool.getOrCreateTerminal('gitbash');
        const second = pool.getOrCreateTerminal('gitbash');
        (0, chai_1.expect)(second.id).to.equal(first.id);
    });
    it('lists managed terminals and updates comments', () => {
        const pool = new TerminalPool();
        const managed = pool.getOrCreateTerminal('cmd', { comment: 'old' });
        pool.updateTerminalComment(managed.id, 'new comment');
        const listed = pool.listTerminals();
        (0, chai_1.expect)(listed).to.have.length.greaterThan(0);
        (0, chai_1.expect)(listed[0].comment).to.equal('new comment');
        (0, chai_1.expect)(managed.terminal.sentTexts.some((text) => text.includes('HDPROMPT_COMMENT'))).to.be.true;
    });
});
//# sourceMappingURL=terminal-pool.test.js.map