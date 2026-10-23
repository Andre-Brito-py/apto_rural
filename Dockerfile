# Imagem de produção: API + site no mesmo endereço.
# Na subida, aplica as migrações do banco e depois inicia a API.

FROM node:22.11.0-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/regras/package.json packages/regras/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm ci
COPY tsconfig.base.json ./
COPY packages packages
COPY apps apps
RUN npm run build && npm test -w @apto/regras
RUN npm prune --omit=dev

FROM node:22.11.0-alpine
ENV NODE_ENV=production \
    PORT=3333 \
    WEB_DIST=/app/apps/web/dist \
    MIGRACOES_DIR=/app/db/migrations
WORKDIR /app
COPY --from=build /app/node_modules node_modules
COPY --from=build /app/packages/regras/package.json packages/regras/
COPY --from=build /app/packages/regras/dist packages/regras/dist
COPY --from=build /app/apps/api/package.json apps/api/
COPY --from=build /app/apps/api/dist apps/api/dist
COPY --from=build /app/apps/web/dist apps/web/dist
COPY db/migrations db/migrations
USER node
EXPOSE 3333
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD wget -qO- http://127.0.0.1:3333/v1/saude || exit 1
CMD ["sh", "-c", "node apps/api/dist/migrar.js && exec node apps/api/dist/index.js"]
