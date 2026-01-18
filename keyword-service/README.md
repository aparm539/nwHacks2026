# Keyword Extraction Microservice

A lightweight Python microservice for extracting keywords from text using the YAKE algorithm.

## Features

- **Fast & Lightweight**: Uses YAKE, an unsupervised keyword extraction algorithm
- **Language Support**: Works with multiple languages (en, fr, de, es, pt, etc.)
- **Configurable**: Adjust n-gram size, deduplication threshold, and keyword count
- **Batch Processing**: Extract keywords from multiple texts in one request
- **Docker Ready**: Includes Dockerfile for containerization

## Quick Start

### Local Development

```bash
# Create virtual environment
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Run the server
python main.py
```

The service will be available at `http://localhost:8000`

### Using Docker

```bash
# Build the image
docker build -t keyword-service .

# Run the container
docker run -p 8000:8000 keyword-service
```

### Deploying on Render (Docker)

1) In Render, create a **Web Service** from this repo. Set **Root Directory** to `keyword-service` and choose **Docker** as the runtime (it auto-detects `Dockerfile`).
2) Leave the start command empty (the Docker `CMD` runs `uvicorn`), and set the **port** to `8000`.
3) Deploy. Render will give you a base URL such as `https://keyword-service.onrender.com`.

#### Calling the API from your Next.js app

Add an env var in `website/.env.local` (and in your hosting env):

```
NEXT_PUBLIC_KEYWORD_API_BASE=https://keyword-service.onrender.com
```

Use it in your fetches:

```ts
const base = process.env.NEXT_PUBLIC_KEYWORD_API_BASE;

export async function extractKeywords(text: string) {
  const res = await fetch(`${base}/extract`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, max_keywords: 10 }),
  });
  if (!res.ok) throw new Error(`Extract failed: ${res.status}`);
  return res.json();
}
```
```

## API Endpoints

### Health Check

```bash
GET /
GET /health
```

### Extract Keywords

```bash
POST /extract
Content-Type: application/json

{
  "text": "Machine learning is a subset of artificial intelligence that enables computers to learn from data.",
  "max_keywords": 10,
  "language": "en",
  "deduplication_threshold": 0.9,
  "n_gram_max": 3
}
```

**Response:**

```json
{
  "keywords": [
    {"keyword": "machine learning", "score": 0.025},
    {"keyword": "artificial intelligence", "score": 0.045},
    {"keyword": "computers", "score": 0.089}
  ],
  "text_length": 98,
  "keyword_count": 3
}
```

### Batch Extraction

```bash
POST /extract/batch
Content-Type: application/json

[
  {"text": "First document text..."},
  {"text": "Second document text..."}
]
```

## Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `text` | string | required | The text to extract keywords from |
| `max_keywords` | int | 10 | Maximum number of keywords to return (1-50) |
| `language` | string | "en" | Language code |
| `deduplication_threshold` | float | 0.9 | Threshold for removing similar keywords (0-1) |
| `n_gram_max` | int | 3 | Maximum n-gram size for keywords (1-5) |

## API Documentation

Interactive API docs available at:
- Swagger UI: `http://localhost:8000/docs`
- ReDoc: `http://localhost:8000/redoc`

## Integration with Next.js

```typescript
const extractKeywords = async (text: string) => {
  const response = await fetch('http://localhost:8000/extract', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, max_keywords: 10 }),
  });
  return response.json();
};
```
