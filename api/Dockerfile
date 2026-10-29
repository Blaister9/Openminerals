# Fallback for the repeated Railpack frontend gRPC failure on 2026-10-28.
# Official Node image; digest verified against Docker Hub's registry.
FROM node:22.23.3-alpine@sha256:0a7108bf6c7bf5de370ffb1a3ed6be93d405b43ff159f681a8d18c0e2bc2e402
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund
COPY src ./src
COPY scripts ./scripts
COPY test ./test
USER node
EXPOSE 3000
CMD ["node", "src/server.js"]
