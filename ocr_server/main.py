import os
import logging
import tempfile
import uuid
from pathlib import Path
from fastapi import FastAPI, File, Form, Header, HTTPException, UploadFile
from fastapi.responses import JSONResponse
from dotenv import load_dotenv
from .deepseek_client import extract_fields
from .paddle_pipeline import PaddlePipeline
from .rule_engine import evaluate
from starlette.concurrency import run_in_threadpool

load_dotenv(Path(__file__).parent / ".env")
app = FastAPI(title="Approval Insight OCR", version="2")
pipeline = PaddlePipeline()

def auth(token):
    import hmac
    expected = os.getenv("OCR_SERVICE_TOKEN", "")
    if len(expected) < 24:
        raise HTTPException(503, "OCR internal token is not configured")
    if not token or not hmac.compare_digest(token, "Bearer " + expected):
        raise HTTPException(401, "Unauthorized")

@app.get("/health")
def health():
    return {"ok": True}

@app.get("/v1/status")
def status(authorization: str | None = Header(None)):
    auth(authorization)
    return {"ready": pipeline.available and bool(os.getenv("DEEPSEEK_API_KEY")),
            "paddleAvailable": pipeline.available, "deepseekConfigured": bool(os.getenv("DEEPSEEK_API_KEY"))}

@app.post("/v1/recognize")
async def recognize(file: UploadFile = File(...), application_id: str = Form(""),
                    rule_version: str = Form("2026.1"), authorization: str | None = Header(None)):
    auth(authorization)
    if rule_version != "2026.1":
        raise HTTPException(400, "Unsupported rule version")
    if not pipeline.available:
        raise HTTPException(503, "PaddleOCR initialization failed")
    limit = int(os.getenv("MAX_UPLOAD_MB", "10")) * 1024 * 1024
    raw = await file.read(limit + 1)
    if len(raw) > limit:
        raise HTTPException(413, "File too large")
    suffix = ".png" if raw.startswith(b"\x89PNG\r\n\x1a\n") else ".jpg" if raw.startswith(b"\xff\xd8\xff") else ".pdf" if raw.startswith(b"%PDF-") else None
    if not suffix:
        raise HTTPException(415, "Unsupported file content")
    run_id = str(uuid.uuid4())
    text, blocks = "", []
    try:
        with tempfile.TemporaryDirectory(prefix="approval-ocr-") as directory:
            path = Path(directory) / ("input" + suffix)
            path.write_bytes(raw)
            text, blocks = await run_in_threadpool(pipeline.recognize, str(path))
        if not text.strip():
            return JSONResponse(status_code=422, content={"status":"FAILED","ocrText":text,"blocks":[],"error":"图片未识别到文字"})
        fields = await extract_fields(text)
        return {"runId":run_id,"status":"COMPLETED","ocrText":text,
                "blocks":[b.model_dump() if hasattr(b,"model_dump") else b for b in blocks],
                "fields":{k:v.model_dump() for k,v in fields.items()},
                "score":evaluate({k:v.model_dump() for k,v in fields.items()},rule_version),
                "provider":{"ocr":"PaddleOCR","llm":"DeepSeek","model":os.getenv("DEEPSEEK_MODEL","deepseek-chat"),"ruleVersion":rule_version}}
    except Exception:
        logging.exception("OCR recognition or field extraction failed")
        # Node persists both successes and failures, including OCR text; never persist a second business database here.
        return JSONResponse(status_code=502, content={"runId":run_id,"status":"FAILED","ocrText":text,
            "blocks":[b.model_dump() if hasattr(b,"model_dump") else b for b in blocks],
            "error":"OCR or field extraction failed; check server configuration"})
