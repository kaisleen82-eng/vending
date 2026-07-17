import base64
from config import XOR_SHIFT


def encrypt_lua_script(config_header: str, lua_body: str) -> str:
    plaintext = config_header + lua_body
    encrypted = bytes([(b + XOR_SHIFT) % 256 for b in plaintext.encode("utf-8")])
    return base64.b64encode(encrypted).decode("ascii")


def generate_secure_decoder(b64_blob: str) -> str:
    shift = XOR_SHIFT
    return (
        "local function d64(s)\n"
        "local b='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'\n"
        "local t,p={},1\n"
        "for i=1,#s,4 do\n"
        "if s:sub(i,i)=='='then break end\n"
        "local a=b:find(s:sub(p,p),1,true)or 0\n"
        "local e=b:find(s:sub(p+1,p+1),1,true)or 0\n"
        "local f=b:find(s:sub(p+2,p+2),1,true)or 0\n"
        "local g=b:find(s:sub(p+3,p+3),1,true)or 0\n"
        "p=p+4\n"
        "local n=(a-1)*262144+(e-1)*4096+(f-1)*64+(g-1)\n"
        "t[#t+1]=string.char(math.floor(n/65536)%256)\n"
        "if s:sub(p-2,p-2)~='='then t[#t+1]=string.char(math.floor(n/256)%256) end\n"
        "if s:sub(p-1,p-1)~='='then t[#t+1]=string.char(n%256) end\n"
        "end\n"
        "return table.concat(t)\n"
        "end\n"
        "local r=d64([[" + b64_blob + "]])\n"
        "local o={}\n"
        "for i=1,#r do\n"
        "o[i]=string.char((string.byte(r,i)-" + str(shift) + "+256)%256)\n"
        "end\n"
        "loadstring(table.concat(o))()\n"
    )
