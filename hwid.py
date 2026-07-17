import subprocess
import hashlib
import platform
import uuid


def _get_machine_guid():
    try:
        result = subprocess.run(
            ["reg", "query",
             r"HKLM\SOFTWARE\Microsoft\Cryptography", "/v", "MachineGuid"],
            capture_output=True, text=True, timeout=10
        )
        for line in result.stdout.splitlines():
            if "MachineGuid" in line:
                return line.split()[-1]
    except Exception:
        pass
    return None


def _get_volume_serial():
    try:
        result = subprocess.run(
            ["cmd", "/c", "vol", "C:"],
            capture_output=True, text=True, timeout=10
        )
        for line in result.stdout.splitlines():
            if "Volume Serial Number" in line:
                return line.split()[-1]
    except Exception:
        pass
    return None


def _get_cpu_id():
    try:
        result = subprocess.run(
            ["wmic", "cpu", "get", "ProcessorId"],
            capture_output=True, text=True, timeout=10
        )
        lines = [l.strip() for l in result.stdout.splitlines() if l.strip() and l.strip() != "ProcessorId"]
        if lines:
            return lines[0]
    except Exception:
        pass
    return None


def get_hwid():
    parts = [
        _get_machine_guid() or "",
        _get_volume_serial() or "",
        _get_cpu_id() or "",
        platform.node(),
    ]
    raw = "|".join(parts)
    return hashlib.sha256(raw.encode()).hexdigest()[:32].upper()


def format_hwid_display(hwid):
    return f"{hwid[:8]}-{hwid[8:16]}-{hwid[16:24]}-{hwid[24:]}"
