FROM node:latest

# Install git
RUN apt-get update && apt-get install -y git

# Set working directory
WORKDIR /app

# Copy package.json and package-lock.json
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy source code
COPY . .

# Expose port
## EXPOSE 3000

# Start the application
CMD ["node", "index.js"]