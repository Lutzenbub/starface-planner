FROM mcr.microsoft.com/playwright:v1.52.0-jammy

WORKDIR /app

COPY package.json package-lock.json ./
COPY backend/package.json backend/package.json
COPY backend/tsconfig.json backend/tsconfig.json
COPY backend/src backend/src

RUN npm ci --workspace backend --include-workspace-root
RUN npm run build --workspace backend

ENV NODE_ENV=production
ENV PLAYWRIGHT_HEADLESS=true

CMD ["npm", "run", "start:prod", "--workspace", "backend"]
