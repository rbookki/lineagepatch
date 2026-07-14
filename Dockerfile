FROM node:22-alpine

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

ENV HOST=0.0.0.0
ENV PORT=4174
EXPOSE 4174

CMD ["npm", "start"]
