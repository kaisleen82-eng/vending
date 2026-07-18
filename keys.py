import json
import os
import time
import uuid
import hashlib
import subprocess
from datetime import datetime, timedelta
from config import KEYS_FILE, HWID_BINDINGS_FILE

DB_JSON = os.path.join(os.path.dirname(os.path.abspath(__file__)), "db.json")


KEY_TYPES = {
    "hourly":  {"label": "1 Hour",    "seconds": 3600},
    "daily":   {"label": "1 Day",     "seconds": 86400},
    "weekly":  {"label": "1 Week",    "seconds": 604800},
    "monthly": {"label": "1 Month",   "seconds": 2592000},
    "lifetime":{"label": "Lifetime",  "seconds": None},
}


def _load(path):
    if os.path.exists(path):
        with open(path, "r") as f:
            return json.load(f)
    return {}


def _save(path, data):
    with open(path, "w") as f:
        json.dump(data, f, indent=2)
    _sync_db(data)


def _sync_db(data):
    import urllib.request
    import base64
    try:
        with open(DB_JSON, "w") as f:
            json.dump(data, f, indent=2)
    except Exception:
        pass

    github_token = os.environ.get("VENDING_GITHUB_TOKEN", "")
    if not github_token:
        try:
            subprocess.run(["git", "add", "db.json"], capture_output=True, timeout=5)
            subprocess.run(["git", "commit", "-m", "sync keys"], capture_output=True, timeout=5)
            subprocess.run(["git", "push"], capture_output=True, timeout=15)
        except Exception:
            pass
        return

    repo = "kaisleen82-eng/vending"
    path = "db.json"
    url = f"https://api.github.com/repos/{repo}/contents/{path}"
    headers = {
        "Authorization": f"token {github_token}",
        "Accept": "application/vnd.github.v3+json",
        "User-Agent": "vending-bot",
    }

    try:
        req = urllib.request.Request(url, headers=headers)
        resp = urllib.request.urlopen(req, timeout=10)
        existing = json.loads(resp.read().decode())
        sha = existing.get("sha", "")
    except Exception:
        sha = ""

    content = base64.b64encode(json.dumps(data, indent=2).encode()).decode()
    payload = json.dumps({
        "message": "sync keys",
        "content": content,
        "sha": sha,
    }).encode()

    try:
        req = urllib.request.Request(url, data=payload, headers=headers, method="PUT")
        urllib.request.urlopen(req, timeout=15)
    except Exception:
        pass


def _gen_key():
    parts = []
    for _ in range(4):
        seg = uuid.uuid4().hex[:5].upper()
        parts.append(seg)
    return "VEN-" + "-".join(parts)


def _hash_password(password):
    return hashlib.sha256(password.encode()).hexdigest()


def generate_keys(key_type: str, amount: int, note: str = "") -> list:
    if key_type not in KEY_TYPES:
        raise ValueError(f"Invalid key type: {key_type}. Use: {', '.join(KEY_TYPES.keys())}")
    amount = max(1, min(amount, 50))

    db = _load(KEYS_FILE)
    created = []
    now = time.time()

    for _ in range(amount):
        key = _gen_key()
        while key in db:
            key = _gen_key()
        db[key] = {
            "key": key,
            "type": key_type,
            "type_label": KEY_TYPES[key_type]["label"],
            "created_at": now,
            "created_date": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            "expires_at": now + KEY_TYPES[key_type]["seconds"] if KEY_TYPES[key_type]["seconds"] else None,
            "hwid": None,
            "hwid_bound": False,
            "redeemed": False,
            "redeemed_by": None,
            "redeemed_at": None,
            "revoked": False,
            "note": note,
            "username": None,
            "password": None,
            "registered": False,
        }
        created.append(key)

    _save(KEYS_FILE, db)
    return created


def get_key_info(key: str) -> dict:
    db = _load(KEYS_FILE)
    return db.get(key.upper())


def check_key(key: str) -> dict:
    info = get_key_info(key)
    if not info:
        return {"valid": False, "reason": "Key not found"}
    if info.get("revoked"):
        return {"valid": False, "reason": "Key has been revoked"}
    if info.get("expires_at") and time.time() > info["expires_at"]:
        return {"valid": False, "reason": "Key has expired"}
    return {"valid": True, "info": info}


def register_key(key: str, username: str, password: str) -> dict:
    db = _load(KEYS_FILE)
    info = db.get(key.upper())
    if not info:
        return {"success": False, "reason": "Key not found"}
    if info.get("revoked"):
        return {"success": False, "reason": "Key has been revoked"}
    if info.get("expires_at") and time.time() > info["expires_at"]:
        return {"success": False, "reason": "Key has expired"}
    if info.get("registered"):
        return {"success": False, "reason": "Key is already registered to a user"}

    db[key.upper()]["username"] = username
    db[key.upper()]["password"] = _hash_password(password)
    db[key.upper()]["registered"] = True
    _save(KEYS_FILE, db)

    return {"success": True, "info": db[key.upper()]}


def login_key(key: str, username: str, password: str) -> dict:
    db = _load(KEYS_FILE)
    info = db.get(key.upper())
    if not info:
        return {"valid": False, "reason": "Key not found"}
    if info.get("revoked"):
        return {"valid": False, "reason": "Key has been revoked"}
    if info.get("expires_at") and time.time() > info["expires_at"]:
        return {"valid": False, "reason": "Key has expired"}
    if not info.get("registered"):
        return {"valid": False, "reason": "Key is not registered. Use /register first."}
    if info.get("username") != username:
        return {"valid": False, "reason": "Invalid username"}
    if info.get("password") != _hash_password(password):
        return {"valid": False, "reason": "Invalid password"}
    return {"valid": True, "info": info}


def redeem_key(key: str, hwid: str, username: str = None) -> dict:
    db = _load(KEYS_FILE)
    info = db.get(key.upper())
    if not info:
        return {"success": False, "reason": "Key not found"}
    if info.get("revoked"):
        return {"success": False, "reason": "Key has been revoked"}
    if info.get("expires_at") and time.time() > info["expires_at"]:
        return {"success": False, "reason": "Key has expired"}

    if info.get("hwid") and info["hwid"] != hwid:
        return {"success": False, "reason": "Key is locked to a different HWID"}

    db[key.upper()]["hwid"] = hwid
    db[key.upper()]["hwid_bound"] = True
    db[key.upper()]["redeemed"] = True
    db[key.upper()]["redeemed_by"] = username
    db[key.upper()]["redeemed_at"] = time.time()
    _save(KEYS_FILE, db)

    bindings = _load(HWID_BINDINGS_FILE)
    if hwid not in bindings:
        bindings[hwid] = []
    if key.upper() not in bindings[hwid]:
        bindings[hwid].append(key.upper())
    _save(HWID_BINDINGS_FILE, bindings)

    return {"success": True, "info": db[key.upper()]}


def revoke_key(key: str) -> bool:
    db = _load(KEYS_FILE)
    if key.upper() in db:
        db[key.upper()]["revoked"] = True
        _save(KEYS_FILE, db)
        return True
    return False


def list_keys(include_revoked=False) -> list:
    db = _load(KEYS_FILE)
    keys = list(db.values())
    if not include_revoked:
        keys = [k for k in keys if not k.get("revoked")]
    return sorted(keys, key=lambda x: x.get("created_at", 0), reverse=True)


def get_stats() -> dict:
    db = _load(KEYS_FILE)
    total = len(db)
    active = sum(1 for k in db.values() if not k.get("revoked") and (not k.get("expires_at") or time.time() < k["expires_at"]))
    revoked = sum(1 for k in db.values() if k.get("revoked"))
    expired = sum(1 for k in db.values() if not k.get("revoked") and k.get("expires_at") and time.time() > k["expires_at"])
    redeemed = sum(1 for k in db.values() if k.get("redeemed"))
    registered = sum(1 for k in db.values() if k.get("registered"))

    by_type = {}
    for k in db.values():
        t = k.get("type", "unknown")
        by_type[t] = by_type.get(t, 0) + 1

    return {
        "total": total,
        "active": active,
        "revoked": revoked,
        "expired": expired,
        "redeemed": redeemed,
        "registered": registered,
        "by_type": by_type,
    }
