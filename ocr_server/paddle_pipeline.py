import os
from pathlib import Path
from typing import List
from .schemas import TextBlock


def _positive_int(name: str, default: int) -> int:
    try:
        value = int(os.getenv(name, str(default)))
    except ValueError:
        return default
    return value if value > 0 else default


class PaddlePipeline:
    def __init__(self):
        try:
            # Paddle resolves some caches through expanduser during import. On
            # managed Windows hosts that profile cache may be read-only.
            cache_root = Path(os.getenv("OCR_PADDLE_CACHE", r"C:\ocr_paddle_runtime"))
            cache_root.mkdir(parents=True, exist_ok=True)
            original_expanduser = os.path.expanduser

            def expanduser(path: str) -> str:
                if path.startswith("~/.cache/paddle") or path.startswith(r"~\.cache\paddle"):
                    suffix = path[len("~/.cache/paddle"):].lstrip("/\\")
                    return str(cache_root / suffix) if suffix else str(cache_root)
                return original_expanduser(path)

            os.path.expanduser = expanduser
            from paddleocr import PaddleOCR
            # Orientation adds a separate model and is unnecessary for the forms
            # handled here; keeping it off also reduces CPU startup cost on Windows.
            self.engine = PaddleOCR(
                lang="ch",
                ocr_version="PP-OCRv4",
                use_doc_orientation_classify=False,
                use_doc_unwarping=False,
                use_textline_orientation=False,
                cpu_threads=_positive_int("OCR_CPU_THREADS", 1),
                text_recognition_batch_size=1,
                text_det_limit_side_len=_positive_int("OCR_DETECTION_MAX_SIDE", 1600),
                text_det_limit_type="max",
            )
            self.available = True
            self.detail = ""
        except Exception as exc:
            self.engine = None
            self.available = False
            self.detail = str(exc)
        finally:
            if "original_expanduser" in locals():
                os.path.expanduser = original_expanduser

    def recognize(self, image_path: str) -> tuple[str, List[TextBlock]]:
        if not self.engine:
            raise RuntimeError(f"PaddleOCR 不可用：{self.detail}")
        result = self.engine.predict(image_path)
        blocks: List[TextBlock] = []
        for page in result:
            data = page.json if hasattr(page, "json") else page
            if callable(data): data = data()
            payload = data.get("res", data) if isinstance(data, dict) else {}
            texts = payload.get("rec_texts", [])
            scores = payload.get("rec_scores", [])
            boxes = payload.get("rec_boxes", [])
            for index, text in enumerate(texts):
                box = boxes[index] if index < len(boxes) else [0, 0, 0, 0]
                x1, y1, x2, y2 = [float(v) for v in box]
                blocks.append(TextBlock(text=str(text), confidence=float(scores[index]) if index < len(scores) else 0, x=x1, y=y1, width=x2-x1, height=y2-y1))
        return "\n".join(x.text for x in blocks), blocks
