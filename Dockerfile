# Daily Drive Docker image
# - Lightweight base (node:18-slim) but with curl/ca-certificates for debugging and health checks
# - Installs only production dependencies
# - Uses a non-root user for safety

FROM node:18-slim

# Set a working directory
WORKDIR /app

# Install minimal OS tools useful for debugging (curl) and certificates
RUN apt-get update \
  && apt-get install -y --no-install-recommends curl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

# Copy only package metadata first for better layer caching
COPY package.json ./

# Install production deps
RUN npm install --production

# Copy source (keep runtime small; secrets are mounted at runtime)
COPY index.js setup.js taste-profile.js taste-profile-google.js ./
COPY scripts ./scripts
COPY config.example.yaml ./config.example.yaml

# Create a non-root user and switch
RUN useradd -m dailydrive \
  && chown -R dailydrive:dailydrive /app
USER dailydrive

# Default command: dry-run to show output; override in docker run
CMD ["npm", "test"]

