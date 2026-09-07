# Stage 1: Development
FROM node:24-alpine AS development
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .

EXPOSE 5173
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]

# Stage 2: Build
FROM development AS build
ARG VITE_API_BASE_URL
ARG VITE_GOOGLE_CLIENT_ID
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}
ENV VITE_GOOGLE_CLIENT_ID=${VITE_GOOGLE_CLIENT_ID}
RUN test -n "$VITE_API_BASE_URL" || (echo "VITE_API_BASE_URL build argument is required" >&2 && exit 1)
RUN test -n "$VITE_GOOGLE_CLIENT_ID" || (echo "VITE_GOOGLE_CLIENT_ID build argument is required" >&2 && exit 1)
RUN npm run build

# Stage 3: Production serve
FROM nginx:alpine AS production
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 5173
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1:5173/healthz | grep -q OK || exit 1
CMD ["nginx", "-g", "daemon off;"]
