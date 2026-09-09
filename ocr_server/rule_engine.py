import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

def load_rules(version="2026.1"):
    with open(ROOT / "rules" / f"{version}.json", encoding="utf-8") as f:
        return json.load(f)

def evaluate(fields, version="2026.1", requested_amount=None, remaining_budget=None):
    rules = load_rules(version)
    breakdown, missing, raw, possible = {}, [], 0, 0
    for key, dimension in rules["dimensions"].items():
        field = fields.get(key, {})
        option = field.get("value", "") if isinstance(field, dict) else str(field or "")
        score = dimension["options"].get(option)
        confirmed = score is not None and not field.get("needsConfirmation", False)
        if confirmed:
            raw += score
        else:
            missing.append(key)
            possible += dimension["maxScore"]
        breakdown[key] = {"option": option, "score": score, "confirmed": confirmed, "maxScore": dimension["maxScore"]}
    band = next((b for b in rules["amountBands"] if b["min"] <= raw <= b["max"]), rules["amountBands"][-1])
    caps = [band["amount"]]
    if requested_amount is not None: caps.append(float(requested_amount))
    if remaining_budget is not None: caps.append(float(remaining_budget))
    return {"rawScore":raw,"percentile":round(raw/rules["maxScore"]*100,1),"grade":band["grade"],"recommendedRange":band["range"],"defaultAmount":min(caps),"minPossible":raw,"maxPossible":raw+possible,"completeness":round((len(rules["dimensions"])-len(missing))/len(rules["dimensions"])*100),"missingKeys":missing,"breakdown":breakdown}
