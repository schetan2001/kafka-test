# Use an official Node.js image as the base
FROM node:18-alpine
 
# Set the working directory inside the container
WORKDIR /app
 
# Copy package.json and package-lock.json to leverage caching
COPY package*.json ./
 
# Install Node.js dependencies
RUN npm install
 
# Copy the rest of the application code
COPY . .
 
# Expose the application port (if required)
# EXPOSE 3000 # Uncomment if the app uses a specific port
 
# Set environment variables (optional, prefer .env for secrets)
# ENV NODE_ENV=production
 
# Specify the command to run the application
CMD ["node", "index.js"]