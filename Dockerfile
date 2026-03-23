FROM node:20-slim

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

RUN npx playwright install-deps chromium
RUN npx playwright install chromium

COPY . .

ENV PORT=7860
EXPOSE 7860

CMD ["node", "server/index.js"]
