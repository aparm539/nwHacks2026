"""
Keyword Extraction Microservice
A FastAPI-based microservice for extracting keywords from text using YAKE.
"""

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
import yake
from typing import Optional

app = FastAPI(
    title="Keyword Extraction Service",
    description="Extract keywords from text using YAKE algorithm",
    version="1.0.0",
)

# CORS middleware for cross-origin requests
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class ExtractionRequest(BaseModel):
    """Request body for keyword extraction."""
    text: str = Field(..., min_length=1, description="Text to extract keywords from")
    max_keywords: Optional[int] = Field(10, ge=1, le=50, description="Maximum number of keywords to return")
    language: Optional[str] = Field("en", description="Language code (e.g., 'en', 'fr', 'de')")
    deduplication_threshold: Optional[float] = Field(0.9, ge=0.0, le=1.0, description="Threshold for deduplication")
    n_gram_max: Optional[int] = Field(3, ge=1, le=5, description="Maximum n-gram size")


class Keyword(BaseModel):
    """A single extracted keyword with its score."""
    keyword: str
    score: float


class ExtractionResponse(BaseModel):
    """Response containing extracted keywords."""
    keywords: list[Keyword]
    text_length: int
    keyword_count: int


@app.get("/")
async def root():
    """Health check endpoint."""
    return {"status": "healthy", "service": "keyword-extraction"}


@app.get("/health")
async def health():
    """Health check endpoint for container orchestration."""
    return {"status": "healthy"}


@app.post("/extract", response_model=ExtractionResponse)
async def extract_keywords(request: ExtractionRequest):
    """
    Extract keywords from the provided text.
    
    Uses YAKE (Yet Another Keyword Extractor) algorithm which is:
    - Unsupervised (no training required)
    - Language-independent
    - Domain-independent
    
    Lower scores indicate more relevant keywords.
    """
    try:
        # Configure YAKE extractor
        kw_extractor = yake.KeywordExtractor(
            lan=request.language,
            n=request.n_gram_max,
            dedupLim=request.deduplication_threshold,
            top=request.max_keywords,
            features=None,
        )
        
        # Extract keywords
        keywords_raw = kw_extractor.extract_keywords(request.text)
        
        # Format response
        keywords = [
            Keyword(keyword=kw, score=round(score, 6))
            for kw, score in keywords_raw
        ]
        
        return ExtractionResponse(
            keywords=keywords,
            text_length=len(request.text),
            keyword_count=len(keywords),
        )
        
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error extracting keywords: {str(e)}"
        )


@app.post("/extract/batch")
async def extract_keywords_batch(requests: list[ExtractionRequest]):
    """
    Extract keywords from multiple texts in a single request.
    """
    results = []
    for req in requests:
        try:
            result = await extract_keywords(req)
            results.append({"success": True, "data": result})
        except HTTPException as e:
            results.append({"success": False, "error": e.detail})
    
    return {"results": results, "total": len(results)}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
