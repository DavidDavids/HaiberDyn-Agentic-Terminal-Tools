# HaiberDyn Agentic Terminal Tools

Copilot LM tool for autonomously opening terminal profiles so agents can manage WSL, PowerShell, Git Bash, Ubuntu, and cmd shells without being limited to one window.

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

### Tracking terminal metadata

Every terminal opened via HaiberDyn sets two well-known environment variables:


You can surface these values inside your custom prompt (for example, Oh My Posh) by reading the variables directly. A minimal Oh My Posh segment that renders the comment might look like:

```json
{
	"type": "text",
	"foreground": "#c5cdd9",
	"background": "#0c0c0c",
	"properties": {
		"text": "{{ env:HDPROMPT_COMMENT }}"
	}
}
```

On PowerShell and Windows shells you can verify the variables with `echo $Env:HDPROMPT_COMMENT` / `echo $Env:HDPROMPT_ID`. Linux shells can inspect them with `echo $HDPROMPT_COMMENT` / `echo $HDPROMPT_ID`.

When you call `haiberdyn_open_terminal_profile`, include the optional `comment` input so the tool can document the tab's intended usage and both the terminal ID and comment float back in the tool result. Agents should then reference that ID via `terminal_id` when running `haiberdyn_execute_in_terminal`, ensuring commands address the correct tab, and resubmit the `comment` property to refresh the prompt metadata if the terminal's purpose changes.

- **Tip for Copilot tools:** Always invoke `haiberdyn_list_terminal_profiles` first and pass an exact profile name from that list. Sending an unsupported, mistyped, or lower/uppercased name will leave `workbench.action.terminal.newWithProfile` without a terminal instance, so the pool never records what you opened.

### Discovering profiles & managed terminals

Two new tools support discovery and reuse:

- `haiberdyn_list_terminal_profiles`—returns every configured profile (platform, path, args, icon) so agents can pick the exact name to pass to `haiberdyn_open_terminal_profile`.
- `haiberdyn_list_managed_terminals`—shows IDs, shell types, comments, and timestamps for every terminal that HaiberDyn is tracking; pass the returned `terminal_id` to `haiberdyn_execute_in_terminal` to target the correct tab, optionally filtering by `shell_type`.

Ask your Copilot chat to list terminal profiles or managed terminals to see the most recent data before opening or reusing shells.

The `haiberdyn_execute_in_terminal` tool now only executes commands in an already registered terminal—it requires the `terminal_id` returned by `haiberdyn_open_terminal_profile` and does not create new shells. Use `haiberdyn_list_terminal_profiles` → `haiberdyn_open_terminal_profile` → `haiberdyn_execute_in_terminal` as the canonical flow for opening and scripting terminals.

If a reused `terminal_id` refers to a terminal that was disposed, the tool responds with:

> `The terminal with ID <id> appears to have been disposed. Please create a new one using the haiberdyn_open_terminal_profile tool; the terminal pool will register it again.`

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
