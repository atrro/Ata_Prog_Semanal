FROM node:24-alpine AS build
WORKDIR /app
COPY package*.json ./
COPY apps/web/package.json apps/web/package.json
COPY apps/api/package.json apps/api/package.json
RUN npm ci
COPY apps/api apps/api
COPY database database
RUN npm run build -w apps/api

FROM node:24-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production PORT=4000
RUN addgroup -S app && adduser -S app -G app
COPY --from=build --chown=app:app /app/node_modules ./node_modules
COPY --from=build --chown=app:app /app/apps/api ./apps/api
COPY --from=build --chown=app:app /app/database ./database
USER app
EXPOSE 4000
CMD ["node", "apps/api/dist/main.js"]