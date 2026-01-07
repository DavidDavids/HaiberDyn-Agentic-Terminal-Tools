# HaiberDyn Terminals for VS Code

Copilot LM Tool for autonomously opening terminals with specified VS Code profiles.

## Installation & Setup

1. **Install Node.js 18+** from https://nodejs.org (LTS recommended)
2. **Clone this repository**
3. **Install dependencies**: `npm install`
4. **Build extension**: `npm run build`
5. **Open in VS Code**: `code .`
6. **Launch debug mode**: Press F5

A new VS Code window opens with the extension active.

## Usage

In VS Code Copilot chat, ask:
```
@copilot Open WSL terminal
```

Agent invokes the `open_terminal_profile` tool:
- Input: `{profileName: "WSL"}`
- Result: Terminal opens with WSL profile

Common profile names:
- `WSL` or `Ubuntu (WSL)` — Windows Subsystem for Linux
- `Git Bash` — Git Bash terminal
- `PowerShell` — Windows PowerShell
- `Command Prompt` — cmd.exe

## Development

```bash
npm run build    # Compile TypeScript → dist/
npm run lint     # Check code quality with ESLint
npm run watch    # Watch src/ for changes, auto-compile
```

## Debugging

Enable debug logging:
```bash
DEBUG=true code .
```

Check Output panel in debug session for timestamps and detailed logs.
