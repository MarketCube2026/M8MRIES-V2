import json
import os
from pathlib import Path
import httpx
from .schemas import ExtractedField

BUSINESS_FIELD_KEYS = ["region","district","applicant","hospital","department","kol","projectName","meetingDate","requestedAmount","background","benefits","currentSales","targetSales","inHospitalSubmissionRatio","growthPoints"]
SCORE_FIELD_KEYS = ["meetingLevel","academicBenefit","expertLevel","productType","hospitalValue","monthlySales","salesTrend","growthOpportunity","communication","execution"]
FIELD_KEYS = BUSINESS_FIELD_KEYS + SCORE_FIELD_KEYS

def score_options() -> dict:
    rules_path = Path(__file__).resolve().parent.parent / "rules" / "2026.1.json"
    with rules_path.open(encoding="utf-8") as handle:
        dimensions = json.load(handle)["dimensions"]
    return {key: list(dimensions[key]["options"].keys()) for key in SCORE_FIELD_KEYS}

async def extract_fields(text: str) -> dict[str, ExtractedField]:
    api_key = os.getenv("DEEPSEEK_API_KEY", "")
    if not api_key: raise RuntimeError("DeepSeek 未配置：请设置 DEEPSEEK_API_KEY")
    base = os.getenv("DEEPSEEK_BASE_URL", "https://api.deepseek.com").rstrip("/")
    model = os.getenv("DEEPSEEK_MODEL", "deepseek-chat")
    prompt = "只输出JSON对象。字段只能从以下列表选择：" + ",".join(FIELD_KEYS) + "。每个字段格式为 {value,confidence,sourceText,needsConfirmation}。无法判断的 value 为空、confidence 为0、needsConfirmation为true。不要补造事实。\nOCR原文：\n" + text
    prompt += "\n字段说明：region 是公司大区（如南区、北区），优先从参会部门或区域部门提取，不能用省份代替；district 是省市或业务地区。hospital 必须是可读的医院名称，优先从本会议目标客户信息提取，纯数字、字母编码或统一社会信用代码不得作为医院。department 必须是明确出现的可读科室名称，编码或仅凭参会人员类型推断时留空。benefits 为参会权益（会议权益），保留具体内容；inHospitalSubmissionRatio 为院内送检占比，保留百分比和口径，不得用市场占有率或产品占比代替；growthPoints 为增长点，完整保留各项措施和目标。requestedAmount 为万元单位的纯数字字符串，原文为元时除以10000，不能把总预算当总部申请金额；meetingDate 为YYYY-MM-DD完整日期，缺少年份时留空。缺少依据留空。"
    prompt += "\n评分字段只能使用以下选项中的完整原文，不得自由改写；材料不足时必须留空：" + json.dumps(score_options(), ensure_ascii=False)
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
