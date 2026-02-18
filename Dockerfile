FROM node:20-alpine

WORKDIR /app

COPY package*.json ./

RUN npm install

COPY . .

# Start the application
CMD ["node", "src/index.js"]
