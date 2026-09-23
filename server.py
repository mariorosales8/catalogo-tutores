import json
import os
import secrets
import shutil
import time
from pathlib import Path

from fastapi import Depends, FastAPI, Header, HTTPException, Request
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, PlainTextResponse
from pydantic import BaseModel

app = FastAPI(title="Catálogo de Tutores", version="1.1.0")

BASE_DIR = Path(__file__).parent
SEED_FILE = BASE_DIR / "tutores.json"
DATA_DIR = BASE_DIR / "data"
TUTORES_FILE = DATA_DIR / "tutores.json"

ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD", "")
TOKEN_TTL = 12 * 3600  # 12 horas
_tokens: dict[str, float] = {}


def _garantizar_datos() -> None:
    """Si no hay data/tutores.json, lo crea copiando el seed del repositorio
    (o con un catálogo vacío si falta). El panel y el volumen escriben ahí."""
    if TUTORES_FILE.exists():
        return
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    if SEED_FILE.exists():
        shutil.copy2(SEED_FILE, TUTORES_FILE)
    else:
        TUTORES_FILE.write_text('{"tutores": []}', encoding="utf-8")


def _cargar_tutores() -> list:
    """Lee tutores.json en cada petición para que los cambios del dueño
    aparezcan sin reiniciar el servidor."""
    _garantizar_datos()
    try:
        data = json.loads(TUTORES_FILE.read_text(encoding="utf-8"))
    except Exception:
        return []
    tutores = data.get("tutores", data) if isinstance(data, dict) else data
    if not isinstance(tutores, list):
        return []
    return tutores


class LoginBody(BaseModel):
    password: str


def _revisar_token(authorization: str = Header(default="")) -> str:
    if not ADMIN_PASSWORD:
        raise HTTPException(503, "Panel de administración deshabilitado")
    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer" or not token:
        raise HTTPException(401, "Se requiere token")
    expira = _tokens.get(token)
    if not expira:
        raise HTTPException(401, "Token inválido")
    if time.time() > expira:
        _tokens.pop(token, None)
        raise HTTPException(401, "Token expirado")
    return token


@app.post("/admin/login")
async def admin_login(body: LoginBody):
    if not ADMIN_PASSWORD:
        raise HTTPException(503, "Panel de administración deshabilitado")
    if not secrets.compare_digest(body.password, ADMIN_PASSWORD):
        raise HTTPException(401, "Contraseña incorrecta")
    token = secrets.token_urlsafe(32)
    _tokens[token] = time.time() + TOKEN_TTL
    return {"token": token}


@app.get("/admin/api/tutores")
async def admin_obtener(_t: str = Depends(_revisar_token)) -> PlainTextResponse:
    _garantizar_datos()
    return PlainTextResponse(
        TUTORES_FILE.read_text(encoding="utf-8"),
        media_type="application/json",
    )


@app.post("/admin/api/tutores", status_code=204)
async def admin_guardar(request: Request, _t: str = Depends(_revisar_token)) -> None:
    raw = (await request.body()).decode("utf-8")
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        raise HTTPException(400, "JSON inválido")
    if not isinstance(data, dict) or "tutores" not in data:
        raise HTTPException(400, 'El JSON debe contener la clave "tutores"')
    if not isinstance(data["tutores"], list):
        raise HTTPException(400, '"tutores" debe ser una lista')
    tmp = TUTORES_FILE.with_suffix(".tmp")
    tmp.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    os.replace(tmp, TUTORES_FILE)


@app.get("/api/tutores")
async def listar_tutores():
    tutores = _cargar_tutores()
    # Lista resumida para el menú (sin el detalle de bloques/prompts pesados).
    resumen = []
    for t in tutores:
        resumen.append({
            "id": t.get("id"),
            "tema": t.get("tema", ""),
            "descripcion": t.get("descripcion", ""),
            "color": t.get("color", "#2557a7"),
            "num_bloques": len(t.get("bloques", [])),
        })
    return {"tutores": resumen}


@app.get("/api/tutores/{tutor_id}")
async def obtener_tutor(tutor_id: str):
    for t in _cargar_tutores():
        if t.get("id") == tutor_id:
            return t
    raise HTTPException(404, "Tutor no encontrado")


@app.get("/health")
async def health():
    return {"status": "ok"}


app.mount("/static", StaticFiles(directory=BASE_DIR / "static"), name="static")


@app.get("/admin")
async def admin():
    return FileResponse(BASE_DIR / "static" / "admin.html")


@app.get("/")
async def index():
    return FileResponse(BASE_DIR / "static" / "index.html")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001)