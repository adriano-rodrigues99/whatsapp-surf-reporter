FROM node:14.17-alpine3.13 as builder

RUN apk add wget && \
    apk add --no-cache git

WORKDIR /home/node

COPY . .

WORKDIR /home/node/app

COPY . .

RUN yarn install

FROM node:14.17-alpine3.13
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
WORKDIR /home/node/app
RUN apk add chromium
COPY --from=builder /home/node/app/ .
EXPOSE 3000