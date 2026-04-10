FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY prisma ./prisma
RUN npx prisma generate

COPY src ./src
COPY uploads ./uploads

EXPOSE 5000

CMD ["sh", "-c", "npx prisma migrate deploy && node src/server.js"]