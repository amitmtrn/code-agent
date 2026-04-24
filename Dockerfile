# Build stage
FROM node:20-slim AS builder
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

# Production stage
FROM node:20-slim
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev
COPY --from=builder /app/dist ./dist
# We'll also need the source for some tools if they expect to run in the same environment
# but for now, we just need the built app.

ENTRYPOINT ["node", "dist/index.js"]
