-- ============================================================================
--  MESA DE REGALOS - BABY SHOWER
-- ============================================================================
--  ⚠️  ATENCIÓN: este script REEMPLAZA todo. Borra las tablas `regalos` y
--  `reservas` con sus datos (incluidas las reservas ya hechas) y las vuelve a
--  crear desde cero con el catálogo definitivo de 31 productos.
--
--  Es idempotente: se puede pegar y ejecutar en el SQL Editor de Supabase las
--  veces que haga falta, siempre deja la base en el mismo estado.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. LIMPIEZA
-- ----------------------------------------------------------------------------
-- Primero las tablas (al borrarlas se van también sus triggers y políticas),
-- después las funciones. En este orden el script también funciona sobre una
-- base completamente vacía.
DROP TABLE IF EXISTS reservas CASCADE;
DROP TABLE IF EXISTS regalos  CASCADE;

DROP FUNCTION IF EXISTS devolver_stock_al_eliminar_reserva() CASCADE;
DROP FUNCTION IF EXISTS reservar_regalo(UUID, TEXT, TEXT) CASCADE;   -- versión antigua (1 regalo por vez)
DROP FUNCTION IF EXISTS reservar_regalos(TEXT, TEXT, JSONB) CASCADE;


-- ----------------------------------------------------------------------------
-- 2. TABLA DE REGALOS
-- ----------------------------------------------------------------------------
CREATE TABLE regalos (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre              TEXT NOT NULL,
  categoria           TEXT NOT NULL,
  -- `orden` controla cómo se ven en la página: menor número aparece primero.
  -- Las categorías se muestran en el orden en que aparece su primer producto.
  orden               INT  NOT NULL DEFAULT 0,
  cantidad_total      INT  NOT NULL CHECK (cantidad_total >= 0),
  cantidad_disponible INT  NOT NULL CHECK (cantidad_disponible >= 0),
  imagen_url          TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Nunca se puede reservar más de lo que existe.
  CONSTRAINT disponible_no_supera_total CHECK (cantidad_disponible <= cantidad_total)
);

CREATE INDEX idx_regalos_orden ON regalos (orden, nombre);


-- ----------------------------------------------------------------------------
-- 3. TABLA DE RESERVAS
-- ----------------------------------------------------------------------------
--  Una fila por producto reservado. Todos los productos que una persona
--  confirma de una sola vez comparten el mismo `grupo_id`, así se puede ver
--  el "carrito" completo de cada invitado.
-- ----------------------------------------------------------------------------
CREATE TABLE reservas (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  grupo_id           UUID NOT NULL,
  regalo_id          UUID NOT NULL REFERENCES regalos(id) ON DELETE CASCADE,
  nombre_invitado    TEXT NOT NULL,
  apellido_invitado  TEXT NOT NULL,
  cantidad_reservada INT  NOT NULL CHECK (cantidad_reservada > 0),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_reservas_grupo  ON reservas (grupo_id);
CREATE INDEX idx_reservas_regalo ON reservas (regalo_id);


-- ----------------------------------------------------------------------------
-- 4. SEGURIDAD (RLS)
-- ----------------------------------------------------------------------------
ALTER TABLE regalos  ENABLE ROW LEVEL SECURITY;
ALTER TABLE reservas ENABLE ROW LEVEL SECURITY;

-- El catálogo es público: cualquiera puede leerlo.
DROP POLICY IF EXISTS "Lectura pública de regalos" ON regalos;
CREATE POLICY "Lectura pública de regalos"
  ON regalos FOR SELECT USING (true);

-- `reservas` queda cerrada a propósito: los nombres de los invitados no se
-- exponen y nadie puede insertar una reserva "a mano" sin descontar stock.
-- La única puerta de entrada es la función reservar_regalos() de más abajo.


-- ----------------------------------------------------------------------------
-- 5. RPC: RESERVAR VARIOS REGALOS DE UNA SOLA VEZ
-- ----------------------------------------------------------------------------
--  Recibe el carrito completo:
--    p_items = '[{"regalo_id":"uuid","cantidad":2}, {"regalo_id":"uuid","cantidad":1}]'
--
--  Es todo-o-nada: si a UN solo producto le falta stock, no se reserva nada y
--  devuelve cuáles fallaron para poder avisarle al invitado.
--
--  Devuelve JSON:
--    { "ok": true,  "grupo_id": "...", "sin_stock": [] }
--    { "ok": false, "motivo": "sin_stock",
--      "sin_stock": [{"regalo_id":"...","nombre":"...","pedido":3,"disponible":1}] }
--    { "ok": false, "motivo": "carrito_vacio" | "datos_incompletos", "sin_stock": [] }
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION reservar_regalos(
  p_nombre   TEXT,
  p_apellido TEXT,
  p_items    JSONB
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_grupo_id  UUID := gen_random_uuid();
  v_item      RECORD;
  v_nombre    TEXT;
  v_disp      INT;
  v_sin_stock JSONB := '[]'::jsonb;
  v_total     INT   := 0;
BEGIN
  -- Validaciones de entrada -------------------------------------------------
  IF COALESCE(BTRIM(p_nombre), '') = '' OR COALESCE(BTRIM(p_apellido), '') = '' THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'datos_incompletos', 'sin_stock', '[]'::jsonb);
  END IF;

  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'carrito_vacio', 'sin_stock', '[]'::jsonb);
  END IF;

  -- PASADA 1: bloquear cada regalo y comprobar que alcanza el stock ----------
  -- El ORDER BY sobre el id mantiene siempre el mismo orden de bloqueo, así
  -- dos invitados que confirmen a la vez no se quedan trabados entre sí.
  FOR v_item IN
    SELECT (e->>'regalo_id')::uuid                    AS regalo_id,
           SUM(GREATEST((e->>'cantidad')::int, 0))::int AS cantidad
    FROM jsonb_array_elements(p_items) AS e
    GROUP BY 1
    HAVING SUM(GREATEST((e->>'cantidad')::int, 0)) > 0
    ORDER BY 1
  LOOP
    v_total := v_total + v_item.cantidad;

    SELECT nombre, cantidad_disponible
      INTO v_nombre, v_disp
      FROM regalos
     WHERE id = v_item.regalo_id
     FOR UPDATE;

    IF NOT FOUND THEN
      v_sin_stock := v_sin_stock || jsonb_build_object(
        'regalo_id', v_item.regalo_id, 'nombre', 'Regalo no encontrado',
        'pedido', v_item.cantidad, 'disponible', 0);
    ELSIF v_disp < v_item.cantidad THEN
      v_sin_stock := v_sin_stock || jsonb_build_object(
        'regalo_id', v_item.regalo_id, 'nombre', v_nombre,
        'pedido', v_item.cantidad, 'disponible', v_disp);
    END IF;
  END LOOP;

  IF v_total = 0 THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'carrito_vacio', 'sin_stock', '[]'::jsonb);
  END IF;

  IF jsonb_array_length(v_sin_stock) > 0 THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'sin_stock', 'sin_stock', v_sin_stock);
  END IF;

  -- PASADA 2: descontar stock e insertar las reservas ------------------------
  -- Los bloqueos de la pasada 1 siguen vigentes, así que nadie pudo cambiar
  -- el stock entremedio.
  FOR v_item IN
    SELECT (e->>'regalo_id')::uuid                    AS regalo_id,
           SUM(GREATEST((e->>'cantidad')::int, 0))::int AS cantidad
    FROM jsonb_array_elements(p_items) AS e
    GROUP BY 1
    HAVING SUM(GREATEST((e->>'cantidad')::int, 0)) > 0
    ORDER BY 1
  LOOP
    UPDATE regalos
       SET cantidad_disponible = cantidad_disponible - v_item.cantidad
     WHERE id = v_item.regalo_id;

    INSERT INTO reservas (grupo_id, regalo_id, nombre_invitado, apellido_invitado, cantidad_reservada)
    VALUES (v_grupo_id, v_item.regalo_id, BTRIM(p_nombre), BTRIM(p_apellido), v_item.cantidad);
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'grupo_id', v_grupo_id, 'sin_stock', '[]'::jsonb);
END;
$$;

REVOKE ALL     ON FUNCTION reservar_regalos(TEXT, TEXT, JSONB) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION reservar_regalos(TEXT, TEXT, JSONB) TO anon, authenticated;


-- ----------------------------------------------------------------------------
-- 6. DEVOLVER EL STOCK SI SE BORRA UNA RESERVA
-- ----------------------------------------------------------------------------
--  Si te equivocas y borras una fila de `reservas` desde el panel de Supabase,
--  el stock vuelve solo al regalo correspondiente.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION devolver_stock_al_eliminar_reserva()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE regalos
     SET cantidad_disponible = LEAST(cantidad_disponible + OLD.cantidad_reservada, cantidad_total)
   WHERE id = OLD.regalo_id;
  RETURN OLD;
END;
$$;

CREATE TRIGGER trg_devolver_stock
AFTER DELETE ON reservas
FOR EACH ROW
EXECUTE FUNCTION devolver_stock_al_eliminar_reserva();


-- ----------------------------------------------------------------------------
-- 7. CATÁLOGO DE REGALOS (31 productos)
-- ----------------------------------------------------------------------------
INSERT INTO regalos (nombre, categoria, orden, cantidad_total, cantidad_disponible) VALUES
  -- Muda e higiene
  ('Pañales talla M (6–10 kg)',              'Muda e higiene',   10,  6,  6),
  ('Pañales talla G (10–14 kg)',             'Muda e higiene',   11,  4,  4),
  ('Toallitas húmedas',                      'Muda e higiene',   12,  5,  5),
  ('Crema para las coceduras',               'Muda e higiene',   13,  3,  3),
  ('Mudador portátil impermeable',           'Muda e higiene',   14,  1,  1),
  ('Aspirador nasal',                        'Muda e higiene',   15,  1,  1),
  ('Cortauñas de bebé',                      'Muda e higiene',   16,  1,  1),
  ('Termómetro digital',                     'Muda e higiene',   17,  1,  1),

  -- Ropa
  ('Bodys manga larga talla 3–6 meses',      'Ropa',             20,  3,  3),
  ('Bodys manga corta talla 0–3 meses',      'Ropa',             21,  3,  3),
  ('Pilucho enterito con pies (osito)',      'Ropa',             22,  2,  2),
  ('Calcetines de guagua',                   'Ropa',             23,  2,  2),
  ('Gorrito de algodón',                     'Ropa',             24,  1,  1),
  ('Chaleco polar o abrigado',               'Ropa',             25,  1,  1),
  ('Conjunto de salida 3–6 meses',           'Ropa',             26,  1,  1),
  ('Mitones',                                'Ropa',             27,  1,  1),
  ('Saco de dormir liviano',                 'Ropa',             28,  1,  1),

  -- Alimentación
  ('Baberos de género con broche',           'Alimentación',     30,  1,  1),
  ('Chupete de entretención 0–6 meses',      'Alimentación',     31,  1,  1),
  ('Bolsas para guardar leche materna',      'Alimentación',     32,  1,  1),
  ('Discos absorbentes de lactancia',        'Alimentación',     33,  1,  1),
  ('Broche porta chupete',                   'Alimentación',     34,  1,  1),
  ('Crema de lanolina para pezones',         'Alimentación',     35,  1,  1),

  -- Baño
  ('Shampoo',                                'Baño',             40,  1,  1),
  ('Crema hidratante corporal para guagua',  'Baño',             41,  1,  1),
  ('Toalla con capucha (toalla poncho)',     'Baño',             42,  1,  1),
  ('Cojín de baño para bañera',              'Baño',             43,  1,  1),

  -- Dormir y abrigo
  ('Mantillas de muselina o algodón',        'Dormir y abrigo',  50,  1,  1),
  ('Manta polar suave para el coche',        'Dormir y abrigo',  51,  1,  1),

  -- Estimulación
  ('Sonajero blando 0–6 meses',              'Estimulación',     60,  1,  1),
  ('Mordedor refrigerante',                  'Estimulación',     61,  1,  1);


-- ----------------------------------------------------------------------------
-- 8. CONSULTAS ÚTILES (para pegar cuando quieras revisar cómo va la lista)
-- ----------------------------------------------------------------------------
--  Qué regaló cada persona:
--    SELECT r.nombre_invitado || ' ' || r.apellido_invitado AS invitado,
--           g.nombre AS regalo, r.cantidad_reservada, r.created_at
--      FROM reservas r JOIN regalos g ON g.id = r.regalo_id
--     ORDER BY r.created_at DESC;
--
--  Qué falta todavía:
--    SELECT categoria, nombre, cantidad_disponible, cantidad_total
--      FROM regalos WHERE cantidad_disponible > 0 ORDER BY orden;
-- ----------------------------------------------------------------------------
