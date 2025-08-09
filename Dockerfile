# Use Node.js 20 Alpine for smaller image
FROM node:20-alpine AS base

# Install build dependencies
RUN apk add --no-cache python3 make g++

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production && \
    npm install -g tsx

# Copy source code
COPY . .

# Copy template file
COPY templates/MASTER_API_TEMPLATE_v3.yaml /app/templates/

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 && \
    chown -R nodejs:nodejs /app

USER nodejs

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (r) => {if(r.statusCode !== 200) process.exit(1)})" || exit 1

# Start the SSE server
CMD ["tsx", "src/mcp/server-sse.ts"]