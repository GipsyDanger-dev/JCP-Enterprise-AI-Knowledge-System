FROM node:22-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY prisma ./prisma
RUN npm run prisma:generate

COPY nest-cli.json tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npm run build

FROM node:22-alpine AS production

ENV NODE_ENV=production
WORKDIR /app

COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci --include=dev \
    && npm run prisma:generate \
    && npm cache clean --force \
    && chown -R node:node /app/node_modules

COPY --from=build --chown=node:node /app/dist ./dist
COPY --chown=node:node tsconfig.json ./tsconfig.json
COPY --chown=node:node src/auth/password.util.ts ./src/auth/password.util.ts

USER node

EXPOSE 8000

CMD ["sh", "-c", "npm run prisma:migrate:deploy && exec npm run start:prod"]

