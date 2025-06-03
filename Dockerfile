FROM node:16-alpine

WORKDIR /usr/src/app

RUN apk add --no-cache make gcc g++ python3

COPY package*.json ./

RUN npm install

COPY . .

EXPOSE 5000

CMD ["npm", "start"]
