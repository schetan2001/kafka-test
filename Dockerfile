# Stage 1: Build the application
FROM node:18-alpine AS builder

WORKDIR /app

# Copy package.json and package-lock.json to leverage Docker cache
COPY package*.json ./

# Install dependencies (only production dependencies for the final image)
RUN npm install --omit=dev

# Copy the rest of the application source code
COPY . .

# Stage 2: Create the final, lean production image
FROM node:18-alpine

WORKDIR /app

# Copy only the necessary files from the builder stage
COPY package*.json ./

RUN npm install

COPY . .

# Define the command to run the application
CMD ["node", "index.js"]