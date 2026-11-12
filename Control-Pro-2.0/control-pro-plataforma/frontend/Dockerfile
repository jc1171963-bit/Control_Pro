FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
# Opcional: certificado raíz extra para redes o antivirus que inspeccionan HTTPS (docker build --secret id=ca_extra,src=archivo.pem).
RUN --mount=type=secret,id=ca_extra,required=false \
    if [ -s /run/secrets/ca_extra ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/ca_extra; fi; npm ci
COPY . .
ARG VITE_DATOS_BANCARIOS=""
ENV VITE_DATOS_BANCARIOS=$VITE_DATOS_BANCARIOS
RUN npm run build

FROM nginx:1.27-alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
