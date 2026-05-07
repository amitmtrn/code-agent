# General Setup Guide

Follow these steps to get `code-agent` up and running.

## Prerequisites

- Docker and Docker Compose
- Node.js (v20 or later) and npm (for local development)

## Installation

1. Clone the repository.
2. Copy the example environment file:
   ```bash
   cp .env.example .env
   ```
3. Edit `.env` to include your API tokens and preferred configuration.

## Running with Docker

The easiest way to run the agent is using Docker Compose:

```bash
docker compose run agent "What files are in this directory?"
```

## Local Development

If you prefer to run it locally:

```bash
npm install
npm run build
node dist/index.js "Your prompt here"
```

## Verification

You can verify that the agent and its tools are working correctly by running the integrated tests:

```bash
docker compose run --rm test
```

This runs a suite of automated tests that verify:
- File system tools (`read_file`, `write_file`, `list_files`)
- The tool registry and argument parsing
- The autonomous agent loop using a mock provider

## Providers

The agent supports two providers:
- **Ollama**: For local models. See [Ollama Setup](./ollama-setup.md).
- **Replicate**: For cloud-hosted models. See [Replicate Setup](./replicate-setup.md).

## Deep Thinking (Self-Reflection)

The agent includes a "Deep Thinking" feature that allows it to evaluate its own responses for quality and completeness. When enabled, the agent will ask itself if it's satisfied with its answer. If it's not satisfied, it will continue to refine its response or use more tools until it produces a high-quality result.

### Configuration

You can enable Deep Thinking via environment variables or CLI flags:

- **CLI Flag**: Use `-d` or `--deep-thinking` when running the agent.
  ```bash
  docker compose run agent -d "Implement a complex sorting algorithm"
  ```
- **Environment Variable**: Set `DEEP_THINKING=true` in your `.env` file.

### Advanced Settings

- `MAX_THINKING_LOOPS`: Controls how many times the agent can reflect on its own response before finishing. Defaults to `2`.
