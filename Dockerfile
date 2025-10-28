FROM node:20-alpine AS builder
WORKDIR /app

# Install Python and pip for chart generation dependencies
RUN apk add --no-cache python3 py3-pip python3-dev build-base

COPY package*.json ./
COPY requirements.txt ./
RUN npm ci --production=false
COPY . .
RUN npm run build

FROM node:20-alpine
WORKDIR /app

# Install Python and chart dependencies in runtime
RUN apk add --no-cache python3 py3-pip py3-numpy py3-matplotlib py3-pillow
COPY requirements.txt ./
RUN pip3 install --break-system-packages -r requirements.txt

COPY --from=builder /app/package*.json ./
RUN npm ci --omit=dev
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/migrations ./migrations
COPY --from=builder /app/public ./public

EXPOSE 8080
CMD ["npm", "start"]
