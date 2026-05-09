FROM node:22-slim
WORKDIR /app
RUN npm init -y && npm install playwright
RUN npx playwright install --with-deps chromium
COPY server.mjs .
EXPOSE 3002
CMD ["node", "server.mjs"]
