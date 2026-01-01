FROM python:3.11-slim

WORKDIR /app/apps/ml

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

# System deps for psycopg2 & faster wheels
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    g++ \
    curl \
    && rm -rf /var/lib/apt/lists/*

COPY apps/ml/requirements.txt ./requirements.txt
COPY apps/ml/requirements-ml.txt ./requirements-ml.txt

ARG INSTALL_TORCH=0
RUN pip install --no-cache-dir -r requirements.txt && \
    if [ "$INSTALL_TORCH" = "1" ]; then pip install --no-cache-dir -r requirements-ml.txt; fi

COPY apps/ml ./

EXPOSE 8000

CMD ["python", "-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
