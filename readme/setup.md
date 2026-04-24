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

## Providers

The agent supports two providers:
- **Ollama**: For local models. See [Ollama Setup](./ollama-setup.md).
- **Replicate**: For cloud-hosted models. See [Replicate Setup](./replicate-setup.md).
