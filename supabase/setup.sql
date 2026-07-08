-- Tabla de Regalos
CREATE TABLE regalos (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  nombre TEXT NOT NULL,
  cantidad_total INT NOT NULL,
  cantidad_disponible INT NOT NULL,
  imagen_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabla de Reservas
CREATE TABLE reservas (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  regalo_id UUID REFERENCES regalos(id) NOT NULL,
  nombre_invitado TEXT NOT NULL,
  apellido_invitado TEXT NOT NULL,
  cantidad_reservada INT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Habilitar RLS (Row Level Security) opcional, pero por ahora permitiremos lecturas públicas
ALTER TABLE regalos ENABLE ROW LEVEL SECURITY;
ALTER TABLE reservas ENABLE ROW LEVEL SECURITY;

-- Políticas de lectura pública para los regalos
CREATE POLICY "Permitir lectura pública de regalos" ON regalos FOR SELECT USING (true);

-- Políticas de inserción pública para las reservas (o se puede hacer solo a través de la función RPC que bypassa RLS usando SECURITY DEFINER)
CREATE POLICY "Permitir inserción pública de reservas" ON reservas FOR INSERT WITH CHECK (true);

-- Función RPC para reservar regalo con manejo de concurrencia
CREATE OR REPLACE FUNCTION reservar_regalo(
  p_regalo_id UUID,
  p_nombre TEXT,
  p_apellido TEXT
) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_disponible INT;
BEGIN
  -- Bloquear la fila del regalo para actualización (FOR UPDATE)
  SELECT cantidad_disponible INTO v_disponible
  FROM regalos
  WHERE id = p_regalo_id
  FOR UPDATE;

  -- Si no existe el regalo o no hay stock, retornar false
  IF v_disponible IS NULL OR v_disponible <= 0 THEN
    RETURN FALSE;
  END IF;

  -- Actualizar el inventario
  UPDATE regalos
  SET cantidad_disponible = cantidad_disponible - 1
  WHERE id = p_regalo_id;

  -- Insertar la reserva
  INSERT INTO reservas (regalo_id, nombre_invitado, apellido_invitado, cantidad_reservada)
  VALUES (p_regalo_id, p_nombre, p_apellido, 1);

  -- Todo fue exitoso
  RETURN TRUE;
END;
$$;

-- Insertar datos de prueba
INSERT INTO regalos (nombre, cantidad_total, cantidad_disponible) VALUES
  ('Paquete de Pañales (Recién Nacido)', 5, 5),
  ('Biberones Avent (Set de 3)', 2, 2),
  ('Cochecito de Bebé', 1, 1),
  ('Ropa de Bebé (0-3 meses)', 3, 3),
  ('Esterilizador', 1, 0), -- Este ya está agotado para probar
  ('Toallitas Húmedas', 10, 10);

-- Función para devolver el stock cuando se elimina (o cancela) una reserva
CREATE OR REPLACE FUNCTION devolver_stock_al_eliminar_reserva()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE regalos
  SET cantidad_disponible = cantidad_disponible + OLD.cantidad_reservada
  WHERE id = OLD.regalo_id;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

-- Trigger que se dispara después de eliminar una fila en la tabla reservas
DROP TRIGGER IF EXISTS trg_devolver_stock ON reservas;
CREATE TRIGGER trg_devolver_stock
AFTER DELETE ON reservas
FOR EACH ROW
EXECUTE FUNCTION devolver_stock_al_eliminar_reserva();
