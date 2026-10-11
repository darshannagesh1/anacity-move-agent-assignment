# Keep the major version in line with NODE_VERSION on the host you deploy to.
# The openai package needs Node 22 or newer.
ARG NODE_VERSION=22

FROM node:${NODE_VERSION}-slim AS client
WORKDIR /app/client
COPY client/package.json client/package-lock.json ./
RUN npm ci
COPY client/ ./
RUN npm run build

FROM node:${NODE_VERSION}-slim
ENV NODE_ENV=production
WORKDIR /app/server
COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev
COPY server/ ./
# index.ts serves ../../client/dist relative to server/src
COPY --from=client /app/client/dist /app/client/dist
EXPOSE 3001
USER node
CMD ["node_modules/.bin/tsx", "src/index.ts"]
