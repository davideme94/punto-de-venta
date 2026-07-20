"use client";

import { useEffect, useMemo, useState } from "react";

import AdminNavigation from "@/components/admin-navigation/AdminNavigation";

import styles from "./closing.module.css";

type PhysicalSession = {
  id: string;
  registerId: string;
  registerCode: string;
  registerName: string;
  responsibleUserId: string;
  responsibleUsername: string;
  responsibleName: string;
  businessDate: string;
  openedAt: string;
  openedByName: string;
  confirmationStatus: string;
  openingAmount: number;
  cashierConfirmedAmount: number | null;
  cashSales: number;
  transferSales: number;
  cardSales: number;
  totalSales: number;
  quiniela: number;
  withdrawalsFromPhysical: number;
  withdrawalCommissions: number;
  expectedClosingAmount: number;
};

type VirtualSession = {
  id: string;
  virtualAccountId: string;
  virtualAccountCode: string;
  virtualAccountName: string;
  businessDate: string;
  openedAt: string;
  openedByName: string;
  openingBalance: number;
  services: number;
  transferSales: number;
  cardSales: number;
  digitalSales: number;
  withdrawalTransfers: number;
  withdrawalsFromVirtual: number;
  withdrawalsFromPhysical: number;
  withdrawalCommissions: number;
  expectedClosingBalance: number;
};

type CashOperationSummary = {
  services: number;
  quiniela: number;
  total: number;
};

type WithdrawalSummary = {
  fromPhysicalRegisters: number;
  fromVirtualAccount: number;
  totalWithdrawalAmount: number;
  totalTransferred: number;
  totalCommission: number;
};

type DigitalSummary = {
  transferSales: number;
  cardSales: number;
  businessDigitalSales: number;
  withdrawalTransfers: number;
  totalDigitalReceived: number;
  withdrawalCommissions: number;
};

type ClosingDataResponse = {
  admin?: {
    id: string;
    username: string;
    displayName: string;
    role: string;
  };
  hasOpenDay?: boolean;
  businessDate?: string | null;
  hasDateMismatch?: boolean;
  physicalSessions?: PhysicalSession[];
  virtualSession?: VirtualSession | null;
  cashOperationSummary?: CashOperationSummary;
  withdrawalSummary?: WithdrawalSummary;
  digitalSummary?: DigitalSummary;
  error?: string;
};

type ClosedPhysicalSummary = {
  sessionId: string;
  registerName: string;
  responsibleName: string;
  openingAmount: number;
  cashSales: number;
  quiniela: number;
  withdrawals: number;
  expectedAmount: number;
  countedAmount: number;
  difference: number;
};

type ClosedVirtualSummary = {
  sessionId: string;
  accountName: string;
  openingBalance: number;
  services: number;
  withdrawalsFromVirtual: number;
  digitalSales: number;
  withdrawalTransfers: number;
  commission: number;
  expectedBalance: number;
  countedBalance: number;
  difference: number;
};

type ClosingResponse = {
  message?: string;
  businessDate?: string | null;
  physicalClosings?: ClosedPhysicalSummary[];
  virtualClosing?: ClosedVirtualSummary | null;
  cashOperationSummary?: CashOperationSummary;
  withdrawalSummary?: WithdrawalSummary;
  digitalSummary?: DigitalSummary;
  error?: string;
};

function formatMoney(value: number): string {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value);
}

function parseMoney(value: string): number {
  const normalized = value
    .replace(/\$/g, "")
    .replace(/\s/g, "")
    .replace(/\./g, "")
    .replace(",", ".");

  return Number(normalized);
}

function formatBusinessDate(value: string | null | undefined): string {
  if (!value) {
    return "Sin fecha";
  }

  const parts = value.split("-");

  if (parts.length !== 3) {
    return value;
  }

  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

export default function RegisterClosingPage() {
  const [closingData, setClosingData] =
    useState<ClosingDataResponse | null>(null);

  const [countedPhysical, setCountedPhysical] = useState<
    Record<string, string>
  >({});

  const [physicalNotes, setPhysicalNotes] = useState<Record<string, string>>(
    {},
  );

  const [countedVirtual, setCountedVirtual] = useState("");
  const [virtualNotes, setVirtualNotes] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isClosing, setIsClosing] = useState(false);
  const [message, setMessage] = useState(
    "Cargando información del cierre...",
  );
  const [closingResult, setClosingResult] =
    useState<ClosingResponse | null>(null);

  useEffect(() => {
    void loadClosingData();
  }, []);

  async function loadClosingData() {
    setIsLoading(true);
    setClosingResult(null);
    setMessage("Calculando cajas, servicios, quiniela y extracciones...");

    try {
      const response = await fetch("/api/registers/closing", {
        method: "GET",
        cache: "no-store",
        credentials: "include",
      });

      const data = (await response.json()) as ClosingDataResponse;

      if (!response.ok) {
        throw new Error(data.error || "No se pudo cargar el cierre.");
      }

      setClosingData(data);
      setCountedPhysical({});
      setPhysicalNotes({});
      setCountedVirtual("");
      setVirtualNotes("");

      if (!data.hasOpenDay) {
        setMessage("No hay una jornada abierta para cerrar.");
      } else if (data.hasDateMismatch) {
        setMessage("Las cajas abiertas tienen fechas comerciales diferentes.");
      } else {
        setMessage(
          "Contá el efectivo real de las dos cajas físicas y de la Caja Virtual.",
        );
      }
    } catch (error) {
      console.error("Error al cargar cierre:", error);
      setClosingData(null);
      setMessage(
        error instanceof Error
          ? error.message
          : "No se pudo cargar el cierre.",
      );
    } finally {
      setIsLoading(false);
    }
  }

  const physicalDifferences = useMemo(() => {
    const differences: Record<string, number | null> = {};

    for (const session of closingData?.physicalSessions ?? []) {
      const rawValue = countedPhysical[session.id];

      if (rawValue === undefined || rawValue.trim() === "") {
        differences[session.id] = null;
        continue;
      }

      const counted = parseMoney(rawValue);

      differences[session.id] = Number.isFinite(counted)
        ? counted - session.expectedClosingAmount
        : null;
    }

    return differences;
  }, [closingData, countedPhysical]);

  const virtualDifference = useMemo(() => {
    const virtualSession = closingData?.virtualSession;

    if (!virtualSession || !countedVirtual.trim()) {
      return null;
    }

    const counted = parseMoney(countedVirtual);

    if (!Number.isFinite(counted)) {
      return null;
    }

    return counted - virtualSession.expectedClosingBalance;
  }, [closingData, countedVirtual]);

  const canSubmit = useMemo(() => {
    if (
      isLoading ||
      isClosing ||
      !closingData?.hasOpenDay ||
      closingData.hasDateMismatch
    ) {
      return false;
    }

    const allPhysicalAmountsValid = (
      closingData.physicalSessions ?? []
    ).every((session) => {
      const rawValue = countedPhysical[session.id];

      if (rawValue === undefined || rawValue.trim() === "") {
        return false;
      }

      const counted = parseMoney(rawValue);
      return Number.isFinite(counted) && counted >= 0;
    });

    if (!allPhysicalAmountsValid) {
      return false;
    }

    if (closingData.virtualSession) {
      if (!countedVirtual.trim()) {
        return false;
      }

      const counted = parseMoney(countedVirtual);

      if (!Number.isFinite(counted) || counted < 0) {
        return false;
      }
    }

    return true;
  }, [
    isLoading,
    isClosing,
    closingData,
    countedPhysical,
    countedVirtual,
  ]);

  async function handleCloseDay() {
    if (!canSubmit) {
      setMessage("Completá todos los importes contados antes de cerrar.");
      return;
    }

    const confirmed = window.confirm(
      "¿Confirmás el cierre completo? Se cerrarán las dos cajas físicas, la Caja Virtual y las sesiones de las cajeras.",
    );

    if (!confirmed) {
      return;
    }

    setIsClosing(true);
    setMessage("Cerrando la jornada y bloqueando las sesiones de las cajeras...");

    try {
      const response = await fetch("/api/registers/closing", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({
          physicalClosings: (closingData?.physicalSessions ?? []).map(
            (session) => ({
              sessionId: session.id,
              countedAmount: parseMoney(countedPhysical[session.id]),
              notes: physicalNotes[session.id] ?? "",
            }),
          ),
          virtualClosing: closingData?.virtualSession
            ? {
                sessionId: closingData.virtualSession.id,
                countedBalance: parseMoney(countedVirtual),
                notes: virtualNotes,
              }
            : null,
        }),
      });

      const data = (await response.json()) as ClosingResponse;

      if (!response.ok) {
        throw new Error(data.error || "No se pudo cerrar la jornada.");
      }

      setClosingResult(data);
      setClosingData(null);
      setMessage(data.message || "La jornada fue cerrada correctamente.");
    } catch (error) {
      console.error("Error al cerrar jornada:", error);
      setMessage(
        error instanceof Error
          ? error.message
          : "No se pudo cerrar la jornada.",
      );
    } finally {
      setIsClosing(false);
    }
  }

  function renderDifference(difference: number | null) {
    if (difference === null) {
      return (
        <div
          className={`${styles.differenceBox} ${styles.differenceNeutral}`}
        >
          Ingresá el importe contado
        </div>
      );
    }

    if (Math.abs(difference) < 0.009) {
      return (
        <div
          className={`${styles.differenceBox} ${styles.differenceCorrect}`}
        >
          Sin diferencia
        </div>
      );
    }

    if (difference > 0) {
      return (
        <div
          className={`${styles.differenceBox} ${styles.differencePositive}`}
        >
          Sobrante: {formatMoney(difference)}
        </div>
      );
    }

    return (
      <div
        className={`${styles.differenceBox} ${styles.differenceNegative}`}
      >
        Faltante: {formatMoney(Math.abs(difference))}
      </div>
    );
  }

  if (isLoading) {
    return (
      <main className={styles.page}>
        <AdminNavigation />

        <section className={styles.loadingCard}>
          <div>🧮</div>
          <h1>Calculando cierre</h1>
          <p>Revisando ventas, servicios, quiniela y extracciones...</p>
        </section>
      </main>
    );
  }

  if (closingResult) {
    return (
      <main className={styles.page}>
        <AdminNavigation />

        <section className={styles.shell}>
          <section className={styles.successCard}>
            <div className={styles.successIcon}>✓</div>
            <p className={styles.eyebrow}>JORNADA FINALIZADA</p>
            <h1>Cierre realizado</h1>
            <p>{message}</p>

            <div className={styles.successGrid}>
              {closingResult.physicalClosings?.map((closing) => (
                <article key={closing.sessionId} className={styles.successItem}>
                  <strong>{closing.registerName}</strong>
                  <span>{closing.responsibleName}</span>
                  <p>Inicial: {formatMoney(closing.openingAmount)}</p>
                  <p>
                    Ventas en efectivo: +{formatMoney(closing.cashSales)}
                  </p>
                  <p>Quiniela: +{formatMoney(closing.quiniela)}</p>
                  <p>Extracciones: −{formatMoney(closing.withdrawals)}</p>
                  <p>Esperado: {formatMoney(closing.expectedAmount)}</p>
                  <p>Contado: {formatMoney(closing.countedAmount)}</p>
                  <p>Diferencia: {formatMoney(closing.difference)}</p>
                </article>
              ))}

              {closingResult.virtualClosing && (
                <article className={styles.successItem}>
                  <strong>{closingResult.virtualClosing.accountName}</strong>
                  <span>Caja física de Servicios y Boletas</span>
                  <p>
                    Inicial: {formatMoney(
                      closingResult.virtualClosing.openingBalance,
                    )}
                  </p>
                  <p>
                    Servicios y Boletas: +{formatMoney(
                      closingResult.virtualClosing.services,
                    )}
                  </p>
                  <p>
                    Extracciones: −{formatMoney(
                      closingResult.virtualClosing.withdrawalsFromVirtual,
                    )}
                  </p>
                  <p>
                    Esperado: {formatMoney(
                      closingResult.virtualClosing.expectedBalance,
                    )}
                  </p>
                  <p>
                    Contado: {formatMoney(
                      closingResult.virtualClosing.countedBalance,
                    )}
                  </p>
                  <p>
                    Diferencia: {formatMoney(
                      closingResult.virtualClosing.difference,
                    )}
                  </p>
                </article>
              )}
            </div>

            {closingResult.digitalSummary && (
              <section className={styles.section}>
                <p className={styles.eyebrow}>MOVIMIENTOS DIGITALES</p>
                <div className={styles.metrics}>
                  <div className={styles.metric}>
                    <span>Ventas por transferencia</span>
                    <strong>
                      {formatMoney(closingResult.digitalSummary.transferSales)}
                    </strong>
                  </div>
                  <div className={styles.metric}>
                    <span>Ventas con tarjeta</span>
                    <strong>
                      {formatMoney(closingResult.digitalSummary.cardSales)}
                    </strong>
                  </div>
                  <div className={styles.metric}>
                    <span>Transferencias por extracciones</span>
                    <strong>
                      {formatMoney(
                        closingResult.digitalSummary.withdrawalTransfers,
                      )}
                    </strong>
                  </div>
                  <div className={`${styles.metric} ${styles.expectedMetric}`}>
                    <span>Total digital recibido</span>
                    <strong>
                      {formatMoney(
                        closingResult.digitalSummary.totalDigitalReceived,
                      )}
                    </strong>
                  </div>
                </div>
              </section>
            )}

          </section>
        </section>
      </main>
    );
  }

  if (!closingData?.hasOpenDay) {
    return (
      <main className={styles.page}>
        <AdminNavigation />

        <section className={styles.shell}>
          <section className={styles.emptyState}>
            <div>🔒</div>
            <h1>No hay jornada abierta</h1>
            <p>No existen cajas abiertas para cerrar.</p>
          </section>
        </section>
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <AdminNavigation />

      <section className={styles.shell}>
        <header className={styles.header}>
          <div>
            <p className={styles.eyebrow}>CIERRE ADMINISTRATIVO</p>
            <h1 className={styles.title}>Cierre de jornada</h1>
            <p className={styles.subtitle}>
              Fecha comercial: {" "}
              <strong>{formatBusinessDate(closingData.businessDate)}</strong>
            </p>
          </div>

          <div className={styles.adminBox}>
            <span>Administrador</span>
            <strong>{closingData.admin?.displayName ?? "Administrador"}</strong>
          </div>
        </header>

        <div className={styles.message}>{message}</div>

        {closingData.hasDateMismatch && (
          <div className={styles.warning}>
            Las cajas tienen fechas comerciales diferentes. El cierre está
            bloqueado.
          </div>
        )}

        <section className={styles.section}>
          <header className={styles.sectionHeader}>
            <div>
              <p className={styles.eyebrow}>RESUMEN DEL DÍA</p>
              <h2 className={styles.sectionTitle}>Operaciones especiales</h2>
              <p className={styles.sectionDescription}>
                Servicios y Boletas ingresan en la Caja Virtual. Quiniela
                ingresa en la caja física de la cajera.
              </p>
            </div>
          </header>

          <div className={styles.metrics}>
            <div className={styles.metric}>
              <span>Servicios y Boletas</span>
              <strong>
                {formatMoney(closingData.cashOperationSummary?.services ?? 0)}
              </strong>
            </div>
            <div className={styles.metric}>
              <span>Quiniela</span>
              <strong>
                {formatMoney(closingData.cashOperationSummary?.quiniela ?? 0)}
              </strong>
            </div>
            <div className={`${styles.metric} ${styles.expectedMetric}`}>
              <span>Total de operaciones especiales</span>
              <strong>
                {formatMoney(closingData.cashOperationSummary?.total ?? 0)}
              </strong>
            </div>
          </div>
        </section>

        <section className={styles.section}>
          <header className={styles.sectionHeader}>
            <div>
              <p className={styles.eyebrow}>EXTRACCIONES</p>
              <h2 className={styles.sectionTitle}>Resumen de retiros</h2>
              <p className={styles.sectionDescription}>
                El cliente recibe efectivo y realiza una transferencia con el
                5% de comisión incluido.
              </p>
            </div>
          </header>

          <div className={styles.metrics}>
            <div className={styles.metric}>
              <span>Desde cajas físicas</span>
              <strong>
                {formatMoney(
                  closingData.withdrawalSummary?.fromPhysicalRegisters ?? 0,
                )}
              </strong>
            </div>
            <div className={styles.metric}>
              <span>Desde Caja Virtual</span>
              <strong>
                {formatMoney(
                  closingData.withdrawalSummary?.fromVirtualAccount ?? 0,
                )}
              </strong>
            </div>
            <div className={styles.metric}>
              <span>Total de efectivo entregado</span>
              <strong>
                {formatMoney(
                  closingData.withdrawalSummary?.totalWithdrawalAmount ?? 0,
                )}
              </strong>
            </div>
            <div className={styles.metric}>
              <span>Total transferido por clientes</span>
              <strong>
                {formatMoney(
                  closingData.withdrawalSummary?.totalTransferred ?? 0,
                )}
              </strong>
            </div>
            <div className={`${styles.metric} ${styles.expectedMetric}`}>
              <span>Ganancia por comisiones</span>
              <strong>
                {formatMoney(
                  closingData.withdrawalSummary?.totalCommission ?? 0,
                )}
              </strong>
            </div>
          </div>
        </section>

        <section className={styles.section}>
          <header className={styles.sectionHeader}>
            <div>
              <p className={styles.eyebrow}>MOVIMIENTOS DIGITALES</p>
              <h2 className={styles.sectionTitle}>Dinero recibido digitalmente</h2>
              <p className={styles.sectionDescription}>
                Este resumen es informativo y no se suma al efectivo contado de
                la Caja Virtual.
              </p>
            </div>
          </header>

          <div className={styles.metrics}>
            <div className={styles.metric}>
              <span>Ventas por transferencia</span>
              <strong>
                {formatMoney(closingData.digitalSummary?.transferSales ?? 0)}
              </strong>
            </div>
            <div className={styles.metric}>
              <span>Ventas con tarjeta</span>
              <strong>
                {formatMoney(closingData.digitalSummary?.cardSales ?? 0)}
              </strong>
            </div>
            <div className={styles.metric}>
              <span>Transferencias por extracciones</span>
              <strong>
                {formatMoney(
                  closingData.digitalSummary?.withdrawalTransfers ?? 0,
                )}
              </strong>
            </div>
            <div className={`${styles.metric} ${styles.expectedMetric}`}>
              <span>Total digital recibido</span>
              <strong>
                {formatMoney(
                  closingData.digitalSummary?.totalDigitalReceived ?? 0,
                )}
              </strong>
            </div>
          </div>
        </section>

        <section className={styles.section}>
          <header className={styles.sectionHeader}>
            <div>
              <p className={styles.eyebrow}>EFECTIVO</p>
              <h2 className={styles.sectionTitle}>Cajas físicas</h2>
              <p className={styles.sectionDescription}>
                Fórmula: inicial + ventas en efectivo + Quiniela − extracciones.
              </p>
            </div>
          </header>

          <div className={styles.cardsGrid}>
            {closingData.physicalSessions?.map((session) => (
              <article key={session.id} className={styles.registerCard}>
                <div className={styles.cardTop}>
                  <div>
                    <span className={styles.badge}>{session.registerCode}</span>
                    <h3>{session.registerName}</h3>
                    <p className={styles.cashier}>
                      Responsable: <strong>{session.responsibleName}</strong>
                    </p>
                  </div>
                  <span className={styles.statusBadge}>
                    {session.confirmationStatus}
                  </span>
                </div>

                <div className={styles.metrics}>
                  <div className={styles.metric}>
                    <span>Efectivo inicial</span>
                    <strong>{formatMoney(session.openingAmount)}</strong>
                  </div>
                  <div className={styles.metric}>
                    <span>Ventas en efectivo</span>
                    <strong>+ {formatMoney(session.cashSales)}</strong>
                  </div>
                  <div className={styles.metric}>
                    <span>Quiniela</span>
                    <strong>+ {formatMoney(session.quiniela)}</strong>
                  </div>
                  <div className={styles.metric}>
                    <span>Extracciones entregadas</span>
                    <strong>− {formatMoney(session.withdrawalsFromPhysical)}</strong>
                  </div>
                  <div className={`${styles.metric} ${styles.expectedMetric}`}>
                    <span>Efectivo esperado</span>
                    <strong>{formatMoney(session.expectedClosingAmount)}</strong>
                  </div>
                </div>

                <label className={styles.field}>
                  <span>Efectivo contado por el administrador</span>
                  <input
                    className={styles.input}
                    value={countedPhysical[session.id] ?? ""}
                    onChange={(event) =>
                      setCountedPhysical((current) => ({
                        ...current,
                        [session.id]: event.target.value,
                      }))
                    }
                    placeholder="Ejemplo: 125000"
                    inputMode="decimal"
                  />
                </label>

                {renderDifference(physicalDifferences[session.id] ?? null)}

                <label className={styles.field}>
                  <span>Observación opcional</span>
                  <textarea
                    className={styles.notes}
                    value={physicalNotes[session.id] ?? ""}
                    onChange={(event) =>
                      setPhysicalNotes((current) => ({
                        ...current,
                        [session.id]: event.target.value,
                      }))
                    }
                    placeholder="Detalle de faltante, sobrante o novedad"
                  />
                </label>
              </article>
            ))}
          </div>
        </section>

        {closingData.virtualSession && (
          <section className={styles.section}>
            <header className={styles.sectionHeader}>
              <div>
                <p className={styles.eyebrow}>CAJA VIRTUAL FÍSICA</p>
                <h2 className={styles.sectionTitle}>Servicios y Boletas</h2>
                <p className={styles.sectionDescription}>
                  Fórmula: efectivo inicial + Servicios y Boletas − extracciones
                  entregadas desde esta caja.
                </p>
              </div>
            </header>

            <article className={styles.virtualCard}>
              <div className={styles.cardTop}>
                <div>
                  <span className={styles.badge}>
                    {closingData.virtualSession.virtualAccountCode}
                  </span>
                  <h3>{closingData.virtualSession.virtualAccountName}</h3>
                  <p className={styles.cashier}>
                    Caja física compartida para Servicios y Boletas
                  </p>
                </div>
                <span className={styles.statusBadge}>ABIERTA</span>
              </div>

              <div className={styles.metrics}>
                <div className={styles.metric}>
                  <span>Efectivo inicial</span>
                  <strong>
                    {formatMoney(closingData.virtualSession.openingBalance)}
                  </strong>
                </div>
                <div className={styles.metric}>
                  <span>Servicios y Boletas</span>
                  <strong>
                    + {formatMoney(closingData.virtualSession.services)}
                  </strong>
                </div>
                <div className={styles.metric}>
                  <span>Extracciones entregadas</span>
                  <strong>
                    − {formatMoney(
                      closingData.virtualSession.withdrawalsFromVirtual,
                    )}
                  </strong>
                </div>
                <div className={`${styles.metric} ${styles.expectedMetric}`}>
                  <span>Efectivo esperado</span>
                  <strong>
                    {formatMoney(
                      closingData.virtualSession.expectedClosingBalance,
                    )}
                  </strong>
                </div>
              </div>

              <label className={styles.field}>
                <span>Efectivo real contado por el administrador</span>
                <input
                  className={styles.input}
                  value={countedVirtual}
                  onChange={(event) => setCountedVirtual(event.target.value)}
                  placeholder="Ejemplo: 85000"
                  inputMode="decimal"
                />
              </label>

              {renderDifference(virtualDifference)}

              <label className={styles.field}>
                <span>Observación opcional</span>
                <textarea
                  className={styles.notes}
                  value={virtualNotes}
                  onChange={(event) => setVirtualNotes(event.target.value)}
                  placeholder="Detalle del efectivo de Servicios y Boletas"
                />
              </label>
            </article>
          </section>
        )}

        <footer className={styles.footerActions}>
          <button
            type="button"
            className={styles.secondaryButton}
            onClick={() => void loadClosingData()}
            disabled={isClosing}
          >
            Actualizar cálculos
          </button>
          <button
            type="button"
            className={styles.closeButton}
            onClick={() => void handleCloseDay()}
            disabled={!canSubmit}
          >
            {isClosing
              ? "Cerrando jornada..."
              : "Cerrar todas las cajas y finalizar jornada"}
          </button>
        </footer>
      </section>
    </main>
  );
}
