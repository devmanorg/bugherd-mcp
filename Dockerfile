FROM node:22-alpine AS builder

WORKDIR /app

COPY package.json bun.lock ./
RUN npm install --frozen-lockfile 2>/dev/null || npm install

COPY tsconfig.json ./
COPY src ./src

RUN npm run build

FROM node:22-alpine

WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev

COPY --from=builder /app/dist ./dist

ENTRYPOINT ["node", "dist/index.js"]
