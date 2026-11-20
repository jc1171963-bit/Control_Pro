FROM python:3.13-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 FLASK_ENV_CONFIG=production
WORKDIR /app
COPY requirements.txt .
# Opcional: certificado raíz extra para redes o antivirus que inspeccionan HTTPS (docker build --secret id=ca_extra,src=archivo.pem).
# Se agrega al almacén del sistema: lo usan pip y también las conexiones salientes de la app (notificaciones push,
# vía truststore).
RUN --mount=type=secret,id=ca_extra,required=false \
    if [ -s /run/secrets/ca_extra ]; then cat /run/secrets/ca_extra >> /etc/ssl/certs/ca-certificates.crt; fi; \
    PIP_CERT=/etc/ssl/certs/ca-certificates.crt pip install --no-cache-dir -r requirements.txt
COPY . .
RUN useradd --create-home controlpro && mkdir -p /app/uploads && chown -R controlpro /app/uploads && chmod -R u+rwX /app/uploads
USER controlpro
EXPOSE 5000
# Aplica migraciones y arranca Gunicorn.
# Con CARGAR_DATOS_DEMO=true también carga el catálogo de la demo (solo si la base está vacía) y las sucursales
# (se puede repetir sin duplicar). Úsalo en un servidor de pruebas compartido, nunca en producción real.
CMD ["sh", "-c", "flask --app wsgi db upgrade && flask --app wsgi seed-roles && if [ \"$CARGAR_DATOS_DEMO\" = \"true\" ]; then flask --app wsgi seed-demo && flask --app wsgi cargar-sucursales && flask --app wsgi cargar-fotos; fi && gunicorn -c gunicorn.conf.py wsgi:app"]
