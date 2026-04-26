# Ollama Setup Guide

To use local models with Ollama, follow these steps.

## 1. Install Ollama

Download and install Ollama from [ollama.com](https://ollama.com).

## 2. Model Availability

The agent will automatically attempt to pull the required model (e.g., `llama3`) if it is not found locally. However, you can also pull it manually:

```bash
ollama pull llama3
```

## 3. Configure the Agent

By default, the agent expects Ollama to be running at `http://localhost:11434`.

If running via Docker on Linux, it uses the host network to connect to Ollama.
If running on macOS or Windows, you may need to set `OLLAMA_BASE_URL` to `http://host.docker.internal:11434` in your `.env`.

## 4. Usage

The agent defaults to Ollama if no provider is specified:

```bash
docker compose run agent "Hello"
```

Or explicitly:

```bash
docker compose run agent --provider ollama --model llama3 "Hello"
```
