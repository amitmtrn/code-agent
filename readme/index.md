# code-agent

A clone of Claude Code that supports multi-provider model execution via Replicate and Ollama.

## Contents

- [General Setup Guide](./setup.md)
- [Ollama Setup (Local Models)](./ollama-setup.md)
- [Replicate Setup (Cloud Models)](./replicate-setup.md)

## Architecture Overview

The `code-agent` is designed with a provider-agnostic core that interacts with models through a standardized `Provider` interface. It features an autonomous loop that can call tools registered in the `ToolRegistry`.

### Key Components

- **Providers**: Interfaces for Ollama and Replicate.
- **Agent Core**: Manages conversation history and the thinking/acting loop.
- **Tool Registry**: Centralized system for defining and executing tools.
- **Tools**:
  - `read_file`: Read content from disk.
  - `write_file`: Save content to disk.
  - `list_files`: Discover files in the workspace.
  - `execute_shell`: Run terminal commands (with user confirmation).
