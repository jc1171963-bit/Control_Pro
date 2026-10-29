"""SQL que no se expresa con el ORM: protección de la bitácora de auditoría y del kardex."""

SQL_INSTALAR = [
    """
    CREATE OR REPLACE FUNCTION cp_solo_insercion() RETURNS trigger AS $$
    BEGIN
        RAISE EXCEPTION 'La tabla % es de solo inserción: no se permiten UPDATE ni DELETE', TG_TABLE_NAME;
    END;
    $$ LANGUAGE plpgsql;
    """,
    "DROP TRIGGER IF EXISTS tr_auditoria_inmutable ON auditoria;",
    """
    CREATE TRIGGER tr_auditoria_inmutable BEFORE UPDATE OR DELETE ON auditoria
    FOR EACH ROW EXECUTE FUNCTION cp_solo_insercion();
    """,
    "DROP TRIGGER IF EXISTS tr_movimiento_inmutable ON movimiento_inventario;",
    """
    CREATE TRIGGER tr_movimiento_inmutable BEFORE UPDATE OR DELETE ON movimiento_inventario
    FOR EACH ROW EXECUTE FUNCTION cp_solo_insercion();
    """,
]

SQL_DESINSTALAR = [
    "DROP TRIGGER IF EXISTS tr_movimiento_inmutable ON movimiento_inventario;",
    "DROP TRIGGER IF EXISTS tr_auditoria_inmutable ON auditoria;",
    "DROP FUNCTION IF EXISTS cp_solo_insercion();",
]
