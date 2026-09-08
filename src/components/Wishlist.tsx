import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import {
  Gift,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ChevronDown,
  Minus,
  Plus,
  Trash2,
  X,
  Baby,
  Shirt,
  Milk,
  Bath,
  Moon,
  Rabbit,
  type LucideIcon,
} from "lucide-react";

// Un iconito por categoría. Si algún día agregas una categoría nueva en la
// base de datos y no está aquí, se muestra el regalito por defecto.
const ICONOS_CATEGORIA: Record<string, LucideIcon> = {
  "Muda e higiene": Baby,
  Ropa: Shirt,
  Alimentación: Milk,
  Baño: Bath,
  "Dormir y abrigo": Moon,
  Estimulación: Rabbit,
};

interface Regalo {
  id: string;
  nombre: string;
  categoria: string;
  orden: number;
  cantidad_total: number;
  cantidad_disponible: number;
}

interface SinStock {
  regalo_id: string;
  nombre: string;
  pedido: number;
  disponible: number;
}

interface RespuestaReserva {
  ok: boolean;
  motivo?: string;
  grupo_id?: string;
  sin_stock?: SinStock[];
}

// El carrito: id del regalo -> cantidad elegida
type Carrito = Record<string, number>;

export default function Wishlist() {
  const [regalos, setRegalos] = useState<Regalo[]>([]);
  const [loading, setLoading] = useState(true);
  const [carrito, setCarrito] = useState<Carrito>({});
  const [categoriasAbiertas, setCategoriasAbiertas] = useState<
    Record<string, boolean>
  >({});

  const [modalAbierto, setModalAbierto] = useState(false);
  const [nombre, setNombre] = useState("");
  const [apellido, setApellido] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [confirmado, setConfirmado] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchRegalos({ abrirPrimera: true });
  }, []);

  // Bloquear el scroll del fondo mientras el modal está abierto
  useEffect(() => {
    if (!modalAbierto) return;
    const anterior = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = anterior;
    };
  }, [modalAbierto]);

  const fetchRegalos = async ({ abrirPrimera = false } = {}) => {
    try {
      const { data, error } = await supabase
        .from("regalos")
        .select("*")
        .order("orden", { ascending: true })
        .order("nombre", { ascending: true });

      if (error) throw error;
      const lista = (data as Regalo[]) || [];
      setRegalos(lista);
      setError(null); // si un intento anterior falló, limpiamos el aviso

      // Dejamos la primera categoría abierta para que se note que se despliegan
      if (abrirPrimera && lista.length > 0) {
        setCategoriasAbiertas({ [lista[0].categoria]: true });
      }
    } catch (err) {
      console.error("Error cargando los regalos:", err);
      setError("No pudimos cargar la lista. Recarga la página, por favor.");
    } finally {
      setLoading(false);
    }
  };

  // Agrupamos por categoría respetando el orden que viene de la base de datos
  const categorias = useMemo(() => {
    const mapa = new Map<string, Regalo[]>();
    for (const regalo of regalos) {
      const grupo = mapa.get(regalo.categoria);
      if (grupo) grupo.push(regalo);
      else mapa.set(regalo.categoria, [regalo]);
    }
    return Array.from(mapa, ([nombre, items]) => ({ nombre, items }));
  }, [regalos]);

  const unidadesTotales = useMemo(
    () => Object.values(carrito).reduce((suma, n) => suma + n, 0),
    [carrito],
  );

  const seleccionados = useMemo(
    () =>
      regalos
        .filter((r) => (carrito[r.id] ?? 0) > 0)
        .map((r) => ({ regalo: r, cantidad: carrito[r.id] })),
    [regalos, carrito],
  );

  const setCantidad = (regalo: Regalo, cantidad: number) => {
    const limitada = Math.max(0, Math.min(cantidad, regalo.cantidad_disponible));
    setCarrito((actual) => {
      const siguiente = { ...actual };
      if (limitada <= 0) delete siguiente[regalo.id];
      else siguiente[regalo.id] = limitada;
      return siguiente;
    });
    setError(null);
  };

  const toggleCategoria = (nombre: string) =>
    setCategoriasAbiertas((actual) => ({
      ...actual,
      [nombre]: !actual[nombre],
    }));

  const handleConfirmar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nombre.trim() || !apellido.trim() || seleccionados.length === 0) return;

    setSubmitting(true);
    setError(null);

    try {
      const { data, error: rpcError } = await supabase.rpc("reservar_regalos", {
        p_nombre: nombre.trim(),
        p_apellido: apellido.trim(),
        p_items: seleccionados.map(({ regalo, cantidad }) => ({
          regalo_id: regalo.id,
          cantidad,
        })),
      });

      if (rpcError) throw rpcError;

      const resultado = data as RespuestaReserva;

      if (resultado?.ok) {
        setConfirmado(true);
        // Descontamos el stock en pantalla sin esperar a recargar
        setRegalos((actual) =>
          actual.map((r) =>
            carrito[r.id]
              ? {
                  ...r,
                  cantidad_disponible: r.cantidad_disponible - carrito[r.id],
                }
              : r,
          ),
        );
        return;
      }

      // Alguien se adelantó con uno o más regalos: ajustamos el carrito
      if (resultado?.motivo === "sin_stock" && resultado.sin_stock?.length) {
        const detalle = resultado.sin_stock
          .map((s) =>
            s.disponible > 0
              ? `${s.nombre} (quedan ${s.disponible})`
              : `${s.nombre} (agotado)`,
          )
          .join(", ");

        setCarrito((actual) => {
          const siguiente = { ...actual };
          for (const s of resultado.sin_stock!) {
            if (s.disponible > 0) siguiente[s.regalo_id] = s.disponible;
            else delete siguiente[s.regalo_id];
          }
          return siguiente;
        });

        // Refrescamos primero (fetchRegalos limpia el error) y avisamos después,
        // para que el mensaje quede visible.
        await fetchRegalos();
        setError(
          `Alguien se adelantó con: ${detalle}. Ajustamos las cantidades, revisa y confirma de nuevo.`,
        );
      } else if (resultado?.motivo === "datos_incompletos") {
        setError("Necesitamos tu nombre y tu apellido para anotar el regalo.");
      } else {
        setError("No pudimos registrar tu regalo. Intenta nuevamente.");
      }
    } catch (err) {
      console.error("Error reservando:", err);
      setError("Ocurrió un error. Por favor intenta nuevamente.");
    } finally {
      setSubmitting(false);
    }
  };

  const cerrarYReiniciar = () => {
    setModalAbierto(false);
    if (confirmado) {
      setCarrito({});
      setNombre("");
      setApellido("");
      setConfirmado(false);
      fetchRegalos();
    }
    setError(null);
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-[#826c4f]" />
      </div>
    );
  }

  return (
    <div className="w-full relative z-10 pt-4">
      <div className="text-center mb-6">
        <h2 className="text-6xl md:text-7xl font-script text-[#826c4f] drop-shadow-sm lowercase">
          Mesa de Regalos
        </h2>
        <p className="text-md text-[#826c4f] mt-2 max-w-xs mx-auto leading-relaxed font-medium">
          Si quieres tener un detalle con nuestro bebé, aquí están las cositas
          que nos faltan para su llegada. Marca la que te gustaría llevar y
          queda reservada a tu nombre. Puedes elegir más de una y la cantidad
          que quieras.
        </p>
        <p className="text-sm text-[#826c4f]/75 mt-3 max-w-xs mx-auto leading-relaxed font-medium italic">
          Lo más importante para nosotros es que nos acompañes.
        </p>
      </div>

      {error && !modalAbierto && (
        <div className="mb-4 p-3 bg-red-50/90 border border-red-200 rounded-lg flex items-start gap-2 text-red-800 shadow-sm">
          <AlertCircle className="text-red-500 shrink-0 mt-0.5" size={16} />
          <p className="text-xs font-medium">{error}</p>
        </div>
      )}

      {/* Listado por categorías */}
      <div className="flex flex-col gap-3">
        {categorias.map(({ nombre: categoria, items }) => {
          const abierta = !!categoriasAbiertas[categoria];
          const disponibles = items.filter(
            (i) => i.cantidad_disponible > 0,
          ).length;
          const elegidosAqui = items.reduce(
            (suma, i) => suma + (carrito[i.id] ?? 0),
            0,
          );
          const IconoCategoria = ICONOS_CATEGORIA[categoria] ?? Gift;

          return (
            <div
              key={categoria}
              className="bg-white border border-[#826c4f]/25 rounded-xl shadow-sm overflow-hidden"
            >
              <button
                type="button"
                onClick={() => toggleCategoria(categoria)}
                aria-expanded={abierta}
                className="w-full flex items-center justify-between gap-2 px-4 py-3 text-left hover:bg-[#826c4f]/5 transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span
                    className={`shrink-0 w-9 h-9 rounded-full flex items-center justify-center border transition-colors ${
                      disponibles === 0
                        ? "bg-[#826c4f]/5 border-[#826c4f]/15 text-[#826c4f]/35"
                        : "bg-[#ebdcb9]/60 border-[#826c4f]/20 text-[#826c4f]"
                    }`}
                  >
                    <IconoCategoria size={17} strokeWidth={1.8} />
                  </span>

                  <div className="min-w-0">
                    <span className="block text-sm font-bold text-[#826c4f] truncate">
                      {categoria}
                    </span>
                    <span className="block text-[10px] uppercase tracking-wider font-bold text-[#826c4f]/60 mt-0.5">
                      {disponibles === 0
                        ? "Todo regalado ¡gracias!"
                        : abierta
                          ? "Ocultar regalitos"
                          : "Ver regalitos"}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {elegidosAqui > 0 && (
                    <span className="bg-[#826c4f] text-white text-[10px] font-bold rounded-full px-2 py-0.5">
                      {elegidosAqui}
                    </span>
                  )}
                  <ChevronDown
                    size={18}
                    className={`text-[#826c4f]/70 transition-transform duration-300 ${
                      abierta ? "rotate-180" : ""
                    }`}
                  />
                </div>
              </button>

              {abierta && (
                <div className="border-t border-[#826c4f]/15">
                  {items.map((regalo, index) => (
                    <FilaRegalo
                      key={regalo.id}
                      regalo={regalo}
                      cantidad={carrito[regalo.id] ?? 0}
                      primero={index === 0}
                      onCambiar={(n) => setCantidad(regalo, n)}
                    />
                  ))}
                </div>
              )}
            </div>
          );
        })}

        {regalos.length === 0 && (
          <div className="text-center py-6 bg-white border border-[#826c4f]/25 rounded-xl">
            <p className="text-xs font-medium text-[#826c4f]/70">
              Aún no hay regalos en la lista.
            </p>
          </div>
        )}
      </div>

      {/* Espacio para que la barra fija no tape el último elemento */}
      {unidadesTotales > 0 && <div className="h-24" />}

      {/* Barra fija con el resumen del carrito */}
      {unidadesTotales > 0 && !modalAbierto && (
        <div className="fixed bottom-0 inset-x-0 z-40 px-4 pb-4 pt-3 bg-gradient-to-t from-[#e8f1f8] via-[#e8f1f8]/95 to-transparent">
          <div className="max-w-[420px] mx-auto flex items-center gap-3 bg-[#826c4f] text-white rounded-xl shadow-lg px-4 py-2.5">
            <div className="flex-1 min-w-0 leading-tight">
              <p className="text-xs font-bold">
                {seleccionados.length}{" "}
                {seleccionados.length === 1 ? "regalo" : "regalos"}
              </p>
              <p className="text-[10px] opacity-80">
                {unidadesTotales}{" "}
                {unidadesTotales === 1 ? "unidad" : "unidades"} en total
              </p>
            </div>
            <button
              type="button"
              onClick={() => setModalAbierto(true)}
              className="shrink-0 bg-white text-[#826c4f] px-4 py-2 rounded-lg text-[11px] uppercase font-bold tracking-widest hover:bg-[#ebdcb9] transition-colors cursor-pointer"
            >
              Confirmar
            </button>
          </div>
        </div>
      )}

      {/* Modal de confirmación */}
      {modalAbierto && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm"
          onClick={cerrarYReiniciar}
        >
          <div
            className="w-full max-w-[420px] max-h-[88dvh] overflow-y-auto bg-[#fbf9f4] rounded-t-2xl sm:rounded-2xl shadow-2xl border border-[#826c4f]/20"
            onClick={(e) => e.stopPropagation()}
          >
            {confirmado ? (
              <div className="p-8 text-center flex flex-col items-center gap-3">
                <CheckCircle2 size={40} className="text-emerald-600" />
                <h3 className="text-4xl font-script lowercase text-[#826c4f]">
                  ¡Muchas gracias!
                </h3>
                <p className="text-sm text-[#826c4f] font-medium leading-relaxed">
                  Gino, Amy y Thiago te lo agradecen un montón.
                </p>
                <button
                  type="button"
                  onClick={cerrarYReiniciar}
                  className="mt-2 px-6 py-2 rounded-lg bg-[#826c4f] text-white text-[11px] uppercase font-bold tracking-widest hover:bg-[#6e5a40] transition-colors cursor-pointer"
                >
                  Cerrar
                </button>
              </div>
            ) : (
              <form onSubmit={handleConfirmar}>
                <div className="flex items-center justify-between px-4 py-3 border-b border-[#826c4f]/15 sticky top-0 bg-[#fbf9f4] z-10">
                  <h3 className="text-sm font-bold text-[#826c4f]">
                    Tus regalos
                  </h3>
                  <button
                    type="button"
                    onClick={cerrarYReiniciar}
                    aria-label="Cerrar"
                    className="text-[#826c4f]/60 hover:text-[#826c4f] transition-colors cursor-pointer"
                  >
                    <X size={18} />
                  </button>
                </div>

                <div className="px-4 py-3 flex flex-col gap-2">
                  {seleccionados.map(({ regalo, cantidad }) => (
                    <div
                      key={regalo.id}
                      className="flex items-center gap-2 bg-white border border-[#826c4f]/15 rounded-lg px-3 py-2"
                    >
                      <span className="flex-1 text-xs text-[#826c4f] font-medium leading-snug">
                        {regalo.nombre}
                      </span>
                      <Stepper
                        cantidad={cantidad}
                        maximo={regalo.cantidad_disponible}
                        onCambiar={(n) => setCantidad(regalo, n)}
                      />
                      <button
                        type="button"
                        onClick={() => setCantidad(regalo, 0)}
                        aria-label={`Quitar ${regalo.nombre}`}
                        className="text-[#826c4f]/50 hover:text-red-600 transition-colors shrink-0 cursor-pointer"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}

                  {seleccionados.length === 0 && (
                    <p className="text-xs text-[#826c4f]/70 text-center py-4 font-medium">
                      Ya no tienes regalos seleccionados.
                    </p>
                  )}
                </div>

                {error && (
                  <div className="mx-4 mb-3 p-2.5 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2">
                    <AlertCircle
                      size={14}
                      className="text-red-500 mt-0.5 shrink-0"
                    />
                    <p className="text-[11px] text-red-700 font-medium leading-snug">
                      {error}
                    </p>
                  </div>
                )}

                <div className="px-4 pb-4 flex flex-col gap-2">
                  <p className="text-[10px] uppercase tracking-wider font-bold text-[#826c4f]/60">
                    ¿De parte de quién?
                  </p>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      required
                      placeholder="Nombre"
                      value={nombre}
                      onChange={(e) => setNombre(e.target.value)}
                      className="w-full px-3 py-2 text-xs rounded-lg border border-[#826c4f]/25 focus:border-[#826c4f] outline-none bg-white text-[#826c4f] placeholder:text-[#826c4f]/40"
                    />
                    <input
                      type="text"
                      required
                      placeholder="Apellido"
                      value={apellido}
                      onChange={(e) => setApellido(e.target.value)}
                      className="w-full px-3 py-2 text-xs rounded-lg border border-[#826c4f]/25 focus:border-[#826c4f] outline-none bg-white text-[#826c4f] placeholder:text-[#826c4f]/40"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={
                      submitting ||
                      seleccionados.length === 0 ||
                      !nombre.trim() ||
                      !apellido.trim()
                    }
                    className="mt-1 w-full px-4 py-2.5 rounded-lg bg-[#826c4f] text-white text-[11px] uppercase font-bold tracking-widest hover:bg-[#6e5a40] disabled:opacity-60 disabled:cursor-not-allowed flex justify-center items-center gap-2 transition-colors cursor-pointer"
                  >
                    {submitting ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      <>
                        <Gift size={14} />
                        Confirmar {unidadesTotales}{" "}
                        {unidadesTotales === 1 ? "regalo" : "regalos"}
                      </>
                    )}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// --- Fila de un regalo dentro de una categoría ---
function FilaRegalo({
  regalo,
  cantidad,
  primero,
  onCambiar,
}: {
  regalo: Regalo;
  cantidad: number;
  primero: boolean;
  onCambiar: (n: number) => void;
}) {
  const agotado = regalo.cantidad_disponible <= 0;

  return (
    <div
      className={`flex items-center gap-2 px-4 py-2.5 transition-colors ${
        primero ? "" : "border-t border-[#826c4f]/10"
      } ${cantidad > 0 ? "bg-[#ebdcb9]/40" : ""}`}
    >
      <Gift
        size={14}
        className={`shrink-0 ${agotado ? "text-[#826c4f]/30" : "text-[#826c4f]/80"}`}
      />

      <div className="flex-1 min-w-0">
        <p
          className={`text-sm font-medium leading-snug ${
            agotado ? "text-[#826c4f]/40 line-through" : "text-[#826c4f]"
          }`}
        >
          {regalo.nombre}
        </p>
        {/* No mostramos el stock. El único aviso es cuando alguien llega al
            tope de un producto del que había varios, para que no parezca que
            el botón "+" está fallando. En los de uno solo no hace falta. */}
        {!agotado &&
          regalo.cantidad_disponible > 1 &&
          cantidad >= regalo.cantidad_disponible && (
            <p className="text-[10px] font-bold uppercase tracking-wider text-[#826c4f]/50 mt-0.5">
              Es todo lo que falta
            </p>
          )}
      </div>

      {agotado ? (
        <span className="shrink-0 px-2 py-1 text-[10px] uppercase font-bold tracking-widest rounded bg-gray-200/70 text-gray-500">
          Ya regalado
        </span>
      ) : cantidad === 0 ? (
        <button
          type="button"
          onClick={() => onCambiar(1)}
          className="shrink-0 px-2.5 py-1 text-[10px] uppercase font-bold tracking-widest rounded bg-[#826c4f] text-white hover:bg-[#6e5a40] transition-colors cursor-pointer"
        >
          Agregar
        </button>
      ) : (
        <Stepper
          cantidad={cantidad}
          maximo={regalo.cantidad_disponible}
          onCambiar={onCambiar}
        />
      )}
    </div>
  );
}

// --- Selector de cantidad ( − 2 + ) ---
function Stepper({
  cantidad,
  maximo,
  onCambiar,
}: {
  cantidad: number;
  maximo: number;
  onCambiar: (n: number) => void;
}) {
  return (
    <div className="shrink-0 flex items-center gap-1 bg-white border border-[#826c4f]/30 rounded-lg p-0.5">
      <button
        type="button"
        onClick={() => onCambiar(cantidad - 1)}
        aria-label="Quitar uno"
        className="w-6 h-6 flex items-center justify-center rounded text-[#826c4f] hover:bg-[#826c4f]/10 transition-colors cursor-pointer"
      >
        <Minus size={12} />
      </button>

      <span className="w-5 text-center text-xs font-bold text-[#826c4f] tabular-nums">
        {cantidad}
      </span>

      <button
        type="button"
        onClick={() => onCambiar(cantidad + 1)}
        disabled={cantidad >= maximo}
        aria-label="Agregar uno"
        className="w-6 h-6 flex items-center justify-center rounded text-[#826c4f] hover:bg-[#826c4f]/10 disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer"
      >
        <Plus size={12} />
      </button>
    </div>
  );
}
