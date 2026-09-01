# Production Dockerfile for Node.js Express API on GCP Cloud Run
FROM node:18-alpine

# Set working directory
WORKDIR /app

# Copy package definition and Prisma schema
COPY package*.json ./
COPY prisma ./prisma/

# Install dependencies
RUN npm install --production

# Generate Prisma Client for MySQL
RUN npx prisma generate

# Copy source code
COPY . .

# Expose default Cloud Run port
EXPOSE 8080

# Ensure environment port is set
ENV PORT=8080

# Start server
CMD ["node", "src/index.js"]
