#!/usr/bin/env python3
"""
Serve the web app locally: http://localhost:8000

    python3 scripts/serve.py          # port 8000
    python3 scripts/serve.py 8080     # another port

Same as `python3 -m http.server 8000 -d site`, with one difference: every
response tells the browser not to reuse a stored copy without checking for
a newer one first ("Cache-Control: no-cache"). Without it, a browser can mix
freshly edited files with old cached ones (e.g. a new index.html with an old
app.js), which breaks the page after you change the code.

Only the Python standard library is used. Stop the server with Ctrl + C.
"""

import functools
import http.server
import sys
from pathlib import Path

SITE = Path(__file__).resolve().parent.parent / "site"


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-cache")
        super().end_headers()


def main() -> None:
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    handler = functools.partial(NoCacheHandler, directory=str(SITE))
    with http.server.ThreadingHTTPServer(("", port), handler) as server:
        print(f"Serving {SITE} at http://localhost:{port}  (stop with Ctrl + C)")
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            print("\nStopped.")


if __name__ == "__main__":
    main()
