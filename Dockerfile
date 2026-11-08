FROM node:22-slim AS build
WORKDIR /app

COPY package.json package-lock.json tsconfig.json vite.aliases.ts ./
COPY packages ./packages
COPY games ./games
COPY tools ./tools
COPY apps ./apps

RUN npm ci --no-audit --no-fund
RUN npm run build --workspace @await-arcade/server

FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production

COPY packages/server/runtime.package.json ./package.json
RUN npm install --omit=dev --no-audit --no-fund

COPY --from=build /app/packages/server/dist/cloud.js ./cloud.js

CMD ["node", "cloud.js"]
