import json
import os
import httpx
from .schemas import ExtractedField

FIELD_KEYS = ["region","district","applicant","hospital","kol","projectName","meetingDate","requestedAmount","background","benefits","currentSales","targetSales","expertLevel","salesTrend","productType","hospitalValue"]

async def extract_fields(text: str) -> dict[str, ExtractedField]:
    api_key = os.getenv("DEEPSEEK_API_KEY", "")
    if not api_key: raise RuntimeError("DeepSeek 未配置：请设置 DEEPSEEK_API_KEY")
    base = os.getenv("DEEPSEEK_BASE_URL", "https://api.deepseek.com").rstrip("/")
    model = os.getenv("DEEPSEEK_MODEL", "deepseek-chat")
    prompt = "只输出JSON对象。字段只能从以下列表选择：" + ",".join(FIELD_KEYS) + "。每个字段格式为 {value,confidence,sourceText,needsConfirmation}。无法判断的 value 为空、confidence 为0、needsConfirmation为true。不要补造事实。\nOCR原文：\n" + text
    async with httpx.AsyncClient(timeout=float(os.getenv("OCR_TIMEOUT_SECONDS", "120"))) as client:
        response = await client.post(f"{base}/chat/completions", headers={"Authorization":f"Bearer {api_key}"}, json={"model":model,"temperature":0,"response_format":{"type":"json_object"},"messages":[{"role":"user","content":prompt}]})
        response.raise_for_status()
        content = response.json()["choices"][0]["message"]["content"]
    data = json.loads(content) if isinstance(content, str) else content
    result = {}
    for key in FIELD_KEYS:
        value = data.get(key, {}) if isinstance(data, dict) else {}
        if isinstance(value, str): value = {"value": value}
        result[key] = ExtractedField(value=str(value.get("value", "") or ""), confidence=max(0, min(1, float(value.get("confidence", 0) or 0))), sourceText=str(value.get("sourceText", "") or ""), needsConfirmation=bool(value.get("needsConfirmation", True)))
    return result
