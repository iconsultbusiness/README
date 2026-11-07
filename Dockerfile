FROM node:22-alpine
WORKDIR /app
COPY package.json ./
COPY server ./server
COPY site ./site
ENV NODE_ENV=production HOST=0.0.0.0 PORT=8080 DB_FILE=/data/app.db
RUN mkdir -p /data && chown node:node /data
VOLUME /data
USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1:8080/api/health || exit 1
CMD ["node", "server/server.js"]
