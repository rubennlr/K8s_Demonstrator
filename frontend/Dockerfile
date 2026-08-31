# --- Multi-Stage Build: Build React + serve with nginx ---

# Stage 1: Build
FROM node:22-alpine AS build

WORKDIR /frontend
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

# Stage 2: nginx with production build
FROM nginx:alpine

COPY --from=build /frontend/dist /usr/share/nginx/html
COPY nginx/default.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
