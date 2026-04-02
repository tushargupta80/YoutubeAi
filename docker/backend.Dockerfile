FROM node:20-alpine
WORKDIR /app
COPY package.json ./package.json
COPY frontend/package.json ./frontend/package.json
COPY backend/package.json ./backend/package.json
COPY workers/package.json ./workers/package.json
RUN npm install --workspaces
COPY . .
WORKDIR /app/backend
EXPOSE 4000
CMD ["npm", "run", "start"]
