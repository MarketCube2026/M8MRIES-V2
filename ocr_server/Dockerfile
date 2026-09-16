FROM python:3.11.11-slim-bookworm
ENV PYTHONUNBUFFERED=1 OCR_PADDLE_CACHE=/models/paddle PADDLE_PDX_CACHE_HOME=/models/paddlex
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends libgomp1 libglib2.0-0 libgl1 && rm -rf /var/lib/apt/lists/*
COPY ocr_server/requirements.txt /app/ocr_server/requirements.txt
RUN pip install --no-cache-dir -r ocr_server/requirements.txt
COPY ocr_server /app/ocr_server
COPY rules /app/rules
RUN useradd -m -u 10001 app && mkdir -p /models/paddle /models/paddlex && chown -R app:app /models /app
USER app
EXPOSE 8100
HEALTHCHECK --interval=30s --start-period=180s CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8100/health',timeout=5)"
CMD ["uvicorn","ocr_server.main:app","--host","0.0.0.0","--port","8100","--workers","1"]
