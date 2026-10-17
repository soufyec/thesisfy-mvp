"""Private processing only. Text is never logged, retained, or sent to a model vendor."""
import hashlib
import hmac
import os
from functools import lru_cache
from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel, Field
from presidio_analyzer import AnalyzerEngine
from presidio_analyzer.nlp_engine import NlpEngineProvider
from langdetect import detect, DetectorFactory
from languages import LANGUAGES, analysis_languages

DetectorFactory.seed = 0
app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)
ENTITIES = {"PERSON", "EMAIL_ADDRESS", "PHONE_NUMBER", "LOCATION", "IBAN_CODE", "CREDIT_CARD", "IP_ADDRESS"}

def authorize(token):
    secret = os.environ.get("JWT_SECRET", "")
    expected = hmac.new(secret.encode(), b"thesisfic-private-engines-v1", hashlib.sha256).hexdigest()
    if not secret or not token or not hmac.compare_digest(token, expected):
        raise HTTPException(403, "forbidden")

@lru_cache(maxsize=1)
def analyzer():
    engine = NlpEngineProvider(nlp_configuration={"nlp_engine_name": "spacy", "models": [
        {"lang_code": lang, "model_name": model} for lang, model in LANGUAGES.items()
    ]}).create_engine()
    return AnalyzerEngine(nlp_engine=engine, supported_languages=list(LANGUAGES))

@lru_cache(maxsize=1)
def embedder():
    from sentence_transformers import SentenceTransformer
    return SentenceTransformer("/app/embedding", device="cpu", local_files_only=True)

class AnalyzeBody(BaseModel):
    text: str = Field(max_length=240000)
    language: str = "auto"
    entities: list[str] = Field(default_factory=lambda: sorted(ENTITIES), max_length=20)

class EmbedBody(BaseModel):
    texts: list[str] = Field(min_length=1, max_length=16)

@app.get("/health")
def health(x_thesisfic_engine: str | None = Header(default=None)):
    authorize(x_thesisfic_engine)
    analyzer()
    return {"ok": True, "languages": list(LANGUAGES), "embeddingDimensions": 384}

@app.post("/analyze")
def analyze(body: AnalyzeBody, x_thesisfic_engine: str | None = Header(default=None)):
    authorize(x_thesisfic_engine)
    if any(entity not in ENTITIES for entity in body.entities):
        raise HTTPException(422, "unsupported_entity")
    try:
        languages = analysis_languages(body.text, body.language, detect)
    except ValueError:
        raise HTTPException(422, "unsupported_language")
    results = [r for language in languages for r in analyzer().analyze(text=body.text, language=language, entities=body.entities)]
    return [{"start": r.start, "end": r.end, "entity_type": r.entity_type, "score": r.score} for r in results]

@app.post("/embed")
def embed(body: EmbedBody, x_thesisfic_engine: str | None = Header(default=None)):
    authorize(x_thesisfic_engine)
    if any(not t.strip() or len(t) > 4000 for t in body.texts) or sum(map(len, body.texts)) > 32000:
        raise HTTPException(422, "invalid_input")
    vectors = embedder().encode(body.texts, normalize_embeddings=True, show_progress_bar=False)
    return {"vectors": vectors.tolist(), "model": "multilingual-minilm-l12-v2-e8f8c211", "dimensions": 384}
