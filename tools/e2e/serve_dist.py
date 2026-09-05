"""Small gzip-capable SPA server for production-build acceptance tests."""

from __future__ import annotations

import argparse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import gzip
import mimetypes
from pathlib import Path
from urllib.parse import unquote, urlsplit


COMPRESSIBLE_SUFFIXES = {
    ".css",
    ".html",
    ".js",
    ".json",
    ".map",
    ".svg",
    ".txt",
    ".webmanifest",
}


def build_handler(root: Path):
    class ProductionHandler(BaseHTTPRequestHandler):
        server_version = "iGEMerDBAcceptance/1.0"

        def _resolve(self) -> Path:
            request_path = unquote(urlsplit(self.path).path).lstrip("/")
            candidate = (root / request_path).resolve()
            try:
                candidate.relative_to(root)
            except ValueError:
                return root / "index.html"
            if candidate.is_dir():
                candidate = candidate / "index.html"
            if not candidate.is_file():
                return root / "index.html"
            return candidate

        def _serve(self, include_body: bool) -> None:
            path = self._resolve()
            payload = path.read_bytes()
            accepts_gzip = "gzip" in self.headers.get("Accept-Encoding", "")
            use_gzip = accepts_gzip and path.suffix.lower() in COMPRESSIBLE_SUFFIXES
            if use_gzip:
                payload = gzip.compress(payload, compresslevel=6, mtime=0)

            mime_type = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
            self.send_response(200)
            self.send_header("Content-Type", f"{mime_type}; charset=utf-8")
            self.send_header("Content-Length", str(len(payload)))
            self.send_header("Vary", "Accept-Encoding")
            if use_gzip:
                self.send_header("Content-Encoding", "gzip")
            if "/assets/" in self.path:
                self.send_header("Cache-Control", "public, max-age=31536000, immutable")
            elif "/data/web/" in self.path:
                self.send_header("Cache-Control", "public, max-age=3600")
            else:
                self.send_header("Cache-Control", "no-cache")
            self.end_headers()
            if include_body:
                self.wfile.write(payload)

        def do_GET(self) -> None:  # noqa: N802
            self._serve(include_body=True)

        def do_HEAD(self) -> None:  # noqa: N802
            self._serve(include_body=False)

        def log_message(self, format: str, *args: object) -> None:
            return

    return ProductionHandler


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", default="dist")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=43180)
    args = parser.parse_args()

    root = Path(args.root).resolve()
    if not (root / "index.html").is_file():
        raise SystemExit(f"Production build not found at {root}")
    server = ThreadingHTTPServer((args.host, args.port), build_handler(root))
    print(f"Serving {root} on http://{args.host}:{args.port}", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
