Plan for HaiberDyn Terminal enhancements

1. Extend TerminalPool (src/terminal-pool.ts) to track ManagedTerminal metadata, always show terminals, expose list/get helpers, and record comments/IDs. Inject shell-specific commands immediately after creation so each terminal sets the documented environment variables (`HDPROMPT_COMMENT`, `HDPROMPT_ID`).
2. Inject the pool into OpenTerminalProfileTool (src/tool.ts) so each new terminal is registered with its ID/comment; return that metadata in the tool result and include guidance on how to read it.
3. Expand ExecuteInTerminalTool and ExecuteInTerminalInput (src/execute-in-terminal.ts and src/types.ts) with optional terminal_id/comment. Resolve the pool entry (showing the terminal), report the ID/comment in the response, and emit the recovery message when the ID is missing.
4. Provide a helper that writes metadata into the prompt via Oh My Posh–compatible environment variables, include test snippets proving the vars are set, and document how to consume them within the README.
5. Add discovery tools for terminal profiles/managed terminals, register them in extension.ts/package.json, and update README with instructions on listing terminals, passing comments/IDs, recovery guidance, and Oh My Posh prompt samples.
