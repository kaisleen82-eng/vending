import os
import json

APP_NAME = "VENDING"
VERSION = "1.0.0"
ENCRYPTION_KEY = "Vending2025!SecureKey#Pro99"
XOR_SHIFT = 42

BOT_TOKEN = os.environ["VENDING_BOT_TOKEN"]
ADMIN_IDS = [int(x) for x in os.environ.get("VENDING_ADMIN_IDS", "").split(",") if x.strip()]

DATA_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data")
KEYS_FILE = os.path.join(DATA_DIR, "keys.json")
HWID_BINDINGS_FILE = os.path.join(DATA_DIR, "hwid_bindings.json")

os.makedirs(DATA_DIR, exist_ok=True)
