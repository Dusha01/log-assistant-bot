FROM node:22-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY tsconfig.json tsoa.json ./
COPY src/ ./src/
RUN npm run build

CMD ["node", "built/core/cli.js"]
