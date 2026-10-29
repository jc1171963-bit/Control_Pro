FROM python:3.13-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 FLASK_ENV_CONFIG=production
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
RUN useradd --create-home controlpro && mkdir -p /app/uploads && chown -R controlpro /app/uploads
USER controlpro
EXPOSE 5000
# Aplica migraciones y arranca Gunicorn
CMD ["sh", "-c", "flask --app wsgi db upgrade && flask --app wsgi seed-roles && gunicorn -w 4 -b 0.0.0.0:5000 --access-logfile - wsgi:app"]
