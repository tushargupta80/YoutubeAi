FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json ./package.json
COPY frontend/package.json ./frontend/package.json
COPY backend/package.json ./backend/package.json
COPY workers/package.json ./workers/package.json
RUN npm install --workspaces

FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build --workspace frontend

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/frontend /app/frontend
COPY --from=builder /app/node_modules /app/node_modules
WORKDIR /app/frontend
EXPOSE 3000
CMD ["npm", "run", "start"]
