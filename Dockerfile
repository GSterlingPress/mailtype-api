FROM node:22-alpine
WORKDIR /app
COPY . .
EXPOSE 8788
CMD ["node","server.mjs"]
