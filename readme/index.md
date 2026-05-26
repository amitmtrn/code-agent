# code-agent

A clone of Claude Code that supports multi-provider model execution via Replicate and Ollama.

Refer to the main [README.md](../README.md) for quick start and general overview.

## Contents

- [General Setup Guide](./setup.md)
- [Ollama Setup (Local Models)](./ollama-setup.md)
- [Replicate Setup (Cloud Models)](./replicate-setup.md)

## Features

- [Plan Mode](./plan-mode.md) — read-only investigation with an approval gate before any change runs.

## Architecture Overview

The `code-agent` is designed with a provider-agnostic core that interacts with models through a standardized `Provider` interface. It features an autonomous loop that can call tools registered in the `ToolRegistry`.

### Key Components

- **Providers**: Interfaces for Ollama and Replicate.
- **Reasoning Support**: Automatically extracts and displays the model's internal thought process (e.g., from DeepSeek R1).
- **Agent Core**: Manages conversation history and the thinking/acting loop.
- **Tool Registry**: Centralized system for defining and executing tools.
- **Tools**:
  - `read_file`: Read content from disk.
  - `write_file`: Save content to disk.
  - `list_files`: Discover files in the workspace.
  - `execute_shell`: Run terminal commands (with user confirmation).

## Deployment
This project includes an automated deployment system.
- **CLI**: Run \`npm run deploy\` to build and package the application.
- **Visual Dashboard**: Open [widget.html](../widget.html) in your browser for a graphical deployment interface.
