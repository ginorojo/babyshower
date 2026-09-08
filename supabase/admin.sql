-- ============================================================================
--  PANEL DE CONTROL - PERMISOS DE ADMINISTRADOR
-- ============================================================================
--  Ejecutar DESPUÉS de setup.sql, en el SQL Editor de Supabase.
--
--  A diferencia de setup.sql, este script NO borra nada: se puede volver a
--  ejecutar cuando quieras sin perder reservas ni regalos.
--
--  Antes de correrlo, crea tu usuario en el panel de Supabase:
--    Authentication → Users → Add user → email + contraseña
--    (marca "Auto Confirm User" para no tener que confirmar por correo)
--
--  Después, al final de este archivo, pon tu correo donde dice TU_CORREO.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. QUIÉN ES ADMINISTRADOR
-- ----------------------------------------------------------------------------
--  Ojo: en Supabase cualquiera puede registrarse con la clave pública. Por eso
--  NO basta con "estar logueado" para entrar al panel: hay que estar en esta
--  tabla. Solo tú puedes agregar filas aquí, desde el SQL Editor.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS admins (
  user_id    UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email      TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Con RLS activo y sin políticas, nadie puede leer ni escribir esta tabla desde
-- el navegador. Solo la función es_admin() la consulta, por dentro.
ALTER TABLE admins ENABLE ROW LEVEL SECURITY;


-- ----------------------------------------------------------------------------
-- 2. FUNCIÓN AUXILIAR: ¿EL USUARIO ACTUAL ES ADMIN?
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION es_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM admins WHERE user_id = auth.uid());
$$;

REVOKE ALL     ON FUNCTION es_admin() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION es_admin() TO anon, authenticated;


-- ----------------------------------------------------------------------------
-- 3. PERMISOS
-- ----------------------------------------------------------------------------
--  Los invitados (rol anon) siguen igual que antes: solo leen el catálogo.
--  Estas políticas agregan permisos únicamente para los admins.
-- ----------------------------------------------------------------------------

-- Los admins pueden crear, editar y ver todos los regalos.
DROP POLICY IF EXISTS "Admins gestionan regalos" ON regalos;
CREATE POLICY "Admins gestionan regalos"
  ON regalos FOR ALL TO authenticated
  USING (es_admin())
  WITH CHECK (es_admin());

-- Los admins pueden ver las reservas (los invitados no).
DROP POLICY IF EXISTS "Admins leen reservas" ON reservas;
CREATE POLICY "Admins leen reservas"
  ON reservas FOR SELECT TO authenticated
  USING (es_admin());


-- ----------------------------------------------------------------------------
-- 4. GUARDAR CAMBIOS DE UN REGALO
-- ----------------------------------------------------------------------------
--  Cambiar la cantidad total tiene una trampa: hay que respetar lo que ya
--  reservaron. Esta función recalcula sola cuánto queda disponible y no deja
--  bajar el total por debajo de lo ya reservado.
--
--  Devuelve: { "ok": true }
--            { "ok": false, "motivo": "no_autorizado" | "no_existe"
--                         | "nombre_vacio" | "menor_que_reservado", ... }
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION admin_guardar_regalo(
  p_id             UUID,
  p_nombre         TEXT,
  p_categoria      TEXT,
  p_cantidad_total INT
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_fila      regalos%ROWTYPE;
  v_reservado INT;
BEGIN
  IF NOT es_admin() THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'no_autorizado');
  END IF;

  IF COALESCE(BTRIM(p_nombre), '') = '' OR COALESCE(BTRIM(p_categoria), '') = '' THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'nombre_vacio');
  END IF;

  IF p_cantidad_total IS NULL OR p_cantidad_total < 0 THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'cantidad_invalida');
  END IF;

  SELECT * INTO v_fila FROM regalos WHERE id = p_id FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'no_existe');
  END IF;

  v_reservado := v_fila.cantidad_total - v_fila.cantidad_disponible;

  -- No se puede dejar el total por debajo de lo que ya regalaron.
  IF p_cantidad_total < v_reservado THEN
    RETURN jsonb_build_object(
      'ok', false, 'motivo', 'menor_que_reservado', 'reservado', v_reservado);
  END IF;

  UPDATE regalos
     SET nombre              = BTRIM(p_nombre),
         categoria           = BTRIM(p_categoria),
         cantidad_total      = p_cantidad_total,
         cantidad_disponible = p_cantidad_total - v_reservado
   WHERE id = p_id;

  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL     ON FUNCTION admin_guardar_regalo(UUID, TEXT, TEXT, INT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION admin_guardar_regalo(UUID, TEXT, TEXT, INT) TO authenticated;


-- ----------------------------------------------------------------------------
-- 5. AGREGAR UN REGALO NUEVO
-- ----------------------------------------------------------------------------
--  Lo coloca al final de su categoría. Si la categoría no existía todavía,
--  la deja al final de toda la lista.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION admin_crear_regalo(
  p_nombre         TEXT,
  p_categoria      TEXT,
  p_cantidad_total INT
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_orden INT;
  v_id    UUID;
BEGIN
  IF NOT es_admin() THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'no_autorizado');
  END IF;

  IF COALESCE(BTRIM(p_nombre), '') = '' OR COALESCE(BTRIM(p_categoria), '') = '' THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'nombre_vacio');
  END IF;

  IF p_cantidad_total IS NULL OR p_cantidad_total < 1 THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'cantidad_invalida');
  END IF;

  SELECT MAX(orden) INTO v_orden
    FROM regalos WHERE categoria = BTRIM(p_categoria);

  IF v_orden IS NULL THEN
    -- Categoría nueva: la mandamos al final de todo.
    SELECT COALESCE(MAX(orden), 0) + 10 INTO v_orden FROM regalos;
  ELSE
    v_orden := v_orden + 1;
  END IF;

  INSERT INTO regalos (nombre, categoria, orden, cantidad_total, cantidad_disponible)
  VALUES (BTRIM(p_nombre), BTRIM(p_categoria), v_orden, p_cantidad_total, p_cantidad_total)
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('ok', true, 'id', v_id);
END;
$$;

REVOKE ALL     ON FUNCTION admin_crear_regalo(TEXT, TEXT, INT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION admin_crear_regalo(TEXT, TEXT, INT) TO authenticated;


-- ----------------------------------------------------------------------------
-- 6. CANCELAR RESERVAS
-- ----------------------------------------------------------------------------
--  Al borrar la fila, el disparador trg_devolver_stock (definido en setup.sql)
--  devuelve solo las unidades al regalo. No hay que tocar el stock a mano.
--
--  Hay dos versiones: cancelar un regalo suelto, o todo lo que una persona
--  confirmó de una vez (el grupo completo).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION admin_cancelar_reserva(p_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cantidad INT;
BEGIN
  IF NOT es_admin() THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'no_autorizado');
  END IF;

  SELECT cantidad_reservada INTO v_cantidad FROM reservas WHERE id = p_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'no_existe');
  END IF;

  DELETE FROM reservas WHERE id = p_id;

  RETURN jsonb_build_object('ok', true, 'devueltas', v_cantidad);
END;
$$;

CREATE OR REPLACE FUNCTION admin_cancelar_grupo(p_grupo_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_filas    INT;
  v_unidades INT;
BEGIN
  IF NOT es_admin() THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'no_autorizado');
  END IF;

  SELECT COUNT(*), COALESCE(SUM(cantidad_reservada), 0)
    INTO v_filas, v_unidades
    FROM reservas WHERE grupo_id = p_grupo_id;

  IF v_filas = 0 THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'no_existe');
  END IF;

  DELETE FROM reservas WHERE grupo_id = p_grupo_id;

  RETURN jsonb_build_object('ok', true, 'devueltas', v_unidades);
END;
$$;

REVOKE ALL     ON FUNCTION admin_cancelar_reserva(UUID) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION admin_cancelar_reserva(UUID) TO authenticated;
REVOKE ALL     ON FUNCTION admin_cancelar_grupo(UUID)   FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION admin_cancelar_grupo(UUID)   TO authenticated;


-- ----------------------------------------------------------------------------
-- 7. ELIMINAR UN REGALO
-- ----------------------------------------------------------------------------
--  ⚠️  Si el regalo ya tenía reservas, borrarlo también borra el registro de
--  quién lo regaló. Por eso, cuando hay reservas, la función se niega y avisa
--  cuántas son; el panel pide una segunda confirmación y recién ahí manda
--  p_forzar = true.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION admin_eliminar_regalo(
  p_id     UUID,
  p_forzar BOOLEAN DEFAULT FALSE
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_nombre   TEXT;
  v_reservas INT;
BEGIN
  IF NOT es_admin() THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'no_autorizado');
  END IF;

  SELECT nombre INTO v_nombre FROM regalos WHERE id = p_id FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'no_existe');
  END IF;

  SELECT COUNT(*) INTO v_reservas FROM reservas WHERE regalo_id = p_id;

  IF v_reservas > 0 AND NOT p_forzar THEN
    RETURN jsonb_build_object(
      'ok', false, 'motivo', 'tiene_reservas',
      'reservas', v_reservas, 'nombre', v_nombre);
  END IF;

  -- Borramos las reservas primero, de forma explícita, en vez de dejarlo al
  -- borrado en cascada: así el orden es evidente y no depende de detalles
  -- internos de Postgres.
  DELETE FROM reservas WHERE regalo_id = p_id;
  DELETE FROM regalos  WHERE id = p_id;

  RETURN jsonb_build_object('ok', true, 'nombre', v_nombre, 'reservas', v_reservas);
END;
$$;

REVOKE ALL     ON FUNCTION admin_eliminar_regalo(UUID, BOOLEAN) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION admin_eliminar_regalo(UUID, BOOLEAN) TO authenticated;


-- ============================================================================
--  8. ⚠️  ÚLTIMO PASO: DARTE PERMISO A TI
-- ============================================================================
--  Cambia TU_CORREO por el correo con el que creaste el usuario en
--  Authentication → Users, y ejecuta estas dos líneas.
-- ============================================================================
INSERT INTO admins (user_id, email)
SELECT id, email FROM auth.users WHERE email = 'TU_CORREO'
ON CONFLICT (user_id) DO NOTHING;

-- Para comprobar que quedó bien (debe mostrar tu correo):
--   SELECT * FROM admins;
--
-- Si sale vacío, el correo no coincide con el del usuario que creaste.
-- Revísalo con: SELECT email FROM auth.users;
