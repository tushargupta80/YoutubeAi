FROM node:20-alpine
WORKDIR /app
COPY package.json ./package.json
COPY frontend/package.json ./frontend/package.json
COPY backend/package.json ./backend/package.json
COPY workers/package.json ./workers/package.json
RUN apk add --no-cache python3 py3-pip && pip3 install --no-cache-dir --break-system-packages yt-dlp
RUN npm install --workspaces
COPY . .
WORKDIR /app/workers
CMD ["npm", "run", "start"]
