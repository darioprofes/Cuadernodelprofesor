# 3.12, no 3.13: thinc (dependencia de spaCy, ver requirements.txt) fija
# numpy<2.1, que no publica wheel para cp313 -- pip intentaría compilarlo
# desde fuente y esta imagen "slim" no trae compilador. 3.12 sí tiene wheels
# precompiladas para toda la cadena (numpy/thinc/spacy), sin tocar el
# Dockerfile con build-essential.
FROM python:3.12-slim

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

COPY requirements.txt .

RUN pip install --no-cache-dir -r requirements.txt

COPY app/ .

EXPOSE 8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
