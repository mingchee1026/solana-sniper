# Use an official Node.js runtime as a parent image
FROM node:20.18

RUN apt update \
  && apt install --assume-yes build-essential python3 curl

# Set the working directory in the container
WORKDIR /app

# Copy package.json and yarn.lock into the container
COPY package.json ./

# Install dependencies
RUN yarn install --frozen-lockfile && yarn cache clean

# Copy the rest of the application code into the container
COPY . .

RUN yarn run build

EXPOSE 3030

CMD ["yarn", "run", "start"]
