import React, { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { Gift, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";

interface Regalo {
  id: string;
  nombre: string;
  cantidad_total: number;
  cantidad_disponible: number;
}

export default function Wishlist() {
  const [regalos, setRegalos] = useState<Regalo[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedRegalo, setSelectedRegalo] = useState<Regalo | null>(null);

  // Form state
  const [nombre, setNombre] = useState("");
  const [apellido, setApellido] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  useEffect(() => {
    fetchRegalos();
  }, []);

  const fetchRegalos = async () => {
    try {
      const { data, error } = await supabase
        .from("regalos")
        .select("*")
        .order("created_at", { ascending: true });

      if (error) throw error;
      setRegalos(data || []);
    } catch (err) {
      console.error("Error fetching regalos:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleReservar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRegalo || !nombre.trim() || !apellido.trim()) return;

    setSubmitting(true);
    setStatus(null);

    try {
      const { data, error } = await supabase.rpc("reservar_regalo", {
        p_regalo_id: selectedRegalo.id,
        p_nombre: nombre.trim(),
        p_apellido: apellido.trim(),
      });

      if (error) throw error;

      if (data) {
        // Reservado exitosamente
        setStatus({
          type: "success",
          message: "¡Gracias por tu regalo! Reserva confirmada.",
        });
        // Actualizar UI localmente
        setRegalos(
          regalos.map((r) =>
            r.id === selectedRegalo.id
              ? { ...r, cantidad_disponible: r.cantidad_disponible - 1 }
              : r,
          ),
        );
        setTimeout(() => {
          setSelectedRegalo(null);
          setStatus(null);
          setNombre("");
          setApellido("");
        }, 3000);
      } else {
        // Alguien lo reservó antes (sin stock)
        setStatus({
          type: "error",
          message:
            "Lo sentimos, este regalo acaba de ser reservado por alguien más.",
        });
        fetchRegalos(); // Refrescar lista completa
      }
    } catch (err) {
      console.error("Error reserving:", err);
      setStatus({
        type: "error",
        message: "Ocurrió un error. Por favor intenta nuevamente.",
      });
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-400" />
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
          Si quieres tener un detalle con nuestro bebé, aquí te dejamos algunas opciones de las cositas que nos faltan para preparar su llegada
        </p>
      </div>

      {status?.type === "error" && !selectedRegalo && (
        <div className="mb-4 p-3 bg-red-50/80 border border-red-200 rounded-lg flex items-center gap-2 text-red-800 shadow-sm backdrop-blur-sm">
          <AlertCircle className="text-red-500 shrink-0" size={16} />
          <p className="text-xs font-medium">{status.message}</p>
        </div>
      )}

      <div className="bg-white backdrop-blur-sm border border-[#826c4f]/25 rounded-xl shadow-sm overflow-hidden">
        {regalos.map((regalo, index) => {
          const isAgotado = regalo.cantidad_disponible <= 0;
          const isSelected = selectedRegalo?.id === regalo.id;

          return (
            <div
              key={regalo.id}
              className={`
                transition-all duration-300 hover:bg-white/10
                ${index !== 0 ? "border-t border-[#826c4f]/15" : ""}
              `}
            >
              <div className="flex items-center justify-between p-2.5 px-4">
                <div className="flex items-center gap-2.5">
                  <Gift size={14} className="text-[#826c4f]/80" />
                  <span className="text-sm text-[#826c4f] font-medium">
                    {regalo.nombre}
                  </span>
                </div>

                {!isSelected && (
                  <button
                    disabled={isAgotado}
                    onClick={() => !isAgotado && setSelectedRegalo(regalo)}
                    className={`px-2.5 py-1 text-[10px] uppercase font-bold tracking-widest rounded transition-colors ${
                      isAgotado
                        ? "bg-gray-200/50 text-gray-500 cursor-not-allowed"
                        : "bg-[#826c4f] text-white hover:bg-[#6e5a40]"
                    }`}
                  >
                    {isAgotado ? "Agotado" : "Agregar"}
                  </button>
                )}
              </div>

              {isSelected && (
                <div className="px-4 pb-3 pt-1 bg-[#826c4f]/5 animate-in fade-in slide-in-from-top-1">
                  {status?.type === "success" ? (
                    <div className="flex items-center gap-2 py-2 text-emerald-700 justify-center">
                      <CheckCircle2 size={16} />
                      <p className="font-medium text-xs">{status.message}</p>
                    </div>
                  ) : (
                    <form
                      onSubmit={handleReservar}
                      className="flex flex-col gap-1.5 mt-1"
                    >
                      {status?.type === "error" && (
                        <div className="p-1.5 bg-red-50/80 text-red-600 text-[10px] rounded flex items-start gap-1.5">
                          <AlertCircle size={12} className="mt-0.5 shrink-0" />
                          <p>{status.message}</p>
                        </div>
                      )}

                      <div className="flex gap-1.5">
                        <input
                          type="text"
                          required
                          placeholder="Nombre"
                          value={nombre}
                          onChange={(e) => setNombre(e.target.value)}
                          className="w-full px-2 py-1 text-xs rounded border border-[#826c4f]/20 focus:border-[#826c4f] outline-none bg-white/70 text-[#826c4f] placeholder:text-[#826c4f]/40"
                        />
                        <input
                          type="text"
                          required
                          placeholder="Apellido"
                          value={apellido}
                          onChange={(e) => setApellido(e.target.value)}
                          className="w-full px-2 py-1 text-xs rounded border border-[#826c4f]/20 focus:border-[#826c4f] outline-none bg-white/70 text-[#826c4f] placeholder:text-[#826c4f]/40"
                        />
                      </div>

                      <div className="flex gap-1.5 mt-1">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedRegalo(null);
                            setStatus(null);
                          }}
                          disabled={submitting}
                          className="flex-1 px-2 py-1 text-[10px] uppercase tracking-wider text-[#826c4f] bg-transparent hover:bg-[#826c4f]/10 border border-[#826c4f]/30 rounded font-bold transition-colors"
                        >
                          Cancelar
                        </button>
                        <button
                          type="submit"
                          disabled={
                            submitting || !nombre.trim() || !apellido.trim()
                          }
                          className="flex-1 px-2 py-1 text-[10px] uppercase tracking-wider text-white bg-[#826c4f] hover:bg-[#6e5a40] disabled:opacity-70 rounded font-bold flex justify-center items-center transition-colors"
                        >
                          {submitting ? (
                            <Loader2 size={12} className="animate-spin" />
                          ) : (
                            "Confirmar"
                          )}
                        </button>
                      </div>
                    </form>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {regalos.length === 0 && !loading && (
          <div className="text-center py-6">
            <p className="text-xs font-medium text-[#826c4f]/70">
              Aún no hay regalos en la lista.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
