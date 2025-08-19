# Stage 1: Build the application and install dependencies
FROM node:18-alpine AS builder

WORKDIR /app

# Copy package.json and package-lock.json to leverage Docker cache
COPY package*.json ./

# Install dependencies (all dependencies are installed here)
RUN npm install

# Copy the rest of the application source code
COPY . .

# Stage 2: Create the final, lean production image
FROM node:18-alpine

WORKDIR /app

# This is the key change: we copy only the required files and the node_modules directory
# from the 'builder' stage. We do not re-run npm install.
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/index.js ./index.js

# The CMD to run the application
CMD ["npm", "start"]