"""H-1: límites de reposición. Se repone solo lo afectado y no repuesto; al entregar, la reposición cubre primero el
faltante registrado y el resto es reemplazo, sin inflar `cantidad_entregada` ni dejar paquetes atascados (antes: 409
con la mercancía ya fuera del almacén). Casos S1, S2 y S3 del diagnóstico de la fase 3B.7."""
from sqlalchemy import text

from app.extensions import db
from .test_flujos import FIRMA
from .test_recepcion_reposicion import _bata_m, _entregado


def _pdet(app, pid):
    """(cantidad, cancelada, entregada) del artículo."""
    with app.app_context():
        return tuple(db.session.execute(text("select cantidad, cantidad_cancelada, cantidad_entregada from pedido_detalle "
                                             "where id = :i"), {"i": pid}).one())


def _paq(app, pid):
    with app.app_context():
        return db.session.execute(text("select estado from paquete where id = :i"), {"i": pid}).scalar()


def _inv(app, pdet_id):
    """(físico, comprometido) del artículo en el almacén que lo surtió."""
    with app.app_context():
        return tuple(db.session.execute(text(
            "select i.fisico, i.comprometido from inventario i join pedido_detalle pd on pd.variante_id = i.variante_id "
            "join asignacion_detalle ad on ad.pedido_detalle_id = pd.id join asignacion_surtido a on a.id = ad.asignacion_id "
            "where pd.id = :p and i.sucursal_id = a.sucursal_id"), {"p": pdet_id}).one())


def _mas_existencia(app, pdet_id, n):
    """Entrada de `n` piezas al almacén que surtió el artículo (con movimiento de kardex, como `fijar_existencia`)."""
    with app.app_context():
        from app.services import inventario_service as inv
        sid, vid = db.session.execute(text(
            "select a.sucursal_id, pd.variante_id from pedido_detalle pd join asignacion_detalle ad on ad.pedido_detalle_id = pd.id "
            "join asignacion_surtido a on a.id = ad.asignacion_id where pd.id = :p"), {"p": pdet_id}).one()
        inv.registrar_ajuste(sid, vid, n, "ajuste_positivo", "Preparación de prueba")


def _auditoria_entrega(app, paq_id):
    with app.app_context():
        return db.session.execute(text("select despues from auditoria where accion = 'paquete.entrega_reposicion' "
                                       "and entidad_id = :i order by id desc"), {"i": paq_id}).scalar()


def _invariante(app, pedido_id):
    with app.app_context():
        malas = db.session.execute(text("select id from pedido_detalle where pedido_id = :p and (cantidad_entregada < 0 "
                                        "or cantidad_cancelada + cantidad_entregada > cantidad)"), {"p": pedido_id}).all()
    assert malas == []


def _recepcion(emp, paq, a, buenas: dict[int, int]):
    """Recepción del paquete original: `buenas` = {asignacion_detalle_id: piezas en buen estado}; el resto completo."""
    partidas = []
    for d in a["detalles"]:
        n = buenas.get(d["id"], d["cantidad"])
        partidas.append({"pedido_detalle_id": d["pedido_detalle_id"], "recibida": n,
                         "problema": "faltante" if n < d["cantidad"] else None})
    det = emp.post(f"/api/cuenta/paquetes/{paq}/recepcion", {"completa": False, "partidas": partidas}).get_json()
    return next(i for i in det["incidencias"] if i["tipo"] == "diferencia_recepcion" and i["paquete_id"] == paq)


def _maxima(admin, inc_id):
    return {m["pedido_detalle_id"]: m["cantidad"] for m in admin.get(f"/api/admin/incidencias/{inc_id}").get_json()["reposicion_maxima"]}


def _preparar(admin, inc_id, partidas: dict[int, int]):
    return admin.post(f"/api/admin/incidencias/{inc_id}/reposicion",
                      {"partidas": [{"pedido_detalle_id": p, "cantidad": c} for p, c in partidas.items()]})


def _enviar(alm, rep_id, guia):
    assert alm.post(f"/api/admin/paquetes/{rep_id}/despachar", {"paqueteria": "Estafeta", "guia": f"REP-{guia}-0001"}).status_code == 200


def _entregar(alm, rep_id):
    return alm.post(f"/api/admin/paquetes/{rep_id}/eventos", {"estado": "entregado", "descripcion": "Recibió compras"})


def test_s1_no_se_repone_una_prenda_que_llego_bien(app, como):
    emp, alm, a, paq = _entregado(como)
    bm = _bata_m(a)
    inc = _recepcion(emp, paq, a, {bm["id"]: 0})
    otra = next(d for d in a["detalles"] if d["id"] != bm["id"])
    admin = como("admin")
    assert _maxima(admin, inc["id"]) == {bm["pedido_detalle_id"]: 1}  # solo lo afectado
    antes = _inv(app, otra["pedido_detalle_id"])
    r = _preparar(admin, inc["id"], {otra["pedido_detalle_id"]: 1})
    assert r.status_code == 400 and r.get_json()["error"]["codigo"] == "reposicion_excedida"
    assert "no tiene piezas pendientes de reponer" in r.get_json()["error"]["mensaje"]
    assert _inv(app, otra["pedido_detalle_id"]) == antes  # nada apartado: el rechazo llega antes de mover mercancía
    assert admin.get(f"/api/admin/incidencias/{inc['id']}").get_json()["reposiciones"] == []
    assert _pdet(app, otra["pedido_detalle_id"]) == (1, 0, 1)


def test_faltante_real_se_repone_y_se_recibe_completo(app, como):
    emp, alm, a, paq = _entregado(como)
    bm = _bata_m(a)
    pid = bm["pedido_detalle_id"]
    inc = _recepcion(emp, paq, a, {bm["id"]: 0})
    assert _pdet(app, pid) == (1, 0, 0)  # la recepción restó lo que no llegó
    admin = como("admin")
    fisico, comp = _inv(app, pid)
    r = _preparar(admin, inc["id"], {pid: 1})
    assert r.status_code == 201
    rep = r.get_json()["reposiciones"][0]["id"]
    assert _inv(app, pid) == (fisico, comp + 1)  # apartada al preparar
    assert _maxima(admin, inc["id"]) == {}
    _enviar(alm, rep, "F")
    assert _inv(app, pid) == (fisico - 1, comp)  # sale al despachar, una sola vez
    assert _entregar(alm, rep).status_code == 200
    assert _pdet(app, pid) == (1, 0, 1) and _paq(app, rep) == "entregado"
    assert _inv(app, pid) == (fisico - 1, comp)  # la entrega no vuelve a descontar
    assert _auditoria_entrega(app, rep)["partidas"] == [{"pedido_detalle_id": pid, "cubre_faltante": 1, "reemplazo": 0}]
    det = emp.post(f"/api/cuenta/paquetes/{rep}/recepcion", {"completa": True}).get_json()
    assert next(i for i in det["incidencias"] if i["id"] == inc["id"])["estado"] == "resuelta"
    assert _pdet(app, pid) == (1, 0, 1)
    _invariante(app, a["pedido_id"])


def test_s2_dos_reposiciones_del_mismo_faltante(app, como):
    emp, alm, a, paq = _entregado(como)
    bm = _bata_m(a)
    pid = bm["pedido_detalle_id"]
    inc = _recepcion(emp, paq, a, {bm["id"]: 0})
    admin = como("admin")
    assert _preparar(admin, inc["id"], {pid: 1}).status_code == 201
    comp = _inv(app, pid)[1]
    r = _preparar(admin, inc["id"], {pid: 1})
    assert r.status_code == 400 and r.get_json()["error"]["codigo"] == "reposicion_excedida"
    assert _inv(app, pid)[1] == comp  # no se apartó dos veces
    reps = admin.get(f"/api/admin/incidencias/{inc['id']}").get_json()["reposiciones"]
    assert len(reps) == 1
    _enviar(alm, reps[0]["id"], "S2")
    assert _entregar(alm, reps[0]["id"]).status_code == 200
    assert _pdet(app, pid) == (1, 0, 1)


def test_s3_reemplazo_de_pieza_danada_tras_entrega_completa(app, como):
    emp, alm, a, paq = _entregado(como)
    det = emp.post(f"/api/cuenta/paquetes/{paq}/recepcion", {"completa": True}).get_json()
    bm = _bata_m(a)
    pid = bm["pedido_detalle_id"]
    ent = next(e for e in det["entregas_individuales"] if e["empleado"]["nombre"] == "Rosario Ramírez")
    assert emp.post(f"/api/cuenta/entregas/{ent['id']}", {"firma": FIRMA, "registrado_por": "Laura Compras"}).status_code == 200
    assert emp.post(f"/api/cuenta/entregas/{ent['id']}/conformidad",
                    {"valoracion": 2, "problema": "danado", "comentario": "Costura abierta", "pedido_detalle_id": pid}).status_code == 200
    assert _pdet(app, pid) == (1, 0, 1)
    admin = como("admin")
    inc = next(i for i in admin.get("/api/admin/incidencias").get_json()["items"]
               if i["tipo"] == "conformidad_danado" and i["pedido_id"] == a["pedido_id"])
    assert inc["reposicion_maxima"] == [{"pedido_detalle_id": pid, "cantidad": 1}]
    assert inc["reposicion_sugerida"] == [{"pedido_detalle_id": pid, "cantidad": 1}]
    r = _preparar(admin, inc["id"], {pid: 1})
    assert r.status_code == 201
    rep = r.get_json()["reposiciones"][0]["id"]
    _enviar(alm, rep, "S3")
    assert _entregar(alm, rep).status_code == 200  # antes: 409 y el paquete atascado en «despachado»
    assert _paq(app, rep) == "entregado"
    assert _pdet(app, pid) == (1, 0, 1)  # reemplazo: no infla lo entregado
    assert _auditoria_entrega(app, rep)["partidas"] == [{"pedido_detalle_id": pid, "cubre_faltante": 0, "reemplazo": 1}]
    det = emp.get(f"/api/cuenta/pedidos/{a['pedido_id']}").get_json()
    assert det["estado"] == "entregado"
    nueva = [e for e in det["entregas_individuales"] if e["paquete_id"] == rep]  # el empleado recibe su pieza nueva
    assert len(nueva) == 1 and nueva[0]["empleado"]["nombre"] == "Rosario Ramírez"
    # Si el reemplazo no llega, la recepción resta el reemplazo, no la pieza que la sucursal ya tenía
    det = emp.post(f"/api/cuenta/paquetes/{rep}/recepcion", {"completa": False, "partidas": [
        {"pedido_detalle_id": pid, "recibida": 0, "problema": "faltante"}]}).get_json()
    assert _pdet(app, pid) == (1, 0, 1)
    nueva_inc = next(i for i in det["incidencias"] if i["paquete_id"] == rep)
    assert _maxima(admin, nueva_inc["id"]) == {pid: 1} and _maxima(admin, inc["id"]) == {}  # R2
    _invariante(app, a["pedido_id"])


def test_entrega_parcial_y_reposiciones_por_partes(app, como):
    """4 batas M; llega 1: faltan 3. Se reponen 2 + 1; una tercera se rechaza. Al final, 4 entregadas."""
    emp, alm, a, paq = _entregado(como, bata_m=4)
    bm = _bata_m(a)
    pid = bm["pedido_detalle_id"]
    inc = _recepcion(emp, paq, a, {bm["id"]: 1})
    assert _pdet(app, pid) == (4, 0, 1)
    admin = como("admin")
    assert _maxima(admin, inc["id"]) == {pid: 3}
    r = _preparar(admin, inc["id"], {pid: 4})
    assert r.status_code == 400 and "como máximo 3" in r.get_json()["error"]["mensaje"]
    rep1 = _preparar(admin, inc["id"], {pid: 2}).get_json()["reposiciones"][-1]["id"]
    assert _maxima(admin, inc["id"]) == {pid: 1}
    assert _preparar(admin, inc["id"], {pid: 2}).status_code == 400
    rep2 = _preparar(admin, inc["id"], {pid: 1}).get_json()["reposiciones"][-1]["id"]
    assert _maxima(admin, inc["id"]) == {}
    for rep, g in ((rep1, "P1"), (rep2, "P2")):
        _enviar(alm, rep, g)
        assert _entregar(alm, rep).status_code == 200
    assert _pdet(app, pid) == (4, 0, 4)
    _invariante(app, a["pedido_id"])


def test_reposicion_recibida_parcialmente_se_completa_desde_la_incidencia_nueva(app, como):
    emp, alm, a, paq = _entregado(como, bata_m=4)
    bm = _bata_m(a)
    pid = bm["pedido_detalle_id"]
    inc = _recepcion(emp, paq, a, {bm["id"]: 1})
    admin = como("admin")
    rep = _preparar(admin, inc["id"], {pid: 3}).get_json()["reposiciones"][0]["id"]
    _enviar(alm, rep, "RP")
    assert _entregar(alm, rep).status_code == 200
    assert _pdet(app, pid) == (4, 0, 4)
    det = emp.post(f"/api/cuenta/paquetes/{rep}/recepcion", {"completa": False, "partidas": [
        {"pedido_detalle_id": pid, "recibida": 1, "problema": "faltante"}]}).get_json()
    assert _pdet(app, pid) == (4, 0, 2)  # llegaron 1 + 1 en buen estado
    nueva = next(i for i in det["incidencias"] if i["paquete_id"] == rep)
    assert nueva["reposicion_de"]["id"] == inc["id"]
    assert _maxima(admin, inc["id"]) == {}  # R2: la original ya no vuelve a reponer esas piezas
    assert _preparar(admin, inc["id"], {pid: 1}).status_code == 400
    assert _maxima(admin, nueva["id"]) == {pid: 2}
    _mas_existencia(app, pid, 2)  # el almacén ya entregó 4 + 3 batas M: sin esta entrada no hay existencia
    r = _preparar(admin, nueva["id"], {pid: 2})
    assert r.status_code == 201, r.get_json()
    rep_j = r.get_json()["reposiciones"][0]["id"]
    _enviar(alm, rep_j, "RJ")
    assert _entregar(alm, rep_j).status_code == 200
    assert _pdet(app, pid) == (4, 0, 4)
    _invariante(app, a["pedido_id"])


def test_varios_articulos_en_una_reposicion(app, como):
    emp, alm, a, paq = _entregado(como)
    rosario = [d for d in a["detalles"] if d["empleado"] == "Rosario Ramírez"]
    inc = _recepcion(emp, paq, a, {d["id"]: 0 for d in rosario})
    admin = como("admin")
    pids = {d["pedido_detalle_id"]: 1 for d in rosario}
    assert _maxima(admin, inc["id"]) == pids
    r = _preparar(admin, inc["id"], pids)
    assert r.status_code == 201
    [rep] = r.get_json()["reposiciones"]
    assert {c["pedido_detalle_id"] for c in rep["contenido"]} == set(pids)
    _enviar(alm, rep["id"], "VA")
    assert _entregar(alm, rep["id"]).status_code == 200
    assert all(_pdet(app, p) == (1, 0, 1) for p in pids)
    _invariante(app, a["pedido_id"])


def test_cancelada_libera_y_despachada_no(app, como):
    emp, alm, a, paq = _entregado(como)
    bm = _bata_m(a)
    pid = bm["pedido_detalle_id"]
    inc = _recepcion(emp, paq, a, {bm["id"]: 0})
    admin = como("admin")
    inicial = _inv(app, pid)
    rep = _preparar(admin, inc["id"], {pid: 1}).get_json()["reposiciones"][0]["id"]
    assert admin.post(f"/api/admin/paquetes/{rep}/cancelar-reposicion").status_code == 200
    assert _inv(app, pid) == inicial and _maxima(admin, inc["id"]) == {pid: 1}  # libera inventario y cupo
    rep = _preparar(admin, inc["id"], {pid: 1}).get_json()["reposiciones"][-1]["id"]
    _enviar(alm, rep, "CD")
    assert admin.post(f"/api/admin/paquetes/{rep}/cancelar-reposicion").status_code == 409
    assert _inv(app, pid) == (inicial[0] - 1, inicial[1])  # salió: no se libera lo que ya no está
    assert _maxima(admin, inc["id"]) == {} and _paq(app, rep) == "despachado"


def test_faltante_al_surtir_no_es_elegible(app, como):
    from .test_empaque_por_persona import _solicitud
    emp, alm, a = _solicitud(como)
    bm = _bata_m(a)
    partidas = [{"asignacion_detalle_id": d["id"], "surtida": 0 if d["id"] == bm["id"] else d["cantidad"],
                 "faltante": 1 if d["id"] == bm["id"] else 0, "motivo_faltante": "Sin existencia en anaquel"} for d in a["detalles"]]
    assert alm.post(f"/api/admin/surtido/{a['id']}/registrar", {"partidas": partidas}).status_code == 200
    assert _pdet(app, bm["pedido_detalle_id"]) == (1, 1, 0)
    admin = como("admin")
    falt = next(i for i in admin.get("/api/admin/incidencias").get_json()["items"]
                if i["tipo"] == "faltante_surtido" and i["pedido_id"] == a["pedido_id"])
    assert falt["reposicion_maxima"] == [] and falt["reposicion_sugerida"] == []
    assert _preparar(admin, falt["id"], {bm["pedido_detalle_id"]: 1}).status_code == 400
    # Tampoco desde otra incidencia de la solicitud que no señale artículo: la pieza cancelada queda fuera
    otra = emp.post(f"/api/cuenta/pedidos/{a['pedido_id']}/incidencias", {"tipo": "otro", "descripcion": "Revisar el pedido."}).get_json()
    maxima = _maxima(admin, otra["id"])
    assert bm["pedido_detalle_id"] not in maxima and maxima
    assert _preparar(admin, otra["id"], {bm["pedido_detalle_id"]: 1}).status_code == 400


def test_reintentos_de_entrega_y_recepcion_no_duplican(app, como):
    emp, alm, a, paq = _entregado(como)
    bm = _bata_m(a)
    pid = bm["pedido_detalle_id"]
    inc = _recepcion(emp, paq, a, {bm["id"]: 0})
    admin = como("admin")
    rep = _preparar(admin, inc["id"], {pid: 1}).get_json()["reposiciones"][0]["id"]
    _enviar(alm, rep, "RE")
    assert _entregar(alm, rep).status_code == 200
    assert _entregar(alm, rep).status_code == 409
    assert _pdet(app, pid) == (1, 0, 1)
    assert emp.post(f"/api/cuenta/paquetes/{rep}/recepcion", {"completa": True}).status_code == 201
    assert emp.post(f"/api/cuenta/paquetes/{rep}/recepcion", {"completa": True}).status_code == 409
    assert _pdet(app, pid) == (1, 0, 1)


def test_envio_perdido_repuesto_y_luego_encontrado(app, como):
    """El original se reporta perdido, se repone entero y después aparece: entregarlo no rompe el tope (antes: 409)."""
    from .test_empaque_por_persona import _solicitud
    emp, alm, a = _solicitud(como)
    alm.post(f"/api/admin/surtido/{a['id']}/registrar",
             {"partidas": [{"asignacion_detalle_id": d["id"], "surtida": d["cantidad"]} for d in a["detalles"]]})
    paq = alm.post(f"/api/admin/surtido/{a['id']}/paquetes",
                   {"partidas": [{"asignacion_detalle_id": d["id"], "cantidad": d["cantidad"]} for d in a["detalles"]]}
                   ).get_json()["paquetes"][0]["id"]
    _enviar(alm, paq, "ORI")
    assert alm.post(f"/api/admin/paquetes/{paq}/eventos", {"estado": "incidencia", "descripcion": "La paquetería lo extravió"}).status_code == 200
    admin = como("admin")
    inc = next(i for i in admin.get("/api/admin/incidencias").get_json()["items"]
               if i["tipo"] == "incidencia_envio" and i["paquete_id"] == paq)
    contenido = {d["pedido_detalle_id"]: d["cantidad"] for d in a["detalles"]}
    assert _maxima(admin, inc["id"]) == contenido
    rep = _preparar(admin, inc["id"], contenido).get_json()["reposiciones"][0]["id"]
    _enviar(alm, rep, "PER")
    assert _entregar(alm, rep).status_code == 200
    assert all(_pdet(app, p) == (1, 0, 1) for p in contenido)
    assert _entregar(alm, paq).status_code == 200  # el original apareció
    assert all(_pdet(app, p) == (1, 0, 1) for p in contenido)
    assert all(x["reemplazo"] == 1 for x in _auditoria_entrega(app, paq)["partidas"])
    _invariante(app, a["pedido_id"])
