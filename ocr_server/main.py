import hashlib
import json
import os
import sqlite3
import uuid
import mimetypes
from datetime import datetime, timezone
from pathlib import Path
from fastapi import FastAPI, File, Form, Header, HTTPException, UploadFile
from dotenv import load_dotenv
from .deepseek_client import extract_fields
from .paddle_pipeline import PaddlePipeline
from .rule_engine import evaluate
from .schemas import RecognitionResponse, StatusResponse

load_dotenv(Path(__file__).parent / ".env")
app = FastAPI(title="Approval Insight OCR Server", version="2026.1")
pipeline = PaddlePipeline()
DB = Path(__file__).parent / os.getenv("DATABASE_PATH", "../prisma/dev.db")
# Paddle/OpenCV on Windows cannot reliably open paths containing CJK characters.
# Keep the runtime copy in an ASCII-only directory; the database still records
# the original hash and metadata for traceability.
UPLOADS = Path(os.getenv("OCR_RUNTIME_UPLOAD_DIR", "C:/ocr_uploads"))
UPLOADS.mkdir(parents=True, exist_ok=True)

def db():
    DB.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB, timeout=30)
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA busy_timeout=30000")
    conn.executescript("""CREATE TABLE IF NOT EXISTS ocr_runs (id TEXT PRIMARY KEY, application_id TEXT, status TEXT, source_file TEXT, file_hash TEXT, rule_version TEXT, ocr_provider TEXT, llm_provider TEXT, error_message TEXT, ocr_text TEXT, result_json TEXT, created_at TEXT, completed_at TEXT);""")
    return conn

def auth(token: str | None):
    expected = os.getenv("OCR_SERVICE_TOKEN", "")
    if expected and token != f"Bearer {expected}": raise HTTPException(401, "OCR service token 无效")

@app.get("/health")
def health(): return {"ok": True, "service": "ocr-server"}

@app.get("/v1/status", response_model=StatusResponse)
def status(): return StatusResponse(ready=pipeline.available and bool(os.getenv("DEEPSEEK_API_KEY")), paddleAvailable=pipeline.available, deepseekConfigured=bool(os.getenv("DEEPSEEK_API_KEY")), databasePath=str(DB), model=os.getenv("DEEPSEEK_MODEL", "deepseek-chat"), detail=pipeline.detail or None)

@app.post("/v1/recognize", response_model=RecognitionResponse)
async def recognize(file: UploadFile = File(...), application_id: str = Form(""), rule_version: str = Form("2026.1"), authorization: str | None = Header(None)):
    auth(authorization)
    if not pipeline.available: raise HTTPException(503, "PaddleOCR 未安装或初始化失败")
    raw = await file.read()
    digest = hashlib.sha256(raw).hexdigest()
    # Never pass the user's original (possibly CJK) filename to OpenCV on
    # Windows; the hash plus a safe extension is sufficient for traceability.
    suffix = Path(file.filename or "").suffix.lower()
    if suffix not in {".png", ".jpg", ".jpeg", ".pdf"}:
        suffix = mimetypes.guess_extension(file.content_type or "") or ".bin"
    path = UPLOADS / f"{digest[:16]}{suffix}"
    path.write_bytes(raw)
    run_id = str(uuid.uuid4())
    conn = db(); now = datetime.now(timezone.utc).isoformat(); conn.execute("INSERT INTO ocr_runs VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)", (run_id,application_id,"PROCESSING",str(path),digest,rule_version,"PaddleOCR","DeepSeek",None,None,None,now,None)); conn.commit()
    try:
        text, blocks = pipeline.recognize(str(path))
        # Persist the local OCR output before the optional LLM step. If DeepSeek
        # is unavailable or returns invalid JSON, the raw recognition remains
        # queryable for manual confirmation instead of being discarded.
        conn.execute("UPDATE ocr_runs SET ocr_text=? WHERE id=?", (text, run_id))
        conn.commit()
        fields = await extract_fields(text)
        score = evaluate({k:v.model_dump() for k,v in fields.items()}, rule_version)
        response = RecognitionResponse(runId=run_id,status="COMPLETED",ocrText=text,blocks=blocks,fields=fields,score=score,provider={"model":os.getenv("DEEPSEEK_MODEL","deepseek-chat"),"ruleVersion":rule_version})
        conn.execute("UPDATE ocr_runs SET status=?,ocr_text=?,result_json=?,completed_at=? WHERE id=?",("COMPLETED",text,response.model_dump_json(),datetime.now(timezone.utc).isoformat(),run_id)); conn.commit(); return response
    except Exception as exc:
        conn.execute("UPDATE ocr_runs SET status=?,error_message=?,completed_at=? WHERE id=?",("FAILED",str(exc),datetime.now(timezone.utc).isoformat(),run_id)); conn.commit(); raise HTTPException(502, str(exc))

@app.get("/v1/runs/{run_id}")
def get_run(run_id: str):
    row = db().execute("SELECT id,application_id,status,source_file,file_hash,rule_version,ocr_provider,llm_provider,error_message,created_at,completed_at FROM ocr_runs WHERE id=?",(run_id,)).fetchone()
    if not row: raise HTTPException(404, "OCR run 不存在")
    return dict(zip(["id","applicationId","status","sourceFile","fileHash","ruleVersion","ocrProvider","llmProvider","errorMessage","createdAt","completedAt"],row))

@app.get("/v1/runs/{run_id}/raw")
def get_raw(run_id: str):
    row = db().execute("SELECT ocr_text,result_json FROM ocr_runs WHERE id=?",(run_id,)).fetchone()
    if not row: raise HTTPException(404, "OCR run 不存在")
    return {"ocrText":row[0] or "", "result":json.loads(row[1]) if row[1] else None}
