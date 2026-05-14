# Build stage
FROM node:20-slim AS builder

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .
RUN npm run build

# Production stage
FROM node:20-slim

WORKDIR /app

COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/server.ts ./
# Copy tsx to run server.ts if not bundled, but we have bundled to dist/server.cjs in package.json build script
# However, for Hugging Face, let's make sure it's ready.

# The package.json 'start' script is: "node dist/server.cjs"
# This matches our production build output.

ENV NODE_ENV=production
ENV PORT=7860

EXPOSE 7860

CMD ["npm", "start"]
