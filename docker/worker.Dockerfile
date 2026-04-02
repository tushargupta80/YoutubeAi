FROM node:20-alpine
WORKDIR /app
COPY package.json ./package.json
COPY frontend/package.json ./frontend/package.json
COPY backend/package.json ./backend/package.json
COPY workers/package.json ./workers/package.json
RUN npm install --workspaces
COPY . .
WORKDIR /app/workers
CMD ["npm", "run", "start"]
