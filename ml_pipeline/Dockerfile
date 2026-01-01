FROM python:3.11-slim

WORKDIR /ml_pipeline

# Install system dependencies
RUN apt-get update && apt-get install -y \
    build-essential \
    git \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements
COPY ml_pipeline/requirements-ml.txt .

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements-ml.txt

# Copy ml_pipeline code
COPY ml_pipeline/ .

# Create data directory
RUN mkdir -p /app/apps/ml/data

# Set Python path
ENV PYTHONPATH=/ml_pipeline:$PYTHONPATH

# Default command (can be overridden)
CMD ["/bin/bash"]
