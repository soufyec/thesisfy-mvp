import hashlib
import hmac
import os
import httpx
from fastapi import FastAPI, Request, Header, HTTPException
from fastapi.responses import Response
app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)

def authorize(token):
    secret = os.environ.get("JWT_SECRET", "")
    expected = hmac.new(secret.encode(), b"thesisfic-private-engines-v1", hashlib.sha256).hexdigest()
    if not secret or not token or not hmac.compare_digest(token, expected):
        raise HTTPException(403, "forbidden")

@app.get("/health")
async def health(x_thesisfic_engine: str | None = Header(default=None)):
    authorize(x_thesisfic_engine)
    async with httpx.AsyncClient() as client:
        response = await client.get("http://127.0.0.1:8081/v2/languages", timeout=20)
    return {"ok": response.status_code == 200}

@app.post("/v2/check")
async def check(request: Request, x_thesisfic_engine: str | None = Header(default=None)):
    authorize(x_thesisfic_engine)
    data = bytearray()
    async for part in request.stream():
        data.extend(part)
        if len(data) > 200000:
            raise HTTPException(413, "too_large")
    async with httpx.AsyncClient() as client:
        response = await client.post("http://127.0.0.1:8081/v2/check", content=bytes(data), headers={"Content-Type": "application/x-www-form-urlencoded"}, timeout=25)
    return Response(response.content, status_code=response.status_code, media_type="application/json", headers={"Cache-Control": "no-store"})
