FROM python:3.13-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 FLASK_ENV_CONFIG=production
WORKDIR /app
COPY requirements.txt .
# Opcional: certificado raíz extra para redes o antivirus que inspeccionan HTTPS (docker build --secret id=ca_extra,src=archivo.pem).
RUN --mount=type=secret,id=ca_extra,required=false \
    if [ -s /run/secrets/ca_extra ]; then cat /etc/ssl/certs/ca-certificates.crt /run/secrets/ca_extra > /tmp/ca.pem; export PIP_CERT=/tmp/ca.pem; fi; \
    pip install --no-cache-dir -r requirements.txt && rm -f /tmp/ca.pem
COPY . .
RUN useradd --create-home controlpro && mkdir -p /app/uploads && chown -R controlpro /app/uploads && chmod -R u+rwX /app/uploads
USER controlpro
EXPOSE 5000
# Aplica migraciones y arranca Gunicorn.
# Con CARGAR_DATOS_DEMO=true también carga el catálogo de la demo (solo si la base está vacía) y las sucursales
# (se puede repetir sin duplicar). Úsalo en un servidor de pruebas compartido, nunca en producción real.
CMD ["sh", "-c", "flask --app wsgi db upgrade && flask --app wsgi seed-roles && if [ \"$CARGAR_DATOS_DEMO\" = \"true\" ]; then flask --app wsgi seed-demo && flask --app wsgi cargar-sucursales; fi && gunicorn -w 4 -b 0.0.0.0:5000 --access-logfile - wsgi:app"]
