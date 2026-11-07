# Portable alternative to the Render Node runtime (any host that runs containers).
# NOT built or run in the session that wrote it: build it and open /api/health before relying on it.
FROM node:22-alpine
RUN apk add --no-cache su-exec
WORKDIR /app
COPY package.json ./
COPY server ./server
COPY site ./site
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
ENV NODE_ENV=production HOST=0.0.0.0 PORT=8080 DB_FILE=/data/app.db
RUN mkdir -p /data && chown node:node /data
VOLUME /data
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1:8080/api/health || exit 1
ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["node", "server/server.js"]
