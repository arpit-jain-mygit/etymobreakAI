from __future__ import annotations

import json
from http.server import BaseHTTPRequestHandler

from backend.service import AnalysisError, analyze


class handler(BaseHTTPRequestHandler):
    def _send_json(self, status: int, payload: dict) -> None:
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Allow-Methods", "GET,POST,OPTIONS")
        self.end_headers()
        self.wfile.write(json.dumps(payload).encode("utf-8"))

    def do_OPTIONS(self) -> None:  # noqa: N802
        self._send_json(204, {})

    def do_GET(self) -> None:  # noqa: N802
        self._send_json(200, {"status": "ok"})

    def do_POST(self) -> None:  # noqa: N802
        content_length = int(self.headers.get("content-length", "0"))
        raw = self.rfile.read(content_length).decode("utf-8") if content_length else "{}"

        try:
            payload = json.loads(raw)
        except json.JSONDecodeError:
            self._send_json(400, {"error": "Invalid JSON body."})
            return

        query = str(payload.get("query", ""))
        mode = str(payload.get("mode", "word"))
        try:
            self._send_json(200, analyze(query, mode))
        except AnalysisError as exc:
            self._send_json(exc.status_code, {"error": exc.message, "details": exc.details})
