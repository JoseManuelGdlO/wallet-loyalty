FROM node:22-alpine AS build
WORKDIR /app
RUN apk add --no-cache openssl
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN npm ci
COPY packages/shared packages/shared
COPY apps/api apps/api
COPY docker docker
ENV DATABASE_URL=postgresql://loyalty:loyalty@localhost:5432/loyalty
RUN npm run build -w @intelekia/shared \
  && npm run prisma:generate -w @intelekia/api \
  && npm run build -w @intelekia/api

FROM node:22-alpine
WORKDIR /app
RUN apk add --no-cache openssl
ENV NODE_ENV=production
COPY --from=build /app /app
WORKDIR /app/apps/api
EXPOSE 3000
CMD ["sh", "-c", "/app/node_modules/.bin/prisma migrate deploy --schema prisma/schema.prisma && node dist/main.js"]
