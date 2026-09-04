FROM node:24.20.0-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts --no-audit --no-fund && npm cache clean --force

FROM gcr.io/distroless/nodejs24-debian12:nonroot
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY apps ./apps
COPY packages ./packages
ENV NODE_ENV=production
EXPOSE 8080
CMD ["apps/api/src/server.js"]
