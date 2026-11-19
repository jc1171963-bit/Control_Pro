"""H1.3: el envío solo selecciona suscripciones cuya sesión sigue vigente y es del mismo dueño (tipo de cuenta e id).
La lista de `enviados` se llena dentro del webpush simulado: lo que no aparece ahí ni siquiera llegó a webpush."""
import uuid
from datetime import timedelta

import pytest
from sqlalchemy import delete, func, select

from app import models as modelos
from app.extensions import db
from app.models import Cliente, PushSuscripcion, SesionAuth, Usuario
from app.services import push_service

from .test_push import enviados  # noqa: F401  (fixture: webpush simulado y envío sin hilo)

CLAVES = {"p256dh": "B" + "x" * 86, "auth": "a" * 22}
UN_US = timedelta(microseconds=1)


@pytest.fixture()
def reloj(app, monkeypatch):
    """Instante fijo del envío: `_enviar` toma `ahora()` de app.models en cada lote."""
    t = modelos.ahora().replace(microsecond=0)
    monkeypatch.setattr(modelos, "ahora", lambda: t)
    return t


@pytest.fixture()
def ids(app):
    with app.app_context():
        u = lambda c: db.session.scalar(select(Usuario.id).where(Usuario.correo == c))  # noqa: E731
        c = lambda c: db.session.scalar(select(Cliente.id).where(Cliente.correo == c))  # noqa: E731
        return {"aprobador": u("aprobador@controlpro.mx"), "admin": u("admin@controlpro.mx"),
                "empresa": c("empresa@demo.mx"), "cliente": c("cliente@demo.mx")}


def _sesion(app, tipo, cuenta_id, t, **cambios):
    with app.app_context():
        s = SesionAuth(**{"id": uuid.uuid4(), "tipo_cuenta": tipo, "cuenta_id": cuenta_id, "gen": 1, "gen_emitida_en": t,
                          "expira_absoluta": t + timedelta(hours=1), "actividad_en": t, **cambios})
        db.session.add(s)
        db.session.commit()
        return s.id


def _sub(app, nombre, sid, usuario_id=None, cliente_id=None):
    endpoint = f"https://fcm.googleapis.com/fcm/send/{nombre}"
    with app.app_context():
        db.session.add(PushSuscripcion(endpoint=endpoint, usuario_id=usuario_id, cliente_id=cliente_id, sid=sid, **CLAVES))
        db.session.commit()
    return endpoint


def _avisar(app, usuarios=(), clientes=()):
    with app.app_context():
        push_service.encolar(usuario_ids=list(usuarios), cliente_ids=list(clientes), evento="pedido_aprobado:1",
                             mensaje="Se aprobó tu solicitud", enlace="/cuenta/solicitudes/1")
        db.session.execute(select(1))  # abre la transacción para que el commit dispare after_commit
        db.session.commit()


def _destinos(enviados):
    return {e for e, _ in enviados[0]}


def test_sesion_vigente_recibe(app, enviados, reloj, ids):
    e = _sub(app, "vigente", _sesion(app, "usuario", ids["aprobador"], reloj), usuario_id=ids["aprobador"])
    _avisar(app, usuarios=[ids["aprobador"]])
    assert _destinos(enviados) == {e}
    _, datos = enviados[0][0]  # payload genérico de H1.6 (el TTL lo comprueba el webpush simulado)
    assert datos == {"titulo": "LURIMA", "cuerpo": "Tienes un aviso nuevo. Abre LURIMA para verlo.",
                     "url": "/aprobador/notificaciones", "etiqueta": "lurima-aviso"}


def test_sin_sid_no_recibe(app, enviados, reloj, ids):
    _sub(app, "historica", None, cliente_id=ids["empresa"])
    _avisar(app, clientes=[ids["empresa"]])
    assert enviados[0] == []


def test_sesion_inexistente_no_valida(app, enviados, reloj, ids):
    # La FK impide un sid sin sesión: al borrar la sesión, la cascada se lleva la suscripción y no hay envío.
    sid = _sesion(app, "cliente", ids["empresa"], reloj)
    _sub(app, "sin-sesion", sid, cliente_id=ids["empresa"])
    with app.app_context():
        db.session.execute(delete(SesionAuth).where(SesionAuth.id == sid))
        db.session.commit()
        assert db.session.scalar(select(func.count()).select_from(PushSuscripcion)) == 0
    _avisar(app, clientes=[ids["empresa"]])
    assert enviados[0] == []


def test_sesion_revocada_no_recibe(app, enviados, reloj, ids):
    _sub(app, "revocada", _sesion(app, "cliente", ids["empresa"], reloj, revocada_en=reloj, motivo="cierre"),
         cliente_id=ids["empresa"])
    _avisar(app, clientes=[ids["empresa"]])
    assert enviados[0] == []


def test_frontera_de_expiracion_absoluta(app, enviados, reloj, ids):
    justo = _sub(app, "expira-justo", _sesion(app, "usuario", ids["aprobador"], reloj, expira_absoluta=reloj),
                 usuario_id=ids["aprobador"])
    _sub(app, "expirada", _sesion(app, "usuario", ids["aprobador"], reloj, expira_absoluta=reloj - UN_US),
         usuario_id=ids["aprobador"])
    _avisar(app, usuarios=[ids["aprobador"]])
    assert _destinos(enviados) == {justo}  # t == expira_absoluta todavía vale; un microsegundo después, no


def test_frontera_de_inactividad(app, enviados, reloj, ids):
    limite = timedelta(minutes=app.config["SESION_INACTIVIDAD_MIN"])
    justo = _sub(app, "inactiva-justo", _sesion(app, "cliente", ids["cliente"], reloj, actividad_en=reloj - limite),
                 cliente_id=ids["cliente"])
    _sub(app, "inactiva", _sesion(app, "cliente", ids["cliente"], reloj, actividad_en=reloj - limite - UN_US),
         cliente_id=ids["cliente"])
    _avisar(app, clientes=[ids["cliente"]])
    assert _destinos(enviados) == {justo}  # misma frontera que inactiva(): en el límite exacto, activa


def test_sesion_de_otro_usuario_no_valida(app, enviados, reloj, ids):
    _sub(app, "otro-usuario", _sesion(app, "usuario", ids["aprobador"], reloj), usuario_id=ids["admin"])
    _avisar(app, usuarios=[ids["admin"], ids["aprobador"]])
    assert enviados[0] == []


def test_sesion_de_otro_cliente_no_valida(app, enviados, reloj, ids):
    _sub(app, "otro-cliente", _sesion(app, "cliente", ids["cliente"], reloj), cliente_id=ids["empresa"])
    _avisar(app, clientes=[ids["empresa"], ids["cliente"]])
    assert enviados[0] == []


def test_sesion_de_usuario_no_valida_suscripcion_de_cliente(app, enviados, reloj, ids):
    # Mismo número de cuenta, distinto tipo: solo el tipo los distingue.
    _sub(app, "tipo-cruzado-1", _sesion(app, "usuario", ids["empresa"], reloj), cliente_id=ids["empresa"])
    _avisar(app, usuarios=[ids["empresa"]], clientes=[ids["empresa"]])
    assert enviados[0] == []


def test_sesion_de_cliente_no_valida_suscripcion_de_usuario(app, enviados, reloj, ids):
    _sub(app, "tipo-cruzado-2", _sesion(app, "cliente", ids["aprobador"], reloj), usuario_id=ids["aprobador"])
    _avisar(app, usuarios=[ids["aprobador"]], clientes=[ids["aprobador"]])
    assert enviados[0] == []


def test_valida_de_otro_dueno_no_se_selecciona(app, enviados, reloj, ids):
    mia = _sub(app, "mia", _sesion(app, "usuario", ids["aprobador"], reloj), usuario_id=ids["aprobador"])
    _sub(app, "ajena", _sesion(app, "usuario", ids["admin"], reloj), usuario_id=ids["admin"])
    _avisar(app, usuarios=[ids["aprobador"]])
    assert _destinos(enviados) == {mia}


def test_mezcla_envia_solo_a_las_validas_y_nada_si_ninguna_vale(app, enviados, reloj, ids):
    limite = timedelta(minutes=app.config["SESION_INACTIVIDAD_MIN"])
    validas = {_sub(app, "ok-1", _sesion(app, "cliente", ids["empresa"], reloj), cliente_id=ids["empresa"]),
               _sub(app, "ok-2", _sesion(app, "usuario", ids["aprobador"], reloj), usuario_id=ids["aprobador"])}
    _sub(app, "mal-1", None, cliente_id=ids["empresa"])
    _sub(app, "mal-2", _sesion(app, "cliente", ids["empresa"], reloj, revocada_en=reloj, motivo="admin"), cliente_id=ids["empresa"])
    _sub(app, "mal-3", _sesion(app, "usuario", ids["aprobador"], reloj, actividad_en=reloj - 2 * limite),
         usuario_id=ids["aprobador"])
    _avisar(app, usuarios=[ids["aprobador"]], clientes=[ids["empresa"]])
    assert _destinos(enviados) == validas
    enviados[0].clear()
    with app.app_context():
        db.session.execute(delete(PushSuscripcion).where(PushSuscripcion.endpoint.in_(validas)))
        db.session.commit()
    _avisar(app, usuarios=[ids["aprobador"]], clientes=[ids["empresa"]])
    assert enviados[0] == []  # ninguna válida: webpush no se llama


def test_errores_del_proveedor_y_limpieza_de_vencidas(app, enviados, reloj, ids):
    lista, codigos = enviados
    sid = _sesion(app, "cliente", ids["empresa"], reloj)
    falla, vencida, sana = (_sub(app, n, sid, cliente_id=ids["empresa"]) for n in ("falla-500", "vencida-410", "sana"))
    codigos[falla], codigos[vencida] = 500, 410
    _avisar(app, clientes=[ids["empresa"]])
    assert {e for e, _ in lista} == {falla, vencida, sana}  # un error no detiene a las demás
    with app.app_context():
        assert set(db.session.scalars(select(PushSuscripcion.endpoint))) == {falla, sana}  # solo 404/410 se borran


def test_el_envio_usa_su_propia_sesion_de_base(app, enviados, reloj, ids, monkeypatch):
    _sub(app, "contexto", _sesion(app, "usuario", ids["aprobador"], reloj), usuario_id=ids["aprobador"])
    import pywebpush
    previo, vistas = pywebpush.webpush, []

    def espia(*a, **kw):
        vistas.append(db.session())  # sesión activa dentro del envío
        return previo(*a, **kw)
    monkeypatch.setattr(pywebpush, "webpush", espia)
    with app.app_context():
        externa = db.session()
        push_service.encolar(usuario_ids=[ids["aprobador"]], evento="prueba", mensaje="x", enlace="/")
        db.session.execute(select(1))
        db.session.commit()
        assert vistas and vistas[0] is not externa  # otro contexto de aplicación, otra sesión
        assert db.session() is externa and db.session.scalar(select(1)) == 1  # la de origen sigue intacta y usable
