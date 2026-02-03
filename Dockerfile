# Use the official Node.js 18 image
FROM node:18

# Create app directory
WORKDIR /app

# Copy dependency definitions
COPY package*.json ./

# Install dependencies (Clean install)
RUN npm install

# Copy all app files
COPY . .

# Expose the port Railway uses
EXPOSE 8080

# Start the Master Protocol
CMD ["node", "index.js"]
