# Dockerfile
# This Dockerfile is updated to run the one-time script,
# now including the package-lock.json for consistent builds.

# Use an official Node.js image as the base
FROM node:18-alpine

# Set the working directory inside the container
WORKDIR /app

# Copy package.json and package-lock.json to leverage caching
COPY package*.json ./
COPY package-lock.json ./

# Install Node.js dependencies
# npm ci is used here for more reliable, clean installs based on package-lock.json.
RUN npm ci

# Copy the rest of the application code
COPY . .

# Specify the command to run the application
# This script will read the CURL_COMMAND env variable, make the call, and exit.
CMD [ "npm", "start" ]
