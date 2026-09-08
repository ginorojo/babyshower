import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import type { Session } from "@supabase/supabase-js";
import {
  Lock,
  LogOut,
  Loader2,
  AlertCircle,
  RefreshCw,
  Save,
  Plus,
  Pencil,
  X,
  Trash2,
  Package,
  ClipboardList,
} from "lucide-react";

interface Regalo {
  id: string;
  nombre: string;
  categoria: string;
  orden: number;
  cantidad_total: number;
  cantidad_disponible: number;
}

interface Reserva {
  id: string;
  grupo_id: string;
  regalo_id: string;
  nombre_invitado: string;
  apellido_invitado: string;
  cantidad_reservada: number;
  created_at: string;
  regalos: { nombre: string; categoria: string } | null;
}

// Todos los regalos que una persona confirmó de una sola vez.
interface Grupo {
  grupo_id: string;
  invitado: string;
  fecha: string;
  items: Reserva[];
  unidades: number;
}

type Pestana = "reservas" | "regalos";

const MENSAJES_ERROR: Record<string, string> = {
  no_autorizado: "Tu cuenta no tiene permisos de administrador.",
  no_existe: "Ese regalo ya no existe. Actualiza la lista.",
  nombre_vacio: "El nombre y la categoría no pueden quedar vacíos.",
  cantidad_invalida: "La cantidad no es válida.",
};

export default function Admin() {
  const [session, setSession] = useState<Session | null>(null);
  const [esAdmin, setEsAdmin] = useState<boolean | null>(null);
  const [cargandoSesion, setCargandoSesion] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setCargandoSesion(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_evento, s) => {
      setSession(s);
      setEsAdmin(null); // se vuelve a comprobar con la sesión nueva
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  // Estar logueado no basta: hay que estar en la tabla `admins`.
  useEffect(() => {
    if (!session) {
      setEsAdmin(null);
      return;
    }
    let vigente = true;
    supabase.rpc("es_admin").then(({ data, error }) => {
      if (!vigente) return;
      if (error) {
        console.error("Error comprobando permisos:", error);
        setEsAdmin(false);
      } else {
        setEsAdmin(data === true);
      }
    });
    return () => {
      vigente = false;
    };
  }, [session]);

  if (cargandoSesion) {
    return <Centrado>{<Loader2 className="w-7 h-7 animate-spin" />}</Centrado>;
  }

  if (!session) return <Login />;

  if (esAdmin === null) {
    return (
      <Centrado>
        <Loader2 className="w-7 h-7 animate-spin" />
        <p className="text-sm mt-3">Comprobando permisos…</p>
      </Centrado>
    );
  }

  if (esAdmin === false) {
    return (
      <Centrado>
        <AlertCircle className="w-8 h-8 text-red-500" />
        <p className="text-sm mt-3 max-w-xs text-center">
          La cuenta <strong>{session.user.email}</strong> no tiene permisos de
          administrador.
        </p>
        <button
          onClick={() => supabase.auth.signOut()}
          className="mt-4 px-4 py-2 rounded-lg bg-[#826c4f] text-white text-[11px] uppercase font-bold tracking-widest cursor-pointer"
        >
          Salir
        </button>
      </Centrado>
    );
  }

  return <Panel email={session.user.email ?? ""} />;
}

// --- Contenedor centrado para los estados de carga / error ---
function Centrado({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-[60dvh] flex flex-col items-center justify-center text-[#826c4f]">
      {children}
    </div>
  );
}

// --- Pantalla de acceso ---
function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const entrar = async (e: React.FormEvent) => {
    e.preventDefault();
    setEnviando(true);
    setError(null);

    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (error) {
      setError(
        error.message === "Invalid login credentials"
          ? "Correo o contraseña incorrectos."
          : "No pudimos iniciar sesión. Intenta nuevamente.",
      );
      setEnviando(false);
    }
    // Si sale bien, onAuthStateChange se encarga de cambiar la pantalla.
  };

  return (
    <div className="min-h-[80dvh] flex items-center justify-center px-4">
      <form
        onSubmit={entrar}
        className="w-full max-w-sm bg-white border border-[#826c4f]/25 rounded-2xl shadow-sm p-6 flex flex-col gap-3"
      >
        <div className="flex flex-col items-center gap-2 mb-2">
          <span className="w-11 h-11 rounded-full bg-[#ebdcb9]/60 border border-[#826c4f]/20 flex items-center justify-center text-[#826c4f]">
            <Lock size={19} strokeWidth={1.8} />
          </span>
          <h1 className="text-3xl font-script lowercase text-[#826c4f]">
            panel de regalos
          </h1>
        </div>

        {error && (
          <div className="p-2.5 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2">
            <AlertCircle size={14} className="text-red-500 mt-0.5 shrink-0" />
            <p className="text-[11px] text-red-700 font-medium">{error}</p>
          </div>
        )}

        <input
          type="email"
          required
          autoComplete="username"
          placeholder="Correo"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="px-3 py-2 text-sm rounded-lg border border-[#826c4f]/25 focus:border-[#826c4f] outline-none bg-white text-[#826c4f] placeholder:text-[#826c4f]/40"
        />
        <input
          type="password"
          required
          autoComplete="current-password"
          placeholder="Contraseña"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="px-3 py-2 text-sm rounded-lg border border-[#826c4f]/25 focus:border-[#826c4f] outline-none bg-white text-[#826c4f] placeholder:text-[#826c4f]/40"
        />

        <button
          type="submit"
          disabled={enviando || !email.trim() || !password}
          className="mt-1 px-4 py-2.5 rounded-lg bg-[#826c4f] text-white text-[11px] uppercase font-bold tracking-widest hover:bg-[#6e5a40] disabled:opacity-60 disabled:cursor-not-allowed flex justify-center items-center transition-colors cursor-pointer"
        >
          {enviando ? <Loader2 size={14} className="animate-spin" /> : "Entrar"}
        </button>
      </form>
    </div>
  );
}

// --- Panel principal ---
function Panel({ email }: { email: string }) {
  const [pestana, setPestana] = useState<Pestana>("reservas");
  const [regalos, setRegalos] = useState<Regalo[]>([]);
  const [reservas, setReservas] = useState<Reserva[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const cargar = async () => {
    setCargando(true);
    setError(null);
    try {
      const [r1, r2] = await Promise.all([
        supabase
          .from("regalos")
          .select("*")
          .order("orden", { ascending: true }),
        supabase
          .from("reservas")
          .select("*, regalos(nombre, categoria)")
          .order("created_at", { ascending: false }),
      ]);

      if (r1.error) throw r1.error;
      if (r2.error) throw r2.error;

      setRegalos((r1.data as Regalo[]) ?? []);
      setReservas((r2.data as Reserva[]) ?? []);
    } catch (err) {
      console.error("Error cargando datos:", err);
      setError("No pudimos cargar los datos. Intenta actualizar.");
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    cargar();
  }, []);

  // Juntamos las reservas por grupo: cada grupo es lo que una persona
  // confirmó de una sola vez.
  const grupos = useMemo<Grupo[]>(() => {
    const mapa = new Map<string, Grupo>();
    for (const r of reservas) {
      const existente = mapa.get(r.grupo_id);
      if (existente) {
        existente.items.push(r);
        existente.unidades += r.cantidad_reservada;
      } else {
        mapa.set(r.grupo_id, {
          grupo_id: r.grupo_id,
          invitado: `${r.nombre_invitado} ${r.apellido_invitado}`.trim(),
          fecha: r.created_at,
          items: [r],
          unidades: r.cantidad_reservada,
        });
      }
    }
    return Array.from(mapa.values());
  }, [reservas]);

  const unidadesReservadas = useMemo(
    () => reservas.reduce((s, r) => s + r.cantidad_reservada, 0),
    [reservas],
  );

  const unidadesPendientes = useMemo(
    () => regalos.reduce((s, r) => s + r.cantidad_disponible, 0),
    [regalos],
  );

  return (
    <div className="w-full max-w-2xl mx-auto px-4 py-8">
      {/* Encabezado */}
      <div className="flex items-start justify-between gap-3 mb-5">
        <div className="min-w-0">
          <h1 className="text-4xl font-script lowercase text-[#826c4f] leading-none">
            panel de regalos
          </h1>
          <p className="text-[11px] text-[#826c4f]/70 font-medium mt-1 truncate">
            {email}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={cargar}
            disabled={cargando}
            title="Actualizar"
            className="w-9 h-9 flex items-center justify-center rounded-lg border border-[#826c4f]/25 bg-white text-[#826c4f] hover:bg-[#826c4f]/5 disabled:opacity-50 transition-colors cursor-pointer"
          >
            <RefreshCw size={15} className={cargando ? "animate-spin" : ""} />
          </button>
          <button
            onClick={() => supabase.auth.signOut()}
            title="Salir"
            className="w-9 h-9 flex items-center justify-center rounded-lg border border-[#826c4f]/25 bg-white text-[#826c4f] hover:bg-[#826c4f]/5 transition-colors cursor-pointer"
          >
            <LogOut size={15} />
          </button>
        </div>
      </div>

      {/* Resumen */}
      <div className="grid grid-cols-3 gap-2 mb-5">
        <Tarjeta valor={grupos.length} etiqueta="Personas" />
        <Tarjeta valor={unidadesReservadas} etiqueta="Regalados" />
        <Tarjeta valor={unidadesPendientes} etiqueta="Faltan" />
      </div>

      {/* Pestañas */}
      <div className="flex gap-2 mb-4">
        <BotonPestana
          activa={pestana === "reservas"}
          onClick={() => setPestana("reservas")}
          icono={<ClipboardList size={14} />}
          texto={`Reservas (${grupos.length})`}
        />
        <BotonPestana
          activa={pestana === "regalos"}
          onClick={() => setPestana("regalos")}
          icono={<Package size={14} />}
          texto={`Regalos (${regalos.length})`}
        />
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2">
          <AlertCircle size={15} className="text-red-500 mt-0.5 shrink-0" />
          <p className="text-xs text-red-700 font-medium">{error}</p>
        </div>
      )}

      {cargando ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-7 h-7 animate-spin text-[#826c4f]" />
        </div>
      ) : pestana === "reservas" ? (
        <Reservas grupos={grupos} onCambio={cargar} />
      ) : (
        <Regalos regalos={regalos} onCambio={cargar} />
      )}
    </div>
  );
}

function Tarjeta({ valor, etiqueta }: { valor: number; etiqueta: string }) {
  return (
    <div className="bg-white border border-[#826c4f]/25 rounded-xl px-3 py-2.5 text-center">
      <p className="text-2xl font-bold text-[#826c4f] tabular-nums leading-none">
        {valor}
      </p>
      <p className="text-[10px] uppercase tracking-wider font-bold text-[#826c4f]/60 mt-1">
        {etiqueta}
      </p>
    </div>
  );
}

function BotonPestana({
  activa,
  onClick,
  icono,
  texto,
}: {
  activa: boolean;
  onClick: () => void;
  icono: React.ReactNode;
  texto: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-[11px] uppercase font-bold tracking-wider transition-colors cursor-pointer border ${
        activa
          ? "bg-[#826c4f] text-white border-[#826c4f]"
          : "bg-white text-[#826c4f] border-[#826c4f]/25 hover:bg-[#826c4f]/5"
      }`}
    >
      {icono}
      {texto}
    </button>
  );
}

// --- Pestaña de reservas ---
function Reservas({
  grupos,
  onCambio,
}: {
  grupos: Grupo[];
  onCambio: () => Promise<void>;
}) {
  // Qué se está confirmando ahora mismo: "grupo:<id>" o "item:<id>".
  // Guardarlo en un solo estado evita que queden dos confirmaciones abiertas.
  const [confirmando, setConfirmando] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cancelar = async (
    funcion: "admin_cancelar_reserva" | "admin_cancelar_grupo",
    parametros: Record<string, string>,
  ) => {
    setOcupado(true);
    setError(null);
    try {
      const { data, error: rpcError } = await supabase.rpc(funcion, parametros);
      if (rpcError) throw rpcError;

      const res = data as { ok: boolean; motivo?: string };
      if (res?.ok) {
        setConfirmando(null);
        await onCambio();
        return;
      }
      setError(
        MENSAJES_ERROR[res?.motivo ?? ""] ?? "No pudimos cancelar la reserva.",
      );
    } catch (err) {
      console.error("Error cancelando:", err);
      setError("Ocurrió un error. Intenta nuevamente.");
    } finally {
      setOcupado(false);
    }
  };

  if (grupos.length === 0) {
    return (
      <div className="bg-white border border-[#826c4f]/25 rounded-xl py-10 text-center">
        <p className="text-sm text-[#826c4f]/70 font-medium">
          Todavía nadie ha reservado un regalo.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2">
          <AlertCircle size={15} className="text-red-500 mt-0.5 shrink-0" />
          <p className="text-xs text-red-700 font-medium">{error}</p>
        </div>
      )}

      {grupos.map((g) => (
        <div
          key={g.grupo_id}
          className="bg-white border border-[#826c4f]/25 rounded-xl overflow-hidden"
        >
          <div className="flex items-center justify-between gap-2 px-4 py-2.5 bg-[#ebdcb9]/30 border-b border-[#826c4f]/15">
            <div className="min-w-0">
              <p className="text-sm font-bold text-[#826c4f] truncate">
                {g.invitado}
              </p>
              <p className="text-[10px] uppercase tracking-wider font-bold text-[#826c4f]/60 mt-0.5">
                {new Date(g.fecha).toLocaleDateString("es-CL", {
                  day: "numeric",
                  month: "long",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </p>
            </div>

            {confirmando === `grupo:${g.grupo_id}` ? (
              <Confirmacion
                texto="¿Cancelar todo?"
                ocupado={ocupado}
                onNo={() => setConfirmando(null)}
                onSi={() =>
                  cancelar("admin_cancelar_grupo", { p_grupo_id: g.grupo_id })
                }
              />
            ) : (
              <div className="flex items-center gap-2 shrink-0">
                <span className="bg-[#826c4f] text-white text-[10px] font-bold rounded-full px-2 py-0.5">
                  {g.unidades}
                </span>
                <button
                  onClick={() => setConfirmando(`grupo:${g.grupo_id}`)}
                  title={`Cancelar todo lo de ${g.invitado}`}
                  className="w-7 h-7 flex items-center justify-center rounded-lg text-[#826c4f]/60 hover:text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            )}
          </div>

          <div>
            {g.items.map((item, i) => (
              <div
                key={item.id}
                className={`flex items-center justify-between gap-2 px-4 py-2 ${
                  i !== 0 ? "border-t border-[#826c4f]/10" : ""
                }`}
              >
                <span className="text-xs text-[#826c4f] font-medium leading-snug">
                  {item.regalos?.nombre ?? "(regalo eliminado)"}
                </span>

                {confirmando === `item:${item.id}` ? (
                  <Confirmacion
                    texto="¿Quitar?"
                    ocupado={ocupado}
                    onNo={() => setConfirmando(null)}
                    onSi={() =>
                      cancelar("admin_cancelar_reserva", { p_id: item.id })
                    }
                  />
                ) : (
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-xs font-bold text-[#826c4f] tabular-nums">
                      ×{item.cantidad_reservada}
                    </span>
                    {/* Solo tiene sentido quitar un regalo suelto si la persona
                        eligió varios; si es uno solo, se cancela el grupo. */}
                    {g.items.length > 1 && (
                      <button
                        onClick={() => setConfirmando(`item:${item.id}`)}
                        title="Quitar este regalo"
                        className="w-6 h-6 flex items-center justify-center rounded text-[#826c4f]/40 hover:text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
                      >
                        <X size={13} />
                      </button>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// --- Confirmación en línea para acciones que no se pueden deshacer ---
function Confirmacion({
  texto,
  ocupado,
  onNo,
  onSi,
}: {
  texto: string;
  ocupado: boolean;
  onNo: () => void;
  onSi: () => void;
}) {
  return (
    <div className="flex items-center gap-1.5 shrink-0">
      <span className="text-[10px] uppercase tracking-wider font-bold text-red-700">
        {texto}
      </span>
      <button
        onClick={onNo}
        disabled={ocupado}
        className="px-2 py-1 rounded text-[10px] uppercase font-bold tracking-wider border border-[#826c4f]/30 text-[#826c4f] hover:bg-[#826c4f]/5 transition-colors cursor-pointer"
      >
        No
      </button>
      <button
        onClick={onSi}
        disabled={ocupado}
        className="px-2 py-1 rounded text-[10px] uppercase font-bold tracking-wider bg-red-600 text-white hover:bg-red-700 disabled:opacity-60 flex items-center justify-center min-w-[32px] transition-colors cursor-pointer"
      >
        {ocupado ? <Loader2 size={11} className="animate-spin" /> : "Sí"}
      </button>
    </div>
  );
}

// --- Pestaña de regalos ---
function Regalos({
  regalos,
  onCambio,
}: {
  regalos: Regalo[];
  onCambio: () => Promise<void>;
}) {
  const [editando, setEditando] = useState<string | null>(null);
  const [agregando, setAgregando] = useState(false);

  const categorias = useMemo(
    () => Array.from(new Set(regalos.map((r) => r.categoria))),
    [regalos],
  );

  return (
    <div className="flex flex-col gap-3">
      {agregando ? (
        <FormularioRegalo
          categorias={categorias}
          onCancelar={() => setAgregando(false)}
          onGuardado={async () => {
            setAgregando(false);
            await onCambio();
          }}
        />
      ) : (
        <button
          onClick={() => setAgregando(true)}
          className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-dashed border-[#826c4f]/40 bg-white/60 text-[#826c4f] text-[11px] uppercase font-bold tracking-wider hover:bg-white transition-colors cursor-pointer"
        >
          <Plus size={15} />
          Agregar un regalo
        </button>
      )}

      {regalos.map((regalo) =>
        editando === regalo.id ? (
          <FormularioRegalo
            key={regalo.id}
            regalo={regalo}
            categorias={categorias}
            onCancelar={() => setEditando(null)}
            onGuardado={async () => {
              setEditando(null);
              await onCambio();
            }}
          />
        ) : (
          <FilaRegalo
            key={regalo.id}
            regalo={regalo}
            onEditar={() => setEditando(regalo.id)}
          />
        ),
      )}

      {regalos.length === 0 && (
        <div className="bg-white border border-[#826c4f]/25 rounded-xl py-10 text-center">
          <p className="text-sm text-[#826c4f]/70 font-medium">
            No hay regalos en la lista.
          </p>
        </div>
      )}
    </div>
  );
}

function FilaRegalo({
  regalo,
  onEditar,
}: {
  regalo: Regalo;
  onEditar: () => void;
}) {
  const reservado = regalo.cantidad_total - regalo.cantidad_disponible;
  const agotado = regalo.cantidad_disponible <= 0;

  return (
    <div className="bg-white border border-[#826c4f]/25 rounded-xl px-4 py-3 flex items-center gap-3">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-[#826c4f] leading-snug">
          {regalo.nombre}
        </p>
        <p className="text-[10px] uppercase tracking-wider font-bold text-[#826c4f]/60 mt-1">
          {regalo.categoria} · {reservado} de {regalo.cantidad_total} regalados
          {agotado && " · completo"}
        </p>
      </div>

      <button
        onClick={onEditar}
        title="Editar"
        className="shrink-0 w-8 h-8 flex items-center justify-center rounded-lg border border-[#826c4f]/25 text-[#826c4f] hover:bg-[#826c4f]/5 transition-colors cursor-pointer"
      >
        <Pencil size={14} />
      </button>
    </div>
  );
}

// --- Formulario para crear o editar un regalo ---
function FormularioRegalo({
  regalo,
  categorias,
  onCancelar,
  onGuardado,
}: {
  regalo?: Regalo;
  categorias: string[];
  onCancelar: () => void;
  onGuardado: () => Promise<void>;
}) {
  const esNuevo = !regalo;
  const [nombre, setNombre] = useState(regalo?.nombre ?? "");
  const [categoria, setCategoria] = useState(
    regalo?.categoria ?? categorias[0] ?? "",
  );
  const [cantidad, setCantidad] = useState(String(regalo?.cantidad_total ?? 1));
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Borrado: null = no se está borrando, "confirmar" = primera pregunta,
  // "forzar" = el regalo tenía reservas y pedimos una segunda confirmación.
  const [borrando, setBorrando] = useState<null | "confirmar" | "forzar">(null);
  const [reservasQueSePierden, setReservasQueSePierden] = useState(0);
  const [eliminando, setEliminando] = useState(false);

  const reservado = regalo ? regalo.cantidad_total - regalo.cantidad_disponible : 0;

  const eliminar = async (forzar: boolean) => {
    setEliminando(true);
    setError(null);
    try {
      const { data, error: rpcError } = await supabase.rpc(
        "admin_eliminar_regalo",
        { p_id: regalo!.id, p_forzar: forzar },
      );
      if (rpcError) throw rpcError;

      const res = data as { ok: boolean; motivo?: string; reservas?: number };

      if (res?.ok) {
        await onGuardado();
        return;
      }

      if (res?.motivo === "tiene_reservas") {
        setReservasQueSePierden(res.reservas ?? 0);
        setBorrando("forzar");
      } else {
        setError(
          MENSAJES_ERROR[res?.motivo ?? ""] ?? "No pudimos eliminar el regalo.",
        );
        setBorrando(null);
      }
    } catch (err) {
      console.error("Error eliminando el regalo:", err);
      setError("Ocurrió un error. Intenta nuevamente.");
      setBorrando(null);
    } finally {
      setEliminando(false);
    }
  };

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault();
    const total = Number(cantidad);

    if (!Number.isInteger(total) || total < (esNuevo ? 1 : 0)) {
      setError("Escribe una cantidad válida.");
      return;
    }
    if (!esNuevo && total < reservado) {
      setError(
        `No puedes dejar menos de ${reservado}: ya lo regalaron ${reservado} ${
          reservado === 1 ? "vez" : "veces"
        }.`,
      );
      return;
    }

    setGuardando(true);
    setError(null);

    try {
      const { data, error: rpcError } = esNuevo
        ? await supabase.rpc("admin_crear_regalo", {
            p_nombre: nombre.trim(),
            p_categoria: categoria.trim(),
            p_cantidad_total: total,
          })
        : await supabase.rpc("admin_guardar_regalo", {
            p_id: regalo!.id,
            p_nombre: nombre.trim(),
            p_categoria: categoria.trim(),
            p_cantidad_total: total,
          });

      if (rpcError) throw rpcError;

      const res = data as { ok: boolean; motivo?: string; reservado?: number };

      if (res?.ok) {
        await onGuardado();
        return;
      }

      if (res?.motivo === "menor_que_reservado") {
        setError(`No puedes dejar menos de ${res.reservado}: ya lo regalaron.`);
      } else {
        setError(
          MENSAJES_ERROR[res?.motivo ?? ""] ?? "No pudimos guardar el cambio.",
        );
      }
    } catch (err) {
      console.error("Error guardando el regalo:", err);
      setError("Ocurrió un error. Intenta nuevamente.");
    } finally {
      setGuardando(false);
    }
  };

  return (
    <form
      onSubmit={guardar}
      className="bg-white border-2 border-[#826c4f]/40 rounded-xl p-4 flex flex-col gap-2.5"
    >
      <div className="flex items-center justify-between">
        <p className="text-[11px] uppercase tracking-wider font-bold text-[#826c4f]">
          {esNuevo ? "Regalo nuevo" : "Editar regalo"}
        </p>
        <button
          type="button"
          onClick={onCancelar}
          aria-label="Cancelar"
          className="text-[#826c4f]/60 hover:text-[#826c4f] transition-colors cursor-pointer"
        >
          <X size={16} />
        </button>
      </div>

      {error && (
        <div className="p-2.5 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2">
          <AlertCircle size={14} className="text-red-500 mt-0.5 shrink-0" />
          <p className="text-[11px] text-red-700 font-medium leading-snug">
            {error}
          </p>
        </div>
      )}

      <label className="flex flex-col gap-1">
        <span className="text-[10px] uppercase tracking-wider font-bold text-[#826c4f]/60">
          Nombre
        </span>
        <input
          type="text"
          required
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          placeholder="Ej: Pañales talla M"
          className="px-3 py-2 text-sm rounded-lg border border-[#826c4f]/25 focus:border-[#826c4f] outline-none bg-white text-[#826c4f] placeholder:text-[#826c4f]/40"
        />
      </label>

      <div className="flex gap-2">
        <label className="flex-1 flex flex-col gap-1 min-w-0">
          <span className="text-[10px] uppercase tracking-wider font-bold text-[#826c4f]/60">
            Categoría
          </span>
          <input
            type="text"
            required
            list="categorias-existentes"
            value={categoria}
            onChange={(e) => setCategoria(e.target.value)}
            className="px-3 py-2 text-sm rounded-lg border border-[#826c4f]/25 focus:border-[#826c4f] outline-none bg-white text-[#826c4f]"
          />
          <datalist id="categorias-existentes">
            {categorias.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </label>

        <label className="w-24 shrink-0 flex flex-col gap-1">
          <span className="text-[10px] uppercase tracking-wider font-bold text-[#826c4f]/60">
            Cantidad
          </span>
          <input
            type="number"
            required
            // Dejamos min en 0 a propósito: si el navegador bloquea el envío
            // con su propio aviso, no alcanza a salir nuestro mensaje, que
            // explica cuántos ya se regalaron.
            min={0}
            step={1}
            value={cantidad}
            onChange={(e) => setCantidad(e.target.value)}
            className="px-3 py-2 text-sm rounded-lg border border-[#826c4f]/25 focus:border-[#826c4f] outline-none bg-white text-[#826c4f] tabular-nums"
          />
        </label>
      </div>

      {!esNuevo && reservado > 0 && (
        <p className="text-[10px] text-[#826c4f]/60 font-medium leading-snug">
          Ya lo regalaron {reservado}{" "}
          {reservado === 1 ? "vez" : "veces"}, así que la cantidad no puede
          bajar de ahí. Si subes el total, la diferencia vuelve a quedar
          disponible.
        </p>
      )}

      <div className="flex gap-2 mt-1">
        <button
          type="button"
          onClick={onCancelar}
          disabled={guardando}
          className="flex-1 px-3 py-2 rounded-lg border border-[#826c4f]/30 text-[#826c4f] text-[11px] uppercase font-bold tracking-wider hover:bg-[#826c4f]/5 transition-colors cursor-pointer"
        >
          Cancelar
        </button>
        <button
          type="submit"
          disabled={guardando || !nombre.trim() || !categoria.trim()}
          className="flex-1 px-3 py-2 rounded-lg bg-[#826c4f] text-white text-[11px] uppercase font-bold tracking-wider hover:bg-[#6e5a40] disabled:opacity-60 disabled:cursor-not-allowed flex justify-center items-center gap-1.5 transition-colors cursor-pointer"
        >
          {guardando ? (
            <Loader2 size={13} className="animate-spin" />
          ) : (
            <>
              {esNuevo ? <Plus size={13} /> : <Save size={13} />}
              {esNuevo ? "Agregar" : "Guardar"}
            </>
          )}
        </button>
      </div>

      {/* Eliminar: solo al editar, y siempre detrás de una confirmación */}
      {!esNuevo && (
        <div className="mt-1 pt-3 border-t border-[#826c4f]/15">
          {borrando === null && (
            <button
              type="button"
              onClick={() => setBorrando("confirmar")}
              className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-[11px] uppercase font-bold tracking-wider text-red-700 hover:bg-red-50 transition-colors cursor-pointer"
            >
              <Trash2 size={13} />
              Eliminar este regalo
            </button>
          )}

          {borrando === "confirmar" && (
            <div className="flex flex-col gap-2">
              <p className="text-[11px] text-[#826c4f] font-medium text-center">
                ¿Eliminar <strong>{regalo!.nombre}</strong> de la lista?
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setBorrando(null)}
                  disabled={eliminando}
                  className="flex-1 px-3 py-2 rounded-lg border border-[#826c4f]/30 text-[#826c4f] text-[11px] uppercase font-bold tracking-wider hover:bg-[#826c4f]/5 transition-colors cursor-pointer"
                >
                  No
                </button>
                <button
                  type="button"
                  onClick={() => eliminar(false)}
                  disabled={eliminando}
                  className="flex-1 px-3 py-2 rounded-lg bg-red-600 text-white text-[11px] uppercase font-bold tracking-wider hover:bg-red-700 disabled:opacity-60 flex justify-center items-center transition-colors cursor-pointer"
                >
                  {eliminando ? (
                    <Loader2 size={13} className="animate-spin" />
                  ) : (
                    "Sí, eliminar"
                  )}
                </button>
              </div>
            </div>
          )}

          {borrando === "forzar" && (
            <div className="flex flex-col gap-2">
              <div className="p-2.5 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2">
                <AlertCircle
                  size={14}
                  className="text-red-500 mt-0.5 shrink-0"
                />
                <p className="text-[11px] text-red-700 font-medium leading-snug">
                  Este regalo ya lo reservaron. Si lo eliminas también se{" "}
                  {reservasQueSePierden === 1
                    ? "borra esa reserva"
                    : `borran esas ${reservasQueSePierden} reservas`}{" "}
                  y perderás el registro de quién lo regaló. Esto no se puede
                  deshacer.
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setBorrando(null)}
                  disabled={eliminando}
                  className="flex-1 px-3 py-2 rounded-lg border border-[#826c4f]/30 text-[#826c4f] text-[11px] uppercase font-bold tracking-wider hover:bg-[#826c4f]/5 transition-colors cursor-pointer"
                >
                  Mejor no
                </button>
                <button
                  type="button"
                  onClick={() => eliminar(true)}
                  disabled={eliminando}
                  className="flex-1 px-3 py-2 rounded-lg bg-red-600 text-white text-[11px] uppercase font-bold tracking-wider hover:bg-red-700 disabled:opacity-60 flex justify-center items-center transition-colors cursor-pointer"
                >
                  {eliminando ? (
                    <Loader2 size={13} className="animate-spin" />
                  ) : (
                    "Eliminar igual"
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </form>
  );
}
