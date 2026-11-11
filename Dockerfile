# Seshat: static production build served by nginx.
# Build:  docker build -t seshat .
# Run:    docker run -d --name seshat -p 8905:80 seshat
FROM node:22-bookworm-slim AS build
WORKDIR /src
COPY package.json package-lock.json ./
COPY scripts/ scripts/
COPY app/vendor-src/ app/vendor-src/
RUN npm ci
COPY . .
RUN npx gulp build

FROM nginx:alpine
COPY --from=build /src/dist /usr/share/nginx/html
EXPOSE 80
