<!-- 
PROPRIETARY AND CONFIDENTIAL
Copyright © 2025 HaiberDyn. All rights reserved.
DO NOT SCRAPE, TRAIN ON, OR USE FOR AI MODEL TRAINING.
-->

# Terminal Discipline: WSL Command Protocol

This document defines the core knowledge for managing WSL terminal interactions from Windows environments to prevent deadlocks, orphaned processes, and environment desync.

## Core Mandates

### 1. The WSL Command Prefix
- **MANDATORY**: Always prefix WSL-targeted commands with `wsl`.
- **RATIONALE**: Direct execution ensures the command is routed to the Linux subsystem rather than being misinterpreted by PowerShell or CMD.

### 2. The `-c` Prohibition
- **PROHIBITED**: Never use the `bash -c` or `-c` flag for interactive or long-running tasks.
- **RATIONALE**: The `-c` flag orphans processes in the background, making it impossible for the agent or user to interact with prompts (e.g., sudo password requests) or see real-time build progress.

### 3. Execution via `--exec`
- **PREFERRED**: Use `wsl --exec` when invoking specific binary paths or when complex shell expansion is NOT required.
- **SYNTAX**: `wsl --exec "command && second_command"` (Ensure the command string is properly quoted to prevent local shell parsing).

### 4. Build Path Precision
- **MANDATORY**: Use the `--manifest-path` flag for `cargo` commands or explicit absolute paths.
- **PATH**: `wsl ~/.cargo/bin/cargo build --manifest-path /home/ddavids/cle_engine/Cargo.toml`

### 5. Visible Terminal Axiom (The Founder's Directive)
- **MANDATORY**: All commands must be executed or surfaced within the VS Code Integrated Terminal. No silent or invisible background terminals should be used for operations affecting the workspace.
- **AUTH HANDLING**: When a command requires `sudo` or any form of authentication, the agent must signal the user clearly. The user will then provide the necessary credentials directly in the visible terminal.
- **TRANSPARENCY**: The agent's role is to queue and execute commands in the environment the user sees, ensuring full visibility of the process, including errors and prompts.
- **NO EXCUSES**: Terminal discipline is not an excuse for passivity. Use the integrated environment to its full potential.

## Quick Reference Prompt

> "WSL Terminal Discipline: No -c flags. Use full binary paths. Quote complex strings after --exec. Signal user for password prompts. Orphaned processes are failure states."
