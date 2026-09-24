import json
import os
import secrets
import shutil
import time
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path

from fastapi import Depends, FastAPI, Header, HTTPException, Request
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, PlainTextResponse
from pydantic import BaseModel

app = FastAPI(title="Catálogo de Tutores", version="1.2.0")

BASE_DIR = Path(__file__).parent
SEED_FILE = BASE_DIR / "tutores.json"
DATA_DIR = BASE_DIR / "data"
TUTORES_FILE = DATA_DIR / "tutores.json"
STATS_FILE = DATA_DIR / "stats.json"
SUGGESTIONS_FILE = DATA_DIR / "sugerencias.json"
VISITAS_LOG_FILE = DATA_DIR / "visitas_log.json"
MAX_EVENTOS = 20000

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


def _campo(bloque: dict, clave: str, lang: str) -> object:
    """Devuelve el valor traducido (clave_en) si el idioma lo pide y existe."""
    if lang == "en":
        return bloque.get(f"{clave}_en", bloque.get(clave))
    return bloque.get(clave)


def _traducir_tutor(t: dict, lang: str) -> dict:
    """Copia el tutor aplicando los campos * _en como traducción al inglés.
    Las claves de salida son las mismas para que el frontend no cambie."""
    out = dict(t)
    out["tema"] = _campo(t, "tema", lang) or t.get("tema", "")
    out["descripcion"] = _campo(t, "descripcion", lang) or t.get("descripcion", "")
    bloques = []
    for b in t.get("bloques", []) or []:
        nb = dict(b)
        nb["nombre"] = _campo(b, "nombre", lang) or b.get("nombre", "")
        nb["objetivos"] = _campo(b, "objetivos", lang) or b.get("objetivos", [])
        nb["prompt"] = _campo(b, "prompt", lang) or b.get("prompt", "")
        bloques.append(nb)
    out["bloques"] = bloques
    return out


def _leer_json(ruta: Path, vacio: object) -> object:
    """Lee un JSON simple del volumen con salvaguardas."""
    try:
        if not ruta.exists():
            return vacio
        data = json.loads(ruta.read_text(encoding="utf-8"))
    except Exception:
        return vacio
    return data if isinstance(data, dict) else vacio


def _guardar_json(ruta: Path, data: dict) -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    tmp = ruta.with_suffix(".tmp")
    tmp.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    os.replace(tmp, ruta)


def _cargar_stats() -> dict:
    return _leer_json(STATS_FILE, {"tutores": {}})


def _guardar_stats(stats: dict) -> None:
    _guardar_json(STATS_FILE, stats)


def _cargar_sugerencias() -> list:
    data = _leer_json(SUGGESTIONS_FILE, {"sugerencias": []})
    sug = data.get("sugerencias", []) if isinstance(data, dict) else []
    return sug if isinstance(sug, list) else []


def _guardar_sugerencias(sugerencias: list) -> None:
    _guardar_json(SUGGESTIONS_FILE, {"sugerencias": sugerencias})


def _cargar_visitas() -> list:
    data = _leer_json(VISITAS_LOG_FILE, {"eventos": []})
    eventos = data.get("eventos", []) if isinstance(data, dict) else []
    return eventos if isinstance(eventos, list) else []


def _guardar_visitas(eventos: list) -> None:
    _guardar_json(VISITAS_LOG_FILE, {"eventos": eventos})


def _registrar_evento(tipo: str, tutor_id: str, bloque_id: str | None = None) -> None:
    eventos = _cargar_visitas()
    eventos.append({
        "tipo": tipo,
        "tutor_id": tutor_id,
        "bloque_id": bloque_id,
        "fecha": datetime.now(timezone.utc).isoformat(),
    })
    if len(eventos) > MAX_EVENTOS:
        eventos = eventos[-MAX_EVENTOS:]
    _guardar_visitas(eventos)


class LoginBody(BaseModel):
    password: str


class SugerenciaBody(BaseModel):
    contenido: str
    tutor_id: str | None = None
    lang: str = "es"


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
async def listar_tutores(lang: str = "es"):
    tutores = _cargar_tutores()
    resumen = []
    for t in tutores:
        tt = _traducir_tutor(t, lang)
        resumen.append({
            "id": tt.get("id"),
            "tema": tt.get("tema", ""),
            "descripcion": tt.get("descripcion", ""),
            "color": tt.get("color", "#2557a7"),
            "num_bloques": len(tt.get("bloques", [])),
        })
    return {"tutores": resumen}


@app.get("/api/tutores/{tutor_id}")
async def obtener_tutor(tutor_id: str, lang: str = "es"):
    for t in _cargar_tutores():
        if t.get("id") == tutor_id:
            return _traducir_tutor(t, lang)
    raise HTTPException(404, "Tutor no encontrado")


def _bloque_existe(tutor_id: str, bloque_id: str) -> bool:
    for t in _cargar_tutores():
        if t.get("id") != tutor_id:
            continue
        for b in t.get("bloques", []) or []:
            if str(b.get("id")) == str(bloque_id):
                return True
    return False


@app.post("/api/tutores/{tutor_id}/visita", status_code=204)
async def registrar_visita(tutor_id: str) -> None:
    if not any(t.get("id") == tutor_id for t in _cargar_tutores()):
        raise HTTPException(404, "Tutor no encontrado")
    stats = _cargar_stats()
    tutores = stats.setdefault("tutores", {})
    t = tutores.setdefault(tutor_id, {"visitas": 0, "bloques": {}})
    t["visitas"] = t.get("visitas", 0) + 1
    _guardar_stats(stats)
    _registrar_evento("tutor", tutor_id)


@app.post("/api/tutores/{tutor_id}/bloques/{bloque_id}/visita", status_code=204)
async def registrar_visita_bloque(tutor_id: str, bloque_id: str) -> None:
    if not _bloque_existe(tutor_id, bloque_id):
        raise HTTPException(404, "Bloque no encontrado")
    stats = _cargar_stats()
    tutores = stats.setdefault("tutores", {})
    t = tutores.setdefault(tutor_id, {"visitas": 0, "bloques": {}})
    bloques = t.setdefault("bloques", {})
    bloques[str(bloque_id)] = bloques.get(str(bloque_id), 0) + 1
    _guardar_stats(stats)
    _registrar_evento("bloque", tutor_id, str(bloque_id))


@app.post("/api/sugerencias", status_code=204)
async def enviar_sugerencia(body: SugerenciaBody) -> None:
    contenido = (body.contenido or "").strip()
    if not contenido:
        raise HTTPException(400, "La sugerencia no puede estar vacía")
    if len(contenido) > 3000:
        raise HTTPException(400, "La sugerencia debe tener menos de 3000 caracteres")
    sugerencias = _cargar_sugerencias()
    sugerencias.append({
        "id": uuid.uuid4().hex[:12],
        "fecha": datetime.now(timezone.utc).isoformat(),
        "contenido": contenido,
        "tutor_id": body.tutor_id,
        "lang": body.lang,
    })
    _guardar_sugerencias(sugerencias)


@app.get("/admin/api/stats")
async def admin_estadisticas(_t: str = Depends(_revisar_token)):
    return _cargar_stats()


@app.get("/admin/api/stats/timeline")
async def admin_timeline(horas: int = 24, tutor_id: str | None = None,
                         _t: str = Depends(_revisar_token)):
    """Series por tramos de una hora para las gráficas del admin."""
    horas = max(1, min(horas, 24 * 15))
    eventos = _cargar_visitas()
    if tutor_id:
        eventos = [e for e in eventos if e.get("tutor_id") == tutor_id]
    ahora = datetime.now(timezone.utc).replace(minute=0, second=0, microsecond=0)
    buckets: dict[int, dict] = {}
    for e in eventos:
        try:
            ts = datetime.fromisoformat(e.get("fecha", ""))
        except (TypeError, ValueError):
            continue
        ts = ts.replace(minute=0, second=0, microsecond=0)
        idx = int((ahora - ts).total_seconds() // 3600)
        if 0 <= idx < horas:
            b = buckets.setdefault(idx, {"tutor": 0, "bloque": 0})
            b["tutor" if e.get("tipo") == "tutor" else "bloque"] += 1
    etiquetas = []
    visitas_tutor = []
    visitas_bloque = []
    total = []
    acc_tutor = 0
    acc_bloque = 0
    for i in range(horas - 1, -1, -1):
        h = ahora - timedelta(hours=i)
        etiquetas.append(h.strftime("%Y-%m-%dT%H:00"))
        b = buckets.get(i, {"tutor": 0, "bloque": 0})
        acc_tutor += b["tutor"]
        acc_bloque += b["bloque"]
        visitas_tutor.append(acc_tutor)
        visitas_bloque.append(acc_bloque)
        total.append(acc_tutor + acc_bloque)
    return {
        "etiquetas": etiquetas,
        "visitas_tutor": visitas_tutor,
        "visitas_bloque": visitas_bloque,
        "total": total,
    }


@app.delete("/admin/api/stats", status_code=204)
async def admin_reiniciar_stats(_t: str = Depends(_revisar_token)) -> None:
    _guardar_stats({"tutores": {}})
    _guardar_visitas([])


@app.get("/admin/api/sugerencias")
async def admin_listar_sugerencias(_t: str = Depends(_revisar_token)):
    return {"sugerencias": _cargar_sugerencias()}


@app.delete("/admin/api/sugerencias/{sug_id}", status_code=204)
async def admin_borrar_sugerencia(sug_id: str, _t: str = Depends(_revisar_token)) -> None:
    sugerencias = _cargar_sugerencias()
    restantes = [s for s in sugerencias if s.get("id") != sug_id]
    if len(restantes) == len(sugerencias):
        raise HTTPException(404, "Sugerencia no encontrada")
    _guardar_sugerencias(restantes)


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