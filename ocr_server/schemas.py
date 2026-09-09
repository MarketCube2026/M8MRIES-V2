from typing import Dict, List, Optional
from pydantic import BaseModel, Field

class TextBlock(BaseModel):
    text: str
    confidence: float = Field(ge=0, le=1)
    x: float
    y: float
    width: float
    height: float

class ExtractedField(BaseModel):
    value: str = ""
    confidence: float = Field(default=0, ge=0, le=1)
    sourceText: str = ""
    needsConfirmation: bool = True

class ScoreResult(BaseModel):
    rawScore: int
    percentile: float
    grade: str
    recommendedRange: str
    defaultAmount: float
    minPossible: int
    maxPossible: int
    completeness: int
    missingKeys: List[str]
    breakdown: Dict[str, dict]

class ProviderInfo(BaseModel):
    ocr: str = "PaddleOCR"
    llm: str = "DeepSeek"
    model: str
    ruleVersion: str

class RecognitionResponse(BaseModel):
    runId: str
    status: str
    ocrText: str
    blocks: List[TextBlock]
    fields: Dict[str, ExtractedField]
    score: ScoreResult
    provider: ProviderInfo
    cached: bool = False

class StatusResponse(BaseModel):
    ready: bool
    paddleAvailable: bool
    deepseekConfigured: bool
    databasePath: str
    model: str
    detail: Optional[str] = None
