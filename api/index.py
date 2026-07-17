import json
import time
import hashlib
import urllib.request
from urllib.parse import urlparse, parse_qs
from http.server import BaseHTTPRequestHandler

DB_URL = "https://raw.githubusercontent.com/kaisleen82-eng/vending/master/db.json"
_keys_cache = None
_keys_cache_time = 0
CACHE_TTL = 15


def _load_keys():
    global _keys_cache, _keys_cache_time
    now = time.time()
    if _keys_cache is not None and (now - _keys_cache_time) < CACHE_TTL:
        return _keys_cache
    try:
        req = urllib.request.Request(DB_URL, headers={"Cache-Control": "no-cache"})
        with urllib.request.urlopen(req, timeout=8) as resp:
            data = json.loads(resp.read().decode())
        _keys_cache = data
        _keys_cache_time = now
        return data
    except Exception:
        return _keys_cache or {}


def _hash_password(password):
    return hashlib.sha256(password.encode()).hexdigest()


class handler(BaseHTTPRequestHandler):
    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")

    def _json(self, code, data):
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self._cors()
        self.end_headers()
        self.wfile.write(json.dumps(data).encode())

    def _parse_body(self):
        length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(length) if length else b"{}"
        return json.loads(body)

    def do_OPTIONS(self):
        self.send_response(200)
        self._cors()
        self.end_headers()

    def do_GET(self):
        parsed = urlparse(self.path)
        params = parse_qs(parsed.query)

        if parsed.path == "/api/health":
            keys = _load_keys()
            self._json(200, {"status": "ok", "keys": len(keys)})

        elif parsed.path == "/api/get":
            key = params.get("key", [None])[0]
            if not key:
                self._json(400, {"error": "Missing key"})
                return
            keys = _load_keys()
            key = key.upper().strip()
            info = keys.get(key)
            if not info:
                self._json(404, {"error": "Key not found"})
                return
            self._json(200, {"key": key, "valid": True, "type": info.get("type_label", "N/A")})

        else:
            self._json(404, {"error": "Not found"})

    def do_POST(self):
        parsed = urlparse(self.path)

        if parsed.path == "/api/login":
            data = self._parse_body()
            key = data.get("key", "").upper().strip()
            username = data.get("username", "").strip()
            password = data.get("password", "")

            if not key or not username or not password:
                self._json(200, {"success": False, "reason": "All fields required"})
                return

            keys = _load_keys()
            info = keys.get(key)
            if not info:
                self._json(200, {"success": False, "reason": "Key not found. Only keys generated via Discord bot are valid."})
                return
            if info.get("revoked"):
                self._json(200, {"success": False, "reason": "Key has been revoked"})
                return
            if info.get("expires_at") and time.time() > info["expires_at"]:
                self._json(200, {"success": False, "reason": "Key has expired"})
                return
            if not info.get("registered"):
                self._json(200, {"success": False, "reason": "Key not registered. Use /register in Discord first."})
                return
            if info.get("username") != username:
                self._json(200, {"success": False, "reason": "Invalid username"})
                return
            if info.get("password") != _hash_password(password):
                self._json(200, {"success": False, "reason": "Invalid password"})
                return

            self._json(200, {
                "success": True, "key": key, "username": username,
                "type": info.get("type_label", "N/A"),
            })

        elif parsed.path == "/api/register":
            data = self._parse_body()
            key = data.get("key", "").upper().strip()
            username = data.get("username", "").strip()
            password = data.get("password", "")

            if not key or not username or not password:
                self._json(200, {"success": False, "reason": "All fields required"})
                return

            keys = _load_keys()
            info = keys.get(key)
            if not info:
                self._json(200, {"success": False, "reason": "Key not found"})
                return
            if info.get("registered"):
                self._json(200, {"success": False, "reason": "Key already registered"})
                return

            self._json(200, {"success": True, "info": info})

        else:
            self._json(404, {"error": "Not found"})

    def log_message(self, format, *args):
        pass
