# DirecT relay — deploy to Fly.io (or any container host)
FROM node:22-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY --from=builder /app/dist ./dist
# Fly sets PORT to match fly.toml [http_service].internal_port
EXPOSE 8080
CMD ["node", "dist/index.js"]
