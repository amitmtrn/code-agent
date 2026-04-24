# Replicate Setup Guide

To use cloud-hosted models with Replicate, follow these steps.

## 1. Obtain an API Token

1. Sign up or log in at [Replicate](https://replicate.com).
2. Go to your [account settings](https://replicate.com/account) and copy your API token.

## 2. Configure the Agent

Edit your `.env` file and set the `REPLICATE_API_TOKEN` variable:

```env
REPLICATE_API_TOKEN=r8_...your_token...
```

## 3. Usage

Specify the replicate provider and a model when running the agent:

```bash
docker compose run agent --provider replicate --model meta/meta-llama-3-70b-instruct "Hello"
```

Note: The model name should be the full Replicate model identifier (e.g., `meta/meta-llama-3-70b-instruct`).
