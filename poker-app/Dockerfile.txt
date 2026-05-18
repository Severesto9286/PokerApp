FROM node:18-alpine
WORKDIR /app
COPY server/package.json ./server/
RUN cd server && npm install
COPY server/ ./server/
EXPOSE 3001
CMD ["node", "server/index.js"]