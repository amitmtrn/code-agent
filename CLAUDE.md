# Project Rules

## Project Type
This project is a **CLI tool**. All architectural decisions, package choices, and code structures should align with best practices for a CLI tool.

## Docker Compose
This project runs via Docker Compose. The `docker-compose.yml` defines how to build and run the project.
- Keep `docker-compose.yml` up to date with any new services, dependencies, or configuration changes
- If adding new environment variables, update `.env.example`
- All services should be defined in docker-compose.yml

## Readme Documentation
This project maintains documentation in the `readme/` folder.
- All files in `readme/` MUST be in markdown (.md) format
- `readme/index.md` is the entry point — it must link to all other readme files
- When adding a new readme file, always add a link to it from `readme/index.md` (or from a parent page that is linked from index.md)
- Keep the readme tree navigable: every .md file should be reachable from index.md
- Update documentation when making significant changes to the project

## User Action Guides
When any task requires manual user action (e.g. creating accounts, setting up API keys, configuring external services, DNS changes, OAuth setup, etc.), you MUST create a step-by-step guide in the `readme/` folder:
- Create a dedicated .md file for the guide (e.g. `readme/setup-stripe.md`, `readme/configure-oauth.md`)
- Link it from `readme/index.md` under a "Setup Guides" section
- The guide MUST include:
  - Numbered step-by-step instructions
  - Direct URLs to the relevant service pages (e.g. dashboard links, console URLs)
  - Expected values and where to paste them (e.g. "Copy the API key and set it as `STRIPE_SECRET_KEY` in your .env")
  - Screenshots or ASCII diagrams where they help clarify the UI the user will see
  - Common errors and troubleshooting tips
  - A "Verify it works" section at the end explaining how to confirm the setup is complete
- Write guides assuming the user has never used the service before
- Keep guides up to date when configuration changes
