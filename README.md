# 🤖 Codagent

[![npm version](https://img.shields.io/npm/v/codagent.svg)](https://www.npmjs.com/package/codagent)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**Codagent** is a powerful, autonomous CLI agent designed for software engineering tasks. Inspired by Claude Code, it provides a seamless interface for interacting with local and cloud-based AI models to manage your codebase, execute commands, and solve complex problems.

---

## 🚀 Quick Start

Run **Codagent** instantly without installation using `npx`:

```bash
npx codagent "Explain the architecture of this project"
```

Or install it globally for frequent use:

```bash
npm install -g codagent
codagent "How do I use this agent?"
```

---

## ✨ Features

- 🧠 **Autonomous Thinking Loop**: Analyzes tasks, plans actions, and executes them iteratively.
- 🛠️ **Built-in Toolset**:
  - `read_file`: Analyze code directly.
  - `write_file`: Implement fixes and new features.
  - `list_files`: Navigate your project structure.
  - `create_directory`: Scaffold new folders (recursive, idempotent).
  - `execute_shell`: Run tests, builds, and scripts (with user confirmation).
- 🌐 **Multi-Provider Support**:
  - **Ollama**: Run privacy-focused models locally (e.g., Llama 3, DeepSeek).
  - **Replicate**: Access world-class cloud models (e.g., Llama 3 70B).
- 🔍 **Deep Thinking**: Enable self-reflection loops for higher-quality reasoning and problem-solving.
- 🗒️ **Plan Mode**: Investigate read-only and produce a written plan you approve before any change runs. See [readme/plan-mode.md](readme/plan-mode.md).
- 🐳 **Docker Ready**: Fully containerized for consistent environments.

---

## 🛠️ Configuration

Codagent uses environment variables for configuration. You can set these in your shell or a `.env` file in your project root.

| Variable | Description | Default |
| :--- | :--- | :--- |
| `DEFAULT_PROVIDER` | `ollama` or `replicate` | `ollama` |
| `DEFAULT_MODEL` | The AI model to use | `llama3` |
| `OLLAMA_BASE_URL` | URL for your local Ollama instance | `http://localhost:11434` |
| `REPLICATE_API_TOKEN` | Your Replicate API token | (Required for Replicate) |
| `DEEP_THINKING` | Enable self-reflection loops | `false` |
| `PLAN_MODE` | Start in plan mode (read-only + approval gate) | `false` |
| `MAX_THINKING_LOOPS` | Max self-reflection iterations | `2` |

---

## 📖 Usage Guide

### Command Line Interface

```bash
# Basic prompt
codagent "Create a new React component called UserProfile"

# Enable Deep Thinking for complex tasks
codagent --deep-thinking "Refactor the database layer for better performance"

# Plan mode: investigate first, approve before any change runs
codagent --plan "refactor the auth layer"

# Specify a provider and model
codagent --provider replicate --model meta/meta-llama-3-70b-instruct "Write a blog post about AI"
```

### Local Setup & Development

If you're contributing to Codagent or running from source:

1. **Clone & Install**:
   ```bash
   git clone https://github.com/your-repo/codagent.git
   cd codagent
   npm install
   ```

2. **Build**:
   ```bash
   npm run build
   ```

3. **Run**:
   ```bash
   node dist/index.js "Your prompt here"
   ```

### Docker Usage

```bash
# Run with Docker Compose
docker compose run agent "What is this project about?"

# Run tests
docker compose run --rm test
```

---

## 🏗️ Architecture

Codagent is built with a modular architecture:
- **Provider Interface**: Standardized way to plug in different AI backends.
- **Tool Registry**: Easily extendable system to add new capabilities.
- **Agent Core**: Orchestrates the reasoning, acting, and reflecting cycle.

---

## 📜 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

<p align="center">Built with ❤️ for the developer community.</p>
