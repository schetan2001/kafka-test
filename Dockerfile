# Dockerfile
# This version of the Dockerfile includes verbose logging
# to help diagnose the build failure.

# Use an official Node.js image as the base
FROM node:18-alpine

# Set the working directory inside the container
WORKDIR /app

# Copy package.json and package-lock.json to leverage caching
COPY package*.json ./
COPY package-lock.json ./

# Start verbose logging for dependency installation
RUN echo "Starting dependency installation..."

# Install Node.js dependencies
# The `npm ci` command relies on package-lock.json for a consistent install.
# We will use `npm ci` here.
# Note: This will fail if package.json and package-lock.json are out of sync.
RUN npm ci

# Log completion of installation
RUN echo "Dependency installation complete."

# Copy the rest of the application code
COPY . .

# Specify the command to run the application
# This script will read the CURL_COMMAND env variable, make the call, and exit.
CMD [ "npm", "start" ]
