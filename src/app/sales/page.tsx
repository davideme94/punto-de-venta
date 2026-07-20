"use client";

import {
  type FormEvent,
  useEffect,
  useMemo,
  useState,
} from "react";

import AdminNavigation from "@/components/admin-navigation/AdminNavigation";

import styles from "./sales.module.css";

type PaymentMethod =
  | "EFECTIVO"
  | "TRANSFERENCIA"
  | "TARJETA"
  | "MIXTO";

type OperationType =
  | "VENTA"
  | "SERVICIO"
  | "QUINIELA"
  | "EXTRACCION";

type OperationTypeFilter = "TODOS" | OperationType;

type OperationSource =
  | "SALE"
  | "CASH_BOX_OPERATION"
  | "CASH_WITHDRAWAL";

type OperationStatus = "COMPLETADA" | "ANULADA";
type StatusFilter = "TODOS" | OperationStatus;
type PaymentFilter = "TODOS" | PaymentMethod;
type CashMovement = "ENTRADA" | "SALIDA";
type CashLocation = "CAJA_FISICA" | "CAJA_VIRTUAL";

type PeriodPreset =
  | "HOY"
  | "AYER"
  | "SEMANA"
  | "MES"
  | "PERSONALIZADO";

type ReportFilters = {
  from: string;
  to: string;
  type: OperationTypeFilter;
  user: string;
  status: StatusFilter;
  payment: PaymentFilter;
};

type ReportPeriod = {
  from: string;
  to: string;
  days: number;
};

type OperationsSummary = {
  operationCount: number;
  saleCount: number;
  serviceCount: number;
  quinielaCount: number;
  withdrawalCount: number;
  totalSold: number;
  totalCost: number;
  saleProfit: number;
  servicesTotal: number;
  quinielaTotal: number;
  withdrawalsTotal: number;
  withdrawalTransfersTotal: number;
  withdrawalCommissions: number;
  cashSalesTotal: number;
  transferSalesTotal: number;
  cardSalesTotal: number;
  cashInTotal: number;
  cashOutTotal: number;
  totalProfit: number;
  averageTicket: number;
  averagePerDay: number;
  averageSalesPerDay: number;
};

type OperationReport = {
  id: string;
  source: OperationSource;
  operationType: OperationType;
  operationNumber: number;
  paymentMethod: PaymentMethod;
  status: OperationStatus;
  createdBy: string;
  createdAt: string;
  description: string | null;
  reference: string | null;
  notes: string | null;
  amount: number;
  costTotal: number;
  profit: number;
  cashAmount: number;
  transferAmount: number;
  cardAmount: number;
  commission: number;
  itemCount: number;
  cashMovement: CashMovement | null;
  cashLocation: CashLocation | null;
  cashSource: string | null;
  registerName: string | null;
  virtualAccountName: string | null;
};

type SaleItemDetail = {
  id: string;
  productId: string | null;
  barcode: string | null;
  productName: string;
  quantity: number;
  unitCost: number;
  unitPrice: number;
  lineTotal: number;
  isManual: boolean;
  createdAt: string;
};

type SalePaymentDetail = {
  id: string;
  method: string;
  amount: number;
  reference: string | null;
  createdAt: string;
};

type SaleDetail = {
  id: string;
  saleNumber: number;
  operationType: string;
  paymentMethod: PaymentMethod;
  subtotal: number;
  total: number;
  costTotal: number;
  profit: number;
  status: OperationStatus;
  createdBy: string;
  notes: string | null;
  createdAt: string;
  cancelledAt: string | null;
  cancelledBy: string | null;
  cancellationReason: string | null;
  items: SaleItemDetail[];
  payments: SalePaymentDetail[];
};

type ReportResponse = {
  period?: ReportPeriod;
  summary?: OperationsSummary;
  users?: string[];
  operations?: OperationReport[];
  error?: string;
};

type DetailResponse = {
  sale?: SaleDetail;
  error?: string;
};

const emptySummary: OperationsSummary = {
  operationCount: 0,
  saleCount: 0,
  serviceCount: 0,
  quinielaCount: 0,
  withdrawalCount: 0,
  totalSold: 0,
  totalCost: 0,
  saleProfit: 0,
  servicesTotal: 0,
  quinielaTotal: 0,
  withdrawalsTotal: 0,
  withdrawalTransfersTotal: 0,
  withdrawalCommissions: 0,
  cashSalesTotal: 0,
  transferSalesTotal: 0,
  cardSalesTotal: 0,
  cashInTotal: 0,
  cashOutTotal: 0,
  totalProfit: 0,
  averageTicket: 0,
  averagePerDay: 0,
  averageSalesPerDay: 0,
};

const paymentLabels: Record<PaymentMethod, string> = {
  EFECTIVO: "Efectivo",
  TRANSFERENCIA: "Transferencia",
  TARJETA: "Tarjeta",
  MIXTO: "Mixto",
};

const operationTypeLabels: Record<OperationType, string> = {
  VENTA: "Venta",
  SERVICIO: "Servicio / Boleta",
  QUINIELA: "Quiniela",
  EXTRACCION: "Extracción",
};

const operationFilterLabels: Record<OperationTypeFilter, string> = {
  TODOS: "Todas",
  VENTA: "Ventas",
  SERVICIO: "Servicios y boletas",
  QUINIELA: "Quiniela",
  EXTRACCION: "Extracciones",
};

const presetLabels: Record<PeriodPreset, string> = {
  HOY: "Hoy",
  AYER: "Ayer",
  SEMANA: "Esta semana",
  MES: "Este mes",
  PERSONALIZADO: "Personalizado",
};

function formatMoney(value: number): string {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatDecimal(value: number): string {
  return new Intl.NumberFormat("es-AR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatQuantity(value: number): string {
  return new Intl.NumberFormat("es-AR", {
    maximumFractionDigits: 3,
  }).format(value);
}

function getBuenosAiresToday(): string {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  const parts = formatter.formatToParts(new Date());
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;

  if (!year || !month || !day) {
    return new Date().toISOString().slice(0, 10);
  }

  return `${year}-${month}-${day}`;
}

function shiftDate(value: string, days: number): string {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));

  return [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, "0"),
    String(date.getUTCDate()).padStart(2, "0"),
  ].join("-");
}

function getWeekStart(value: string): string {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  const weekDay = date.getUTCDay();
  const difference = weekDay === 0 ? -6 : 1 - weekDay;

  return shiftDate(value, difference);
}

function getMonthStart(value: string): string {
  return `${value.slice(0, 7)}-01`;
}

function formatInputDate(value: string): string {
  const [year, month, day] = value.split("-").map(Number);

  if (!year || !month || !day) {
    return value;
  }

  return new Intl.DateTimeFormat("es-AR", {
    timeZone: "UTC",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

function parseD1Date(value: string): Date {
  const normalizedValue = value.includes("T")
    ? value
    : value.replace(" ", "T");

  const hasTimeZone = /(?:Z|[+-]\d{2}:\d{2})$/.test(normalizedValue);

  return new Date(hasTimeZone ? normalizedValue : `${normalizedValue}Z`);
}

function formatDateTime(value: string): string {
  const date = parseD1Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("es-AR", {
    timeZone: "America/Argentina/Buenos_Aires",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(date);
}

function getPaymentLabel(method: string): string {
  if (method in paymentLabels) {
    return paymentLabels[method as PaymentMethod];
  }

  return method;
}

function getOperationLabel(type: OperationType): string {
  return operationTypeLabels[type];
}

function getOperationLocation(operation: OperationReport): string {
  if (operation.operationType === "SERVICIO") {
    return operation.virtualAccountName ?? "Caja Virtual";
  }

  if (operation.operationType === "EXTRACCION") {
    if (operation.cashLocation === "CAJA_VIRTUAL") {
      return operation.virtualAccountName ?? "Caja Virtual";
    }

    return operation.registerName ?? "Caja física";
  }

  return operation.registerName ?? "Caja física";
}

function getCashMovementText(operation: OperationReport): string {
  if (!operation.cashMovement || operation.cashAmount <= 0) {
    return "Sin movimiento físico";
  }

  const sign = operation.cashMovement === "ENTRADA" ? "+" : "−";
  return `${sign} ${formatMoney(operation.cashAmount)}`;
}

function getDigitalTotal(operation: OperationReport): number {
  return operation.transferAmount + operation.cardAmount;
}

function getDigitalMovementText(operation: OperationReport): string {
  if (operation.operationType === "EXTRACCION") {
    return operation.transferAmount > 0
      ? formatMoney(operation.transferAmount)
      : "—";
  }

  const digitalTotal = getDigitalTotal(operation);
  return digitalTotal > 0 ? formatMoney(digitalTotal) : "—";
}

function getProfitText(operation: OperationReport): string {
  if (operation.operationType === "VENTA") {
    return formatMoney(operation.profit);
  }

  if (operation.operationType === "EXTRACCION") {
    return formatMoney(operation.commission);
  }

  return "—";
}

export default function SalesPage() {
  const today = getBuenosAiresToday();

  const [activePreset, setActivePreset] =
    useState<PeriodPreset>("HOY");
  const [fromDate, setFromDate] = useState(today);
  const [toDate, setToDate] = useState(today);
  const [operationTypeFilter, setOperationTypeFilter] =
    useState<OperationTypeFilter>("TODOS");
  const [userFilter, setUserFilter] = useState("TODOS");
  const [statusFilter, setStatusFilter] =
    useState<StatusFilter>("COMPLETADA");
  const [paymentFilter, setPaymentFilter] =
    useState<PaymentFilter>("TODOS");
  const [search, setSearch] = useState("");

  const [period, setPeriod] = useState<ReportPeriod>({
    from: today,
    to: today,
    days: 1,
  });
  const [summary, setSummary] =
    useState<OperationsSummary>(emptySummary);
  const [users, setUsers] = useState<string[]>([]);
  const [operations, setOperations] = useState<OperationReport[]>([]);

  const [selectedOperation, setSelectedOperation] =
    useState<OperationReport | null>(null);
  const [selectedSale, setSelectedSale] = useState<SaleDetail | null>(
    null,
  );
  const [isLoadingReport, setIsLoadingReport] = useState(true);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  const [loadingOperationId, setLoadingOperationId] = useState<
    string | null
  >(null);
  const [message, setMessage] = useState(
    "Cargando las operaciones de hoy...",
  );

  useEffect(() => {
    const initialToday = getBuenosAiresToday();

    void loadReport({
      from: initialToday,
      to: initialToday,
      type: "TODOS",
      user: "TODOS",
      status: "COMPLETADA",
      payment: "TODOS",
    });
  }, []);

  useEffect(() => {
    if (!selectedOperation) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setSelectedOperation(null);
        setSelectedSale(null);
      }
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [selectedOperation]);

  const periodTitle = useMemo(() => {
    if (period.from === today && period.to === today) {
      return "Operaciones de hoy";
    }

    const yesterday = shiftDate(today, -1);

    if (period.from === yesterday && period.to === yesterday) {
      return "Operaciones de ayer";
    }

    if (period.from === period.to) {
      return `Operaciones del ${formatInputDate(period.from)}`;
    }

    return `Operaciones del ${formatInputDate(
      period.from,
    )} al ${formatInputDate(period.to)}`;
  }, [period, today]);

  const filteredOperations = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();

    if (!normalizedSearch) {
      return operations;
    }

    return operations.filter((operation) => {
      const searchableText = [
        operation.operationNumber,
        getOperationLabel(operation.operationType),
        operation.createdBy,
        operation.paymentMethod,
        operation.status,
        operation.description,
        operation.reference,
        operation.notes,
        operation.registerName,
        operation.virtualAccountName,
        formatDateTime(operation.createdAt),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return searchableText.includes(normalizedSearch);
    });
  }, [operations, search]);

  async function loadReport(filters: ReportFilters) {
    setIsLoadingReport(true);
    setMessage("Actualizando informe general...");

    try {
      const parameters = new URLSearchParams();
      parameters.set("from", filters.from);
      parameters.set("to", filters.to);
      parameters.set("type", filters.type);
      parameters.set("user", filters.user);
      parameters.set("status", filters.status);
      parameters.set("payment", filters.payment);

      const response = await fetch(
        `/api/operations/report?${parameters.toString()}`,
        { cache: "no-store" },
      );

      const data = (await response.json()) as ReportResponse;

      if (!response.ok) {
        throw new Error(
          data.error || "No se pudo cargar el informe general.",
        );
      }

      const loadedOperations = data.operations ?? [];

      setOperations(loadedOperations);
      setSummary(data.summary ?? emptySummary);
      setPeriod(
        data.period ?? {
          from: filters.from,
          to: filters.to,
          days: 1,
        },
      );
      setUsers(data.users ?? []);
      setMessage(
        loadedOperations.length === 1
          ? "1 operación encontrada."
          : `${loadedOperations.length} operaciones encontradas.`,
      );
    } catch (error) {
      console.error("Error al cargar operaciones:", error);
      setOperations([]);
      setSummary(emptySummary);
      setMessage(
        error instanceof Error
          ? error.message
          : "No se pudo cargar el informe general.",
      );
    } finally {
      setIsLoadingReport(false);
    }
  }

  function getCurrentFilters(
    overrides?: Partial<ReportFilters>,
  ): ReportFilters {
    return {
      from: overrides?.from ?? fromDate,
      to: overrides?.to ?? toDate,
      type: overrides?.type ?? operationTypeFilter,
      user: overrides?.user ?? userFilter,
      status: overrides?.status ?? statusFilter,
      payment: overrides?.payment ?? paymentFilter,
    };
  }

  function selectPreset(preset: PeriodPreset) {
    setActivePreset(preset);

    if (preset === "PERSONALIZADO") {
      return;
    }

    const currentToday = getBuenosAiresToday();
    let newFrom = currentToday;
    let newTo = currentToday;

    if (preset === "AYER") {
      const yesterday = shiftDate(currentToday, -1);
      newFrom = yesterday;
      newTo = yesterday;
    }

    if (preset === "SEMANA") {
      newFrom = getWeekStart(currentToday);
      newTo = currentToday;
    }

    if (preset === "MES") {
      newFrom = getMonthStart(currentToday);
      newTo = currentToday;
    }

    setFromDate(newFrom);
    setToDate(newTo);

    void loadReport(
      getCurrentFilters({
        from: newFrom,
        to: newTo,
      }),
    );
  }

  function selectOperationType(type: OperationTypeFilter) {
    setOperationTypeFilter(type);
    void loadReport(getCurrentFilters({ type }));
  }

  function applyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!fromDate || !toDate) {
      setMessage("Seleccioná las fechas desde y hasta.");
      return;
    }

    if (fromDate > toDate) {
      setMessage(
        "La fecha desde no puede ser posterior a la fecha hasta.",
      );
      return;
    }

    void loadReport(getCurrentFilters());
  }

  function resetFilters() {
    const currentToday = getBuenosAiresToday();

    setActivePreset("HOY");
    setFromDate(currentToday);
    setToDate(currentToday);
    setOperationTypeFilter("TODOS");
    setUserFilter("TODOS");
    setStatusFilter("COMPLETADA");
    setPaymentFilter("TODOS");
    setSearch("");

    void loadReport({
      from: currentToday,
      to: currentToday,
      type: "TODOS",
      user: "TODOS",
      status: "COMPLETADA",
      payment: "TODOS",
    });
  }

  async function openOperationDetail(operation: OperationReport) {
    if (operation.source !== "SALE") {
      setSelectedSale(null);
      setSelectedOperation(operation);
      setMessage(
        `Detalle de ${getOperationLabel(
          operation.operationType,
        ).toLowerCase()} N.º ${operation.operationNumber}.`,
      );
      return;
    }

    setIsLoadingDetail(true);
    setLoadingOperationId(operation.id);
    setMessage(`Cargando venta N.º ${operation.operationNumber}...`);

    try {
      const response = await fetch(
        `/api/sales/${encodeURIComponent(operation.id)}`,
        { cache: "no-store" },
      );

      const data = (await response.json()) as DetailResponse;

      if (!response.ok || !data.sale) {
        throw new Error(
          data.error || "No se pudo cargar el detalle de la venta.",
        );
      }

      setSelectedSale(data.sale);
      setSelectedOperation(operation);
      setMessage(`Detalle de la venta N.º ${operation.operationNumber}.`);
    } catch (error) {
      console.error("Error al cargar detalle:", error);
      setMessage(
        error instanceof Error
          ? error.message
          : "No se pudo cargar el detalle de la venta.",
      );
    } finally {
      setIsLoadingDetail(false);
      setLoadingOperationId(null);
    }
  }

  function closeOperationDetail() {
    setSelectedOperation(null);
    setSelectedSale(null);
  }

  const physicalNet = summary.cashInTotal - summary.cashOutTotal;

  return (
    <main className={styles.page}>
      <AdminNavigation />

      <header className={styles.header}>
        <div className={styles.titleGroup}>
          <p className={styles.eyebrow}>CONTROL DEL NEGOCIO</p>
          <h1 className={styles.title}>Historial general</h1>
          <p className={styles.subtitle}>
            Ventas, Servicios y Boletas, Quiniela y Extracciones del
            período seleccionado.
          </p>
        </div>
      </header>

      <section className={styles.periodHeader}>
        <div>
          <p className={styles.periodEyebrow}>PERÍODO ACTUAL</p>
          <h2 className={styles.periodTitle}>{periodTitle}</h2>
          <p className={styles.periodDescription}>
            {period.days} {period.days === 1 ? "día incluido" : "días incluidos"}
          </p>
        </div>

        <span className={styles.periodDateBadge}>
          {formatInputDate(period.from)}
          {period.from !== period.to &&
            ` — ${formatInputDate(period.to)}`}
        </span>
      </section>

      <section className={styles.statsGrid}>
        <article className={styles.statCard}>
          <span className={styles.statLabel}>Operaciones completadas</span>
          <strong className={styles.statValue}>
            {summary.operationCount}
          </strong>
          <small className={styles.statNote}>
            Según los filtros aplicados
          </small>
        </article>

        <article className={styles.statCard}>
          <span className={styles.statLabel}>Ventas realizadas</span>
          <strong className={styles.statValue}>{summary.saleCount}</strong>
          <small className={styles.statNote}>
            {formatDecimal(summary.averageSalesPerDay)} ventas por día
          </small>
        </article>

        <article className={styles.statCard}>
          <span className={styles.statLabel}>Total vendido</span>
          <strong className={styles.statValue}>
            {formatMoney(summary.totalSold)}
          </strong>
          <small className={styles.statNote}>
            {formatMoney(summary.averagePerDay)} por día
          </small>
        </article>

        <article className={styles.statCard}>
          <span className={styles.statLabel}>Costo de mercadería</span>
          <strong className={styles.statValue}>
            {formatMoney(summary.totalCost)}
          </strong>
          <small className={styles.statNote}>Solo ventas de productos</small>
        </article>

        <article className={`${styles.statCard} ${styles.profitCard}`}>
          <span className={styles.statLabel}>Ganancia total</span>
          <strong className={styles.statValue}>
            {formatMoney(summary.totalProfit)}
          </strong>
          <small className={styles.statNote}>
            Ventas + comisiones de extracciones
          </small>
        </article>

        <article className={`${styles.statCard} ${styles.averageCard}`}>
          <span className={styles.statLabel}>Ticket promedio</span>
          <strong className={styles.statValue}>
            {formatMoney(summary.averageTicket)}
          </strong>
          <small className={styles.statNote}>Promedio por venta</small>
        </article>

        <article className={styles.statCard}>
          <span className={styles.statLabel}>Servicios y boletas</span>
          <strong className={styles.statValue}>
            {formatMoney(summary.servicesTotal)}
          </strong>
          <small className={styles.statNote}>
            {summary.serviceCount} operaciones en Caja Virtual
          </small>
        </article>

        <article className={styles.statCard}>
          <span className={styles.statLabel}>Quiniela</span>
          <strong className={styles.statValue}>
            {formatMoney(summary.quinielaTotal)}
          </strong>
          <small className={styles.statNote}>
            {summary.quinielaCount} operaciones en cajas físicas
          </small>
        </article>

        <article className={styles.statCard}>
          <span className={styles.statLabel}>Efectivo entregado</span>
          <strong className={styles.statValue}>
            {formatMoney(summary.withdrawalsTotal)}
          </strong>
          <small className={styles.statNote}>
            {summary.withdrawalCount} extracciones
          </small>
        </article>

        <article className={styles.statCard}>
          <span className={styles.statLabel}>Transferencias recibidas</span>
          <strong className={styles.statValue}>
            {formatMoney(summary.withdrawalTransfersTotal)}
          </strong>
          <small className={styles.statNote}>Por extracciones</small>
        </article>

        <article className={`${styles.statCard} ${styles.profitCard}`}>
          <span className={styles.statLabel}>Comisiones de extracciones</span>
          <strong className={styles.statValue}>
            {formatMoney(summary.withdrawalCommissions)}
          </strong>
          <small className={styles.statNote}>Ganancia por comisión</small>
        </article>

        <article className={`${styles.statCard} ${styles.averageCard}`}>
          <span className={styles.statLabel}>Movimiento físico neto</span>
          <strong className={styles.statValue}>{formatMoney(physicalNet)}</strong>
          <small className={styles.statNote}>
            Entradas {formatMoney(summary.cashInTotal)} · Salidas {formatMoney(summary.cashOutTotal)} · Sin apertura
          </small>
        </article>
      </section>

      <section className={styles.toolbarPanel}>
        <div className={styles.toolbarTop}>
          <div>
            <h2 className={styles.toolbarTitle}>Período y filtros</h2>
            <p className={styles.toolbarSubtitle}>
              Elegí un período rápido o ingresá las fechas manualmente.
            </p>
          </div>

          <button
            type="button"
            className={styles.resetButton}
            onClick={resetFilters}
            disabled={isLoadingReport}
          >
            Restablecer a hoy
          </button>
        </div>

        <div className={styles.presetButtons}>
          {(Object.entries(presetLabels) as [PeriodPreset, string][]).map(
            ([preset, label]) => (
              <button
                key={preset}
                type="button"
                className={`${styles.presetButton} ${
                  activePreset === preset ? styles.presetButtonActive : ""
                }`}
                onClick={() => selectPreset(preset)}
                disabled={isLoadingReport}
              >
                {label}
              </button>
            ),
          )}
        </div>

        <p className={styles.toolbarSubtitle}>Tipo de operación</p>

        <div className={styles.presetButtons}>
          {(
            Object.entries(operationFilterLabels) as [
              OperationTypeFilter,
              string,
            ][]
          ).map(([type, label]) => (
            <button
              key={type}
              type="button"
              className={`${styles.presetButton} ${
                operationTypeFilter === type
                  ? styles.presetButtonActive
                  : ""
              }`}
              onClick={() => selectOperationType(type)}
              disabled={isLoadingReport}
            >
              {label}
            </button>
          ))}
        </div>

        <form onSubmit={applyFilters} className={styles.filtersForm}>
          <div className={styles.dateGrid}>
            <label className={styles.field}>
              <span>Desde</span>
              <input
                type="date"
                className={styles.dateInput}
                value={fromDate}
                onChange={(event) => {
                  setFromDate(event.target.value);
                  setActivePreset("PERSONALIZADO");
                }}
              />
            </label>

            <label className={styles.field}>
              <span>Hasta</span>
              <input
                type="date"
                className={styles.dateInput}
                value={toDate}
                onChange={(event) => {
                  setToDate(event.target.value);
                  setActivePreset("PERSONALIZADO");
                }}
              />
            </label>

            <label className={styles.field}>
              <span>Usuario</span>
              <select
                className={styles.select}
                value={userFilter}
                onChange={(event) => setUserFilter(event.target.value)}
              >
                <option value="TODOS">Todos los usuarios</option>
                {users.map((user) => (
                  <option key={user} value={user}>
                    {user}
                  </option>
                ))}
              </select>
            </label>

            <label className={styles.field}>
              <span>Estado</span>
              <select
                className={styles.select}
                value={statusFilter}
                onChange={(event) =>
                  setStatusFilter(event.target.value as StatusFilter)
                }
              >
                <option value="TODOS">Todos</option>
                <option value="COMPLETADA">Completadas</option>
                <option value="ANULADA">Anuladas</option>
              </select>
            </label>

            <label className={styles.field}>
              <span>Medio de pago</span>
              <select
                className={styles.select}
                value={paymentFilter}
                onChange={(event) =>
                  setPaymentFilter(event.target.value as PaymentFilter)
                }
              >
                <option value="TODOS">Todos</option>
                <option value="EFECTIVO">Efectivo</option>
                <option value="TRANSFERENCIA">Transferencia</option>
                <option value="TARJETA">Tarjeta</option>
                <option value="MIXTO">Pago mixto</option>
              </select>
            </label>

            <button
              type="submit"
              className={styles.applyButton}
              disabled={isLoadingReport}
            >
              {isLoadingReport ? "Cargando..." : "Aplicar filtros"}
            </button>
          </div>
        </form>

        <div className={styles.searchRow}>
          <label className={`${styles.field} ${styles.searchField}`}>
            <span>Buscar en los resultados</span>
            <input
              className={styles.searchInput}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Número, tipo, cajera, descripción, referencia, caja o medio de pago"
            />
          </label>

          <button
            type="button"
            className={styles.refreshButton}
            onClick={() => void loadReport(getCurrentFilters())}
            disabled={isLoadingReport}
          >
            {isLoadingReport ? "Actualizando..." : "Actualizar"}
          </button>
        </div>

        <div className={styles.message}>{message}</div>
      </section>

      <section className={styles.tablePanel}>
        <div className={styles.tableHeader}>
          <div>
            <h2 className={styles.tableTitle}>Operaciones del período</h2>
            <p className={styles.tableSubtitle}>
              Se muestran Ventas, Servicios y Boletas, Quiniela y Extracciones
              que coinciden con los filtros.
            </p>
          </div>

          <span className={styles.resultCount}>
            {filteredOperations.length} resultado
            {filteredOperations.length === 1 ? "" : "s"}
          </span>
        </div>

        <div className={styles.tableWrapper}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Operación</th>
                <th>Fecha y hora</th>
                <th>Tipo</th>
                <th>Usuario</th>
                <th>Descripción</th>
                <th>Pago</th>
                <th>Importe</th>
                <th>Movimiento físico</th>
                <th>Movimiento digital</th>
                <th>Ganancia</th>
                <th>Estado</th>
                <th>Detalle</th>
              </tr>
            </thead>

            <tbody>
              {filteredOperations.length === 0 ? (
                <tr>
                  <td colSpan={12} className={styles.emptyCell}>
                    No se encontraron operaciones para este período y estos
                    filtros.
                  </td>
                </tr>
              ) : (
                filteredOperations.map((operation) => (
                  <tr key={`${operation.source}-${operation.id}`}>
                    <td>
                      <strong className={styles.saleNumber}>
                        N.º {operation.operationNumber}
                      </strong>
                    </td>

                    <td>{formatDateTime(operation.createdAt)}</td>

                    <td>
                      <span className={styles.paymentBadge}>
                        {getOperationLabel(operation.operationType)}
                      </span>
                    </td>

                    <td>
                      <span className={styles.userName}>
                        {operation.createdBy}
                      </span>
                    </td>

                    <td>
                      <strong>
                        {operation.description ??
                          getOperationLabel(operation.operationType)}
                      </strong>
                      {operation.reference && (
                        <div>Ref.: {operation.reference}</div>
                      )}
                    </td>

                    <td>
                      <span className={styles.paymentBadge}>
                        {getPaymentLabel(operation.paymentMethod)}
                      </span>
                    </td>

                    <td>
                      <strong>{formatMoney(operation.amount)}</strong>
                    </td>

                    <td>{getCashMovementText(operation)}</td>

                    <td>{getDigitalMovementText(operation)}</td>

                    <td>
                      <strong className={styles.moneyPositive}>
                        {getProfitText(operation)}
                      </strong>
                    </td>

                    <td>
                      <span
                        className={`${styles.statusBadge} ${
                          operation.status === "COMPLETADA"
                            ? styles.completedBadge
                            : styles.cancelledBadge
                        }`}
                      >
                        {operation.status}
                      </span>
                    </td>

                    <td>
                      <button
                        type="button"
                        className={styles.viewButton}
                        disabled={isLoadingDetail}
                        onClick={() => void openOperationDetail(operation)}
                      >
                        {loadingOperationId === operation.id
                          ? "Cargando..."
                          : "Ver detalle"}
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {selectedOperation && (
        <div
          className={styles.modalOverlay}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              closeOperationDetail();
            }
          }}
        >
          <section
            className={styles.modalCard}
            role="dialog"
            aria-modal="true"
          >
            <header className={styles.modalHeader}>
              <div className={styles.modalHeaderInfo}>
                <p className={styles.modalEyebrow}>DETALLE DE OPERACIÓN</p>
                <h2 className={styles.modalTitle}>
                  {getOperationLabel(selectedOperation.operationType)} N.º{" "}
                  {selectedOperation.operationNumber}
                </h2>
                <p>{formatDateTime(selectedOperation.createdAt)}</p>
              </div>

              <button
                type="button"
                className={styles.closeButton}
                onClick={closeOperationDetail}
                aria-label="Cerrar"
              >
                ×
              </button>
            </header>

            <div className={styles.detailSummary}>
              {selectedOperation.operationType === "VENTA" && selectedSale ? (
                <>
                  <article className={styles.detailCard}>
                    <span className={styles.detailCardLabel}>Total</span>
                    <strong className={styles.detailCardValue}>
                      {formatMoney(selectedSale.total)}
                    </strong>
                  </article>

                  <article className={styles.detailCard}>
                    <span className={styles.detailCardLabel}>Costo</span>
                    <strong className={styles.detailCardValue}>
                      {formatMoney(selectedSale.costTotal)}
                    </strong>
                  </article>

                  <article className={`${styles.detailCard} ${styles.profitCard}`}>
                    <span className={styles.detailCardLabel}>Ganancia</span>
                    <strong
                      className={`${styles.detailCardValue} ${styles.profitValue}`}
                    >
                      {formatMoney(selectedSale.profit)}
                    </strong>
                  </article>
                </>
              ) : selectedOperation.operationType === "EXTRACCION" ? (
                <>
                  <article className={styles.detailCard}>
                    <span className={styles.detailCardLabel}>
                      Efectivo entregado
                    </span>
                    <strong className={styles.detailCardValue}>
                      {formatMoney(selectedOperation.amount)}
                    </strong>
                  </article>

                  <article className={styles.detailCard}>
                    <span className={styles.detailCardLabel}>
                      Transferencia recibida
                    </span>
                    <strong className={styles.detailCardValue}>
                      {formatMoney(selectedOperation.transferAmount)}
                    </strong>
                  </article>

                  <article className={`${styles.detailCard} ${styles.profitCard}`}>
                    <span className={styles.detailCardLabel}>Comisión</span>
                    <strong
                      className={`${styles.detailCardValue} ${styles.profitValue}`}
                    >
                      {formatMoney(selectedOperation.commission)}
                    </strong>
                  </article>
                </>
              ) : (
                <>
                  <article className={styles.detailCard}>
                    <span className={styles.detailCardLabel}>
                      Importe cobrado
                    </span>
                    <strong className={styles.detailCardValue}>
                      {formatMoney(selectedOperation.amount)}
                    </strong>
                  </article>

                  <article className={styles.detailCard}>
                    <span className={styles.detailCardLabel}>
                      Efectivo ingresado
                    </span>
                    <strong className={styles.detailCardValue}>
                      {formatMoney(selectedOperation.cashAmount)}
                    </strong>
                  </article>

                  <article className={`${styles.detailCard} ${styles.averageCard}`}>
                    <span className={styles.detailCardLabel}>
                      Movimiento digital
                    </span>
                    <strong className={styles.detailCardValue}>
                      {formatMoney(getDigitalTotal(selectedOperation))}
                    </strong>
                  </article>
                </>
              )}
            </div>

            <div className={styles.metaGrid}>
              <div className={styles.metaItem}>
                <span>Usuario</span>
                <strong>{selectedOperation.createdBy}</strong>
              </div>

              <div className={styles.metaItem}>
                <span>Tipo de operación</span>
                <strong>
                  {getOperationLabel(selectedOperation.operationType)}
                </strong>
              </div>

              <div className={styles.metaItem}>
                <span>Medio de pago</span>
                <strong>
                  {getPaymentLabel(selectedOperation.paymentMethod)}
                </strong>
              </div>

              <div className={styles.metaItem}>
                <span>Estado</span>
                <strong>{selectedOperation.status}</strong>
              </div>

              <div className={styles.metaItem}>
                <span>Caja u origen del efectivo</span>
                <strong>{getOperationLocation(selectedOperation)}</strong>
              </div>

              <div className={styles.metaItem}>
                <span>Movimiento físico</span>
                <strong>{getCashMovementText(selectedOperation)}</strong>
              </div>

              <div className={styles.metaItem}>
                <span>Transferencia</span>
                <strong>{formatMoney(selectedOperation.transferAmount)}</strong>
              </div>

              <div className={styles.metaItem}>
                <span>Tarjeta</span>
                <strong>{formatMoney(selectedOperation.cardAmount)}</strong>
              </div>
            </div>

            {selectedOperation.description && (
              <div className={styles.noteBox}>
                <strong>Descripción</strong>
                <p>{selectedOperation.description}</p>
              </div>
            )}

            {selectedOperation.reference && (
              <div className={styles.noteBox}>
                <strong>Referencia</strong>
                <p>{selectedOperation.reference}</p>
              </div>
            )}

            {selectedOperation.operationType === "VENTA" && selectedSale && (
              <>
                <section className={styles.section}>
                  <div className={styles.sectionHeader}>
                    <h3>Productos vendidos</h3>
                    <span>{selectedSale.items.length} ítems</span>
                  </div>

                  <div className={styles.itemsTableWrapper}>
                    <table className={styles.itemsTable}>
                      <thead>
                        <tr>
                          <th>Producto</th>
                          <th>Código</th>
                          <th>Cantidad</th>
                          <th>Costo</th>
                          <th>Precio</th>
                          <th>Subtotal</th>
                        </tr>
                      </thead>

                      <tbody>
                        {selectedSale.items.map((item) => (
                          <tr key={item.id}>
                            <td>
                              <strong>{item.productName}</strong>
                              {item.isManual && (
                                <span className={styles.manualBadge}>
                                  Manual
                                </span>
                              )}
                            </td>
                            <td>{item.barcode ?? "—"}</td>
                            <td>{formatQuantity(item.quantity)}</td>
                            <td>{formatMoney(item.unitCost)}</td>
                            <td>{formatMoney(item.unitPrice)}</td>
                            <td>
                              <strong>{formatMoney(item.lineTotal)}</strong>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>

                <section className={styles.section}>
                  <div className={styles.sectionHeader}>
                    <h3>Medios de pago</h3>
                  </div>

                  <div className={styles.paymentsList}>
                    {selectedSale.payments.map((payment) => (
                      <article key={payment.id} className={styles.paymentRow}>
                        <div className={styles.paymentInfo}>
                          <strong>{getPaymentLabel(payment.method)}</strong>
                          {payment.reference && (
                            <span>Referencia: {payment.reference}</span>
                          )}
                        </div>

                        <strong className={styles.paymentAmount}>
                          {formatMoney(payment.amount)}
                        </strong>
                      </article>
                    ))}
                  </div>
                </section>
              </>
            )}

            {(selectedSale?.notes || selectedOperation.notes) && (
              <div className={styles.noteBox}>
                <strong>Notas</strong>
                <p>{selectedSale?.notes ?? selectedOperation.notes}</p>
              </div>
            )}

            {selectedOperation.status === "ANULADA" && (
              <div className={styles.cancellationBox}>
                <strong>Operación anulada</strong>
                {selectedSale ? (
                  <>
                    <p>
                      Motivo: {selectedSale.cancellationReason ?? "Sin motivo registrado"}
                    </p>
                    <p>
                      Anulada por: {selectedSale.cancelledBy ?? "Sin usuario"}
                    </p>
                  </>
                ) : (
                  <p>
                    Esta operación no se suma a las estadísticas del informe.
                  </p>
                )}
              </div>
            )}
          </section>
        </div>
      )}
    </main>
  );
}
