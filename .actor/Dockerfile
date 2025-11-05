# Apify Actor Dockerfile template for Playwright
FROM apify/actor-node-playwright-chrome:18

# Copy package.json and package-lock.json
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy source code
COPY . ./

# Run postinstall script to install Playwright browsers
RUN npm run postinstall || true

# Set environment variable
ENV NODE_ENV=production

# Run the actor
CMD ["node", "main.js"]

