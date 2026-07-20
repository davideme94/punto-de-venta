"use client";

import { type FormEvent, useEffect, useMemo, useRef, useState } from "react";

import { useRouter } from "next/navigation";

import styles from "./page.module.css";

type OperationType = "NEGOCIO" | "VIRTUAL" | "RETIRO" | "QUINIELA";

type PaymentMethod = "EFECTIVO" | "TRANSFERENCIA" | "TARJETA" | "MIXTO";

type PaymentPartMethod = "EFECTIVO" | "TRANSFERENCIA" | "TARJETA";

type Product = {
  id: string;
  barcode: string;
  name: string;
  category: string;
  costPrice: number;
  price: number;
  stock: number;
  active: boolean;
};

type SaleItem = {
  lineId: string;
  productId: string | null;
  barcode: string | null;
  name: string;
  quantity: number;
  unitPrice: number;
  operationType: OperationType;
  reference?: string | null;
  notes?: string | null;
};

type ProductResponse = {
  product?: Product;
  error?: string;
};

type ProductsResponse = {
  products?: Product[];
  error?: string;
};

type CreatedSale = {
  id: string;
  saleNumber: number;
  operationType: string;
  paymentMethod: string;
  total: number;
  status: string;
  createdBy: string;
  notes: string | null;
  createdAt: string;
};

type SaleResponse = {
  message?: string;
  sale?: CreatedSale | null;
  operations?: CashBoxOperationRecord[];
  summary?: {
    businessTotal: number;
    cashBoxOperationsTotal: number;
    grandTotal: number;
  };
  error?: string;
};

type AuthenticatedUser = {
  id: string;
  username: string;
  displayName: string;
  role: string;
};

type OpenRegisterSession = {
  id: string;
  registerId: string | null;
  registerCode: string | null;
  registerName: string | null;
  businessDate: string | null;
  openingAmount: number | null;
  confirmationStatus: string | null;
  confirmedAmount: number | null;
  confirmationDifference: number | null;
  confirmedAt: string | null;
  requiresConfirmation: boolean;
};

type MeResponse = {
  authenticated: boolean;
  user?: AuthenticatedUser;
  openRegisterSession?: OpenRegisterSession | null;
  hasAssignedRegister?: boolean;
  error?: string;
};

type CashSource = "PHYSICAL_REGISTER" | "VIRTUAL_ACCOUNT";

type WithdrawalRecord = {
  id: string;
  operationNumber: number;
  operatorName: string;
  registerName: string | null;
  virtualAccountName: string;
  cashSource: CashSource;
  withdrawalAmount: number;
  commissionAmount: number;
  transferTotal: number;
  transferReference: string | null;
  notes: string | null;
  status: string;
  createdAt: string;
};

type WithdrawalInformationResponse = {
  commissionRate?: number;

  cashier?: {
    id: string;
    username: string;
    displayName: string;
  };

  businessDate?: string | null;

  physicalSource?: {
    sessionId: string;
    registerId: string;
    registerCode: string | null;
    registerName: string | null;
    openingAmount: number;
    cashSales: number;
    previousWithdrawals: number;
    availableAmount: number;
  };

  virtualSource?: {
    sessionId: string;
    accountId: string;
    accountCode: string;
    accountName: string;
    openingBalance: number;
    digitalSales: number;
    withdrawalTransfers: number;
    previousCashWithdrawals: number;
    availableAmount: number;
  };

  recentWithdrawals?: WithdrawalRecord[];
  error?: string;
};

type CreatedWithdrawal = {
  id: string;
  operationNumber: number;
  operatorName: string;
  registerName: string | null;
  virtualAccountName: string;
  cashSource: CashSource;
  cashSourceLabel: string;
  withdrawalAmount: number;
  commissionRate: number;
  commissionAmount: number;
  transferTotal: number;
  transferReference: string | null;
  notes: string | null;
  status: string;
  createdAt: string;
};

type WithdrawalResponse = {
  message?: string;
  withdrawal?: CreatedWithdrawal;

  summary?: {
    withdrawalAmount: number;
    commissionRate: number;
    commissionAmount: number;
    transferTotal: number;
    cashSource: CashSource;
    cashSourceLabel: string;
  };

  error?: string;
};


type CashBoxOperationType = "SERVICIO" | "QUINIELA";

type CashBoxOperationRecord = {
  id: string;
  operationNumber: number;
  operationType: CashBoxOperationType;
  operationTypeLabel: string;
  operatorUserId: string;
  operatorName: string;
  physicalSessionId: string;
  registerName: string;
  virtualSessionId: string | null;
  virtualAccountName: string | null;
  destinationLabel: string;
  paymentMethod: string;
  amount: number;
  description: string | null;
  reference: string | null;
  notes: string | null;
  status: string;
  createdAt: string;
};

type CashBoxOperationsInformationResponse = {
  cashier?: {
    id: string;
    username: string;
    displayName: string;
  };

  businessDate?: string | null;

  physicalRegister?: {
    sessionId: string;
    registerId: string;
    registerCode: string | null;
    registerName: string | null;
    confirmationStatus: string;
  };

  virtualRegister?: {
    sessionId: string;
    accountId: string;
    accountCode: string;
    accountName: string;
    businessDate: string;
    openingAmount: number;
  } | null;

  serviceAvailable?: boolean;

  totals?: {
    services: number;
    quiniela: number;
  };

  recentOperations?: CashBoxOperationRecord[];
  error?: string;
};

type CashBoxOperationResponse = {
  message?: string;
  operation?: CashBoxOperationRecord;
  error?: string;
};

const initialProducts: Product[] = [];

const operationLabels: Record<OperationType, string> = {
  NEGOCIO: "Negocio",
  VIRTUAL: "Virtual · Pago de servicios",
  RETIRO: "Extracción de efectivo",
  QUINIELA: "Quiniela",
};

const paymentLabels: Record<PaymentMethod, string> = {
  EFECTIVO: "Efectivo",
  TRANSFERENCIA: "Transferencia",
  TARJETA: "Tarjeta",
  MIXTO: "Pago mixto",
};

function createLineId(): string {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function formatMoney(value: number): string {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatDateTime(value: string): string {
  const normalized = value.includes("T")
    ? value
    : `${value.replace(" ", "T")}Z`;

  const date = new Date(normalized);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("es-AR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Argentina/Buenos_Aires",
  }).format(date);
}

function parseMoney(value: string): number {
  const cleanedValue = value
    .replace(/\$/g, "")
    .replace(/\s/g, "")
    .replace(/\./g, "")
    .replace(",", ".");

  return Number(cleanedValue);
}

function parseStock(value: string): number {
  return Number(value.replace(",", "."));
}

async function fetchProducts(): Promise<Product[]> {
  const response = await fetch("/api/products", {
    cache: "no-store",
  });

  const data = (await response.json()) as ProductsResponse;

  if (!response.ok) {
    throw new Error(data.error || "No se pudieron cargar los productos.");
  }

  return data.products ?? [];
}

export default function Home() {
  const router = useRouter();

  const [currentUser, setCurrentUser] = useState<AuthenticatedUser | null>(
    null,
  );

  const [openRegisterSession, setOpenRegisterSession] =
    useState<OpenRegisterSession | null>(null);

  const [isCheckingSession, setIsCheckingSession] = useState(true);

  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const [activeOperation, setActiveOperation] =
    useState<OperationType>("NEGOCIO");

  const [products, setProducts] = useState<Product[]>(initialProducts);

  const [saleItems, setSaleItems] = useState<SaleItem[]>([]);

  const [barcode, setBarcode] = useState("");

  const [manualDescription, setManualDescription] = useState("");

  const [manualPrice, setManualPrice] = useState("");

  const [operationDescription, setOperationDescription] = useState("");

  const [operationAmount, setOperationAmount] = useState("");

  const [operationReference, setOperationReference] = useState("");

  const [operationNotes, setOperationNotes] = useState("");

  const [cashBoxInformation, setCashBoxInformation] =
    useState<CashBoxOperationsInformationResponse | null>(null);

  const [cashBoxMessage, setCashBoxMessage] = useState(
    "Ingresá el importe de la operación.",
  );

  const [isLoadingCashBoxOperations, setIsLoadingCashBoxOperations] =
    useState(false);

  const [isSavingCashBoxOperation, setIsSavingCashBoxOperation] =
    useState(false);

  const [statusMessage, setStatusMessage] = useState(
    "Caja lista para comenzar.",
  );

  /*
   * Extracciones de efectivo contra
   * transferencia con comisión del 3%.
   */
  const [withdrawalInformation, setWithdrawalInformation] =
    useState<WithdrawalInformationResponse | null>(null);

  const [withdrawalAmount, setWithdrawalAmount] = useState("");

  const [withdrawalCashSource, setWithdrawalCashSource] =
    useState<CashSource>("PHYSICAL_REGISTER");

  const [withdrawalReference, setWithdrawalReference] = useState("");

  const [withdrawalNotes, setWithdrawalNotes] = useState("");

  const [withdrawalMessage, setWithdrawalMessage] = useState(
    "Ingresá el importe que recibirá el cliente.",
  );

  const [isLoadingWithdrawals, setIsLoadingWithdrawals] = useState(false);

  const [isSavingWithdrawal, setIsSavingWithdrawal] = useState(false);

  /*
   * Modal de producto no encontrado.
   */
  const [isNewProductModalOpen, setIsNewProductModalOpen] = useState(false);

  const [newProductBarcode, setNewProductBarcode] = useState("");

  const [newProductName, setNewProductName] = useState("");

  const [newProductCategory, setNewProductCategory] = useState("General");

  const [newProductCostPrice, setNewProductCostPrice] = useState("");

  const [newProductSalePrice, setNewProductSalePrice] = useState("");

  const [newProductStock, setNewProductStock] = useState("0");

  const [isSavingNewProduct, setIsSavingNewProduct] = useState(false);

  /*
   * Modal de cobro.
   */
  const [isCheckoutModalOpen, setIsCheckoutModalOpen] = useState(false);

  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("EFECTIVO");

  const [paymentReference, setPaymentReference] = useState("");

  const [cashReceived, setCashReceived] = useState("");

  const [mixedCash, setMixedCash] = useState("");

  const [mixedTransfer, setMixedTransfer] = useState("");

  const [mixedCard, setMixedCard] = useState("");

  const [mixedReference, setMixedReference] = useState("");

  const [checkoutMessage, setCheckoutMessage] = useState("");

  const [isSavingSale, setIsSavingSale] = useState(false);

  const barcodeInputRef = useRef<HTMLInputElement>(null);

  /*
   * Comprueba que exista una cajera
   * autenticada, con una caja abierta
   * y la recepción CONFIRMADA.
   */
  useEffect(() => {
    let cancelled = false;

    async function checkCashierSession() {
      setIsCheckingSession(true);

      try {
        const response = await fetch("/api/auth/me", {
          method: "GET",
          cache: "no-store",
          credentials: "include",
        });

        const data = (await response.json()) as MeResponse;

        if (!response.ok || !data.authenticated || !data.user) {
          router.replace("/login");
          return;
        }

        if (data.user.role !== "CAJERO") {
          router.replace("/login");
          return;
        }

        const assignedSession = data.openRegisterSession ?? null;

        if (!assignedSession) {
          router.replace("/login");
          return;
        }

        if (assignedSession.confirmationStatus !== "CONFIRMADA") {
          router.replace("/login");
          return;
        }

        if (cancelled) {
          return;
        }

        setCurrentUser(data.user);
        setOpenRegisterSession(assignedSession);

        setStatusMessage(
          `Caja lista: ${data.user.displayName} · ${
            assignedSession.registerName ?? "Caja física"
          }.`,
        );
      } catch (error) {
        console.error("Error al comprobar la sesión de la cajera:", error);

        if (!cancelled) {
          router.replace("/login");
        }
      } finally {
        if (!cancelled) {
          setIsCheckingSession(false);
        }
      }
    }

    void checkCashierSession();

    return () => {
      cancelled = true;
    };
  }, [router]);

  useEffect(() => {
    if (
      currentUser &&
      openRegisterSession &&
      activeOperation === "NEGOCIO" &&
      !isNewProductModalOpen &&
      !isCheckoutModalOpen
    ) {
      barcodeInputRef.current?.focus();
    }
  }, [
    currentUser,
    openRegisterSession,
    activeOperation,
    isNewProductModalOpen,
    isCheckoutModalOpen,
  ]);

  /*
   * Carga inicial de productos.
   */
  useEffect(() => {
    if (isCheckingSession || !currentUser || !openRegisterSession) {
      return;
    }

    let cancelled = false;

    async function loadProducts() {
      setStatusMessage("Cargando productos desde la base de datos...");

      try {
        const loadedProducts = await fetchProducts();

        if (!cancelled) {
          setProducts(loadedProducts);

          setStatusMessage(`${loadedProducts.length} productos cargados.`);
        }
      } catch (error) {
        console.error("Error al cargar productos:", error);

        if (!cancelled) {
          setStatusMessage(
            error instanceof Error
              ? error.message
              : "No se pudieron cargar los productos.",
          );
        }
      }
    }

    void loadProducts();

    return () => {
      cancelled = true;
    };
  }, [isCheckingSession, currentUser, openRegisterSession]);

  /*
   * Carga saldos y extracciones cuando
   * se abre la pestaña correspondiente.
   */
  useEffect(() => {
    if (activeOperation !== "RETIRO" || !currentUser || !openRegisterSession) {
      return;
    }

    void loadWithdrawalInformation();
  }, [activeOperation, currentUser, openRegisterSession]);

  /*
   * Carga Servicios y Quiniela cuando
   * se abre una de esas pestañas.
   */
  useEffect(() => {
    if (
      (activeOperation !== "VIRTUAL" && activeOperation !== "QUINIELA") ||
      !currentUser ||
      !openRegisterSession
    ) {
      return;
    }

    void loadCashBoxOperationInformation();
  }, [activeOperation, currentUser, openRegisterSession]);

  /*
   * Escape y bloqueo del fondo para
   * el modal de producto.
   */
  useEffect(() => {
    if (!isNewProductModalOpen) {
      return;
    }

    const previousOverflow = document.body.style.overflow;

    document.body.style.overflow = "hidden";

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !isSavingNewProduct) {
        closeNewProductModal();
      }
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;

      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isNewProductModalOpen, isSavingNewProduct]);

  /*
   * Escape y bloqueo del fondo para
   * el modal de cobro.
   */
  useEffect(() => {
    if (!isCheckoutModalOpen) {
      return;
    }

    const previousOverflow = document.body.style.overflow;

    document.body.style.overflow = "hidden";

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !isSavingSale) {
        closeCheckoutModal();
      }
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;

      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isCheckoutModalOpen, isSavingSale]);

  const categoryTotals = useMemo(() => {
    const totals: Record<OperationType, number> = {
      NEGOCIO: 0,
      VIRTUAL: 0,
      RETIRO: 0,
      QUINIELA: 0,
    };

    saleItems.forEach((item) => {
      totals[item.operationType] += item.unitPrice * item.quantity;
    });

    return totals;
  }, [saleItems]);

  const grandTotal = useMemo(() => {
    return saleItems.reduce(
      (total, item) => total + item.unitPrice * item.quantity,
      0,
    );
  }, [saleItems]);

  const parsedCashReceived = useMemo(() => {
    const value = parseMoney(cashReceived || "0");

    return Number.isFinite(value) ? value : 0;
  }, [cashReceived]);

  const cashChange = useMemo(() => {
    return Math.max(0, parsedCashReceived - grandTotal);
  }, [parsedCashReceived, grandTotal]);

  const mixedTotal = useMemo(() => {
    const cash = parseMoney(mixedCash || "0");

    const transfer = parseMoney(mixedTransfer || "0");

    const card = parseMoney(mixedCard || "0");

    return (
      (Number.isFinite(cash) ? cash : 0) +
      (Number.isFinite(transfer) ? transfer : 0) +
      (Number.isFinite(card) ? card : 0)
    );
  }, [mixedCash, mixedTransfer, mixedCard]);

  const mixedDifference = grandTotal - mixedTotal;

  const withdrawalAmountValue = useMemo(() => {
    const value = parseMoney(withdrawalAmount || "0");

    return Number.isFinite(value) ? value : 0;
  }, [withdrawalAmount]);

  const withdrawalCommissionRate = withdrawalInformation?.commissionRate ?? 3;

  const withdrawalCommission = useMemo(() => {
    if (withdrawalAmountValue <= 0) {
      return 0;
    }

    return Math.round(withdrawalAmountValue * withdrawalCommissionRate) / 100;
  }, [withdrawalAmountValue, withdrawalCommissionRate]);

  const withdrawalTransferTotal = withdrawalAmountValue + withdrawalCommission;

  const selectedWithdrawalAvailable =
    withdrawalCashSource === "PHYSICAL_REGISTER"
      ? (withdrawalInformation?.physicalSource?.availableAmount ?? 0)
      : (withdrawalInformation?.virtualSource?.availableAmount ?? 0);

  const activeCashBoxOperationType: CashBoxOperationType | null =
    activeOperation === "VIRTUAL"
      ? "SERVICIO"
      : activeOperation === "QUINIELA"
        ? "QUINIELA"
        : null;

  const cashBoxAmountValue = useMemo(() => {
    const value = parseMoney(operationAmount || "0");

    return Number.isFinite(value) ? value : 0;
  }, [operationAmount]);

  const cashBoxDestinationLabel =
    activeCashBoxOperationType === "SERVICIO"
      ? (cashBoxInformation?.virtualRegister?.accountName ?? "Caja Virtual")
      : (cashBoxInformation?.physicalRegister?.registerName ??
        openRegisterSession?.registerName ??
        "Caja física asignada");

  const cashBoxDayTotal =
    activeCashBoxOperationType === "SERVICIO"
      ? (cashBoxInformation?.totals?.services ?? 0)
      : (cashBoxInformation?.totals?.quiniela ?? 0);

  const recentCashBoxOperations = useMemo(() => {
    if (!activeCashBoxOperationType) {
      return [];
    }

    return (cashBoxInformation?.recentOperations ?? []).filter(
      (operation) => operation.operationType === activeCashBoxOperationType,
    );
  }, [cashBoxInformation, activeCashBoxOperationType]);

  async function loadWithdrawalInformation(showLoadingMessage = true) {
    setIsLoadingWithdrawals(true);

    if (showLoadingMessage) {
      setWithdrawalMessage("Calculando fondos disponibles...");
    }

    try {
      const response = await fetch("/api/cash-withdrawals", {
        method: "GET",
        cache: "no-store",
        credentials: "include",
      });

      const data = (await response.json()) as WithdrawalInformationResponse;

      if (!response.ok) {
        if (response.status === 401) {
          router.replace("/login");
        }

        throw new Error(
          data.error || "No se pudieron cargar las extracciones.",
        );
      }

      setWithdrawalInformation(data);

      const selectedSourceAvailable =
        withdrawalCashSource === "PHYSICAL_REGISTER"
          ? data.physicalSource?.availableAmount
          : data.virtualSource?.availableAmount;

      setWithdrawalMessage(
        `Fondos actualizados. Disponible en el origen seleccionado: ${formatMoney(
          selectedSourceAvailable ?? 0,
        )}.`,
      );
    } catch (error) {
      console.error("Error al cargar extracciones:", error);

      setWithdrawalInformation(null);

      setWithdrawalMessage(
        error instanceof Error
          ? error.message
          : "No se pudieron cargar las extracciones.",
      );
    } finally {
      setIsLoadingWithdrawals(false);
    }
  }

  async function confirmWithdrawal(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!Number.isFinite(withdrawalAmountValue) || withdrawalAmountValue <= 0) {
      setWithdrawalMessage("Ingresá un importe de extracción válido.");
      return;
    }

    if (!withdrawalInformation) {
      setWithdrawalMessage("Primero actualizá los fondos disponibles.");
      return;
    }

    if (withdrawalAmountValue > selectedWithdrawalAvailable) {
      setWithdrawalMessage(
        `No hay fondos suficientes en el origen seleccionado. Disponible: ${formatMoney(
          selectedWithdrawalAvailable,
        )}.`,
      );
      return;
    }

    if (!withdrawalReference.trim()) {
      setWithdrawalMessage("Ingresá una referencia de la transferencia.");
      return;
    }

    const sourceLabel =
      withdrawalCashSource === "PHYSICAL_REGISTER"
        ? (withdrawalInformation.physicalSource?.registerName ?? "Caja física")
        : (withdrawalInformation.virtualSource?.accountName ?? "Fondo virtual");

    const confirmed = window.confirm(
      `¿Confirmás la extracción?

` +
        `Efectivo entregado: ${formatMoney(withdrawalAmountValue)}
` +
        `Comisión (${withdrawalCommissionRate}%): ${formatMoney(
          withdrawalCommission,
        )}
` +
        `Total transferido: ${formatMoney(withdrawalTransferTotal)}
` +
        `Origen del efectivo: ${sourceLabel}`,
    );

    if (!confirmed) {
      return;
    }

    setIsSavingWithdrawal(true);
    setWithdrawalMessage("Registrando extracción...");

    try {
      const response = await fetch("/api/cash-withdrawals", {
        method: "POST",

        headers: {
          "Content-Type": "application/json",
        },

        credentials: "include",

        body: JSON.stringify({
          withdrawalAmount: withdrawalAmountValue,

          cashSource: withdrawalCashSource,

          transferReference: withdrawalReference.trim(),

          notes: withdrawalNotes.trim(),
        }),
      });

      const data = (await response.json()) as WithdrawalResponse;

      if (!response.ok || !data.withdrawal) {
        if (response.status === 401) {
          router.replace("/login");
        }

        throw new Error(data.error || "No se pudo registrar la extracción.");
      }

      setWithdrawalAmount("");
      setWithdrawalReference("");
      setWithdrawalNotes("");

      setWithdrawalMessage(
        `Extracción N.º ${data.withdrawal.operationNumber} registrada. ` +
          `Se entregaron ${formatMoney(
            data.withdrawal.withdrawalAmount,
          )} y el cliente transfirió ${formatMoney(
            data.withdrawal.transferTotal,
          )}.`,
      );

      setStatusMessage(
        `Extracción N.º ${data.withdrawal.operationNumber} registrada por ${data.withdrawal.operatorName}.`,
      );

      await loadWithdrawalInformation(false);
    } catch (error) {
      console.error("Error al registrar extracción:", error);

      setWithdrawalMessage(
        error instanceof Error
          ? error.message
          : "No se pudo registrar la extracción.",
      );
    } finally {
      setIsSavingWithdrawal(false);
    }
  }

  async function loadCashBoxOperationInformation(
    showLoadingMessage = true,
  ) {
    setIsLoadingCashBoxOperations(true);

    if (showLoadingMessage) {
      setCashBoxMessage("Cargando operaciones y destinos...");
    }

    try {
      const response = await fetch("/api/cash-box-operations", {
        method: "GET",
        cache: "no-store",
        credentials: "include",
      });

      const data =
        (await response.json()) as CashBoxOperationsInformationResponse;

      if (!response.ok) {
        if (response.status === 401) {
          router.replace("/login");
        }

        throw new Error(
          data.error || "No se pudieron cargar Servicios y Quiniela.",
        );
      }

      setCashBoxInformation(data);

      if (showLoadingMessage) {
        if (activeOperation === "VIRTUAL" && !data.serviceAvailable) {
          setCashBoxMessage(
            "No hay una Caja Virtual abierta para registrar Servicios y Boletas.",
          );
        } else {
          const destination =
            activeOperation === "VIRTUAL"
              ? (data.virtualRegister?.accountName ?? "Caja Virtual")
              : (data.physicalRegister?.registerName ?? "Caja física asignada");

          setCashBoxMessage(
            `Operación lista. El efectivo se registrará en ${destination}.`,
          );
        }
      }
    } catch (error) {
      console.error("Error al cargar Servicios y Quiniela:", error);

      setCashBoxInformation(null);

      setCashBoxMessage(
        error instanceof Error
          ? error.message
          : "No se pudieron cargar Servicios y Quiniela.",
      );
    } finally {
      setIsLoadingCashBoxOperations(false);
    }
  }

  async function confirmCashBoxOperation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!activeCashBoxOperationType) {
      setCashBoxMessage("Seleccioná Servicios y Boletas o Quiniela.");
      return;
    }

    if (!Number.isFinite(cashBoxAmountValue) || cashBoxAmountValue <= 0) {
      setCashBoxMessage("Ingresá un importe válido.");
      return;
    }

    if (!cashBoxInformation) {
      setCashBoxMessage("Primero actualizá la información de las cajas.");
      return;
    }

    if (
      activeCashBoxOperationType === "SERVICIO" &&
      !cashBoxInformation.serviceAvailable
    ) {
      setCashBoxMessage(
        "No hay una Caja Virtual abierta para registrar esta operación.",
      );
      return;
    }

    const operationLabel =
      activeCashBoxOperationType === "SERVICIO"
        ? "Servicios y Boletas"
        : "Quiniela";

    const confirmed = window.confirm(
      `¿Confirmás la operación?

` +
        `Tipo: ${operationLabel}
` +
        `Importe recibido: ${formatMoney(cashBoxAmountValue)}
` +
        `Destino del efectivo: ${cashBoxDestinationLabel}`,
    );

    if (!confirmed) {
      return;
    }

    setIsSavingCashBoxOperation(true);
    setCashBoxMessage("Registrando operación...");

    try {
      const response = await fetch("/api/cash-box-operations", {
        method: "POST",

        headers: {
          "Content-Type": "application/json",
        },

        credentials: "include",

        body: JSON.stringify({
          operationType: activeCashBoxOperationType,
          amount: cashBoxAmountValue,
          description: operationDescription.trim(),
          reference: operationReference.trim(),
          notes: operationNotes.trim(),
        }),
      });

      const data = (await response.json()) as CashBoxOperationResponse;

      if (!response.ok || !data.operation) {
        if (response.status === 401) {
          router.replace("/login");
        }

        throw new Error(data.error || "No se pudo registrar la operación.");
      }

      setOperationAmount("");
      setOperationDescription("");
      setOperationReference("");
      setOperationNotes("");

      setCashBoxMessage(
        `Operación N.º ${data.operation.operationNumber} registrada por ${formatMoney(
          data.operation.amount,
        )} en ${data.operation.destinationLabel}.`,
      );

      setStatusMessage(
        `${data.operation.operationTypeLabel} N.º ${data.operation.operationNumber} registrado correctamente.`,
      );

      await loadCashBoxOperationInformation(false);
    } catch (error) {
      console.error("Error al registrar Servicios o Quiniela:", error);

      setCashBoxMessage(
        error instanceof Error
          ? error.message
          : "No se pudo registrar la operación.",
      );
    } finally {
      setIsSavingCashBoxOperation(false);
    }
  }

  function addCashBoxOperationToAccount() {
    if (!activeCashBoxOperationType) {
      setCashBoxMessage("Seleccioná Servicios y Boletas o Quiniela.");
      return;
    }

    if (!Number.isFinite(cashBoxAmountValue) || cashBoxAmountValue <= 0) {
      setCashBoxMessage("Ingresá un importe válido.");
      return;
    }

    if (!cashBoxInformation) {
      setCashBoxMessage("Primero actualizá la información de las cajas.");
      return;
    }

    if (
      activeCashBoxOperationType === "SERVICIO" &&
      !cashBoxInformation.serviceAvailable
    ) {
      setCashBoxMessage(
        "No hay una Caja Virtual abierta para agregar esta operación.",
      );
      return;
    }

    const operationType: OperationType =
      activeCashBoxOperationType === "SERVICIO" ? "VIRTUAL" : "QUINIELA";

    const defaultDescription =
      activeCashBoxOperationType === "SERVICIO"
        ? "Carga o pago de servicio"
        : "Quiniela";

    const description = operationDescription.trim() || defaultDescription;

    setSaleItems((currentItems) => [
      ...currentItems,
      {
        lineId: createLineId(),
        productId: null,
        barcode: null,
        name: description,
        quantity: 1,
        unitPrice: cashBoxAmountValue,
        operationType,
        reference: operationReference.trim() || null,
        notes: operationNotes.trim() || null,
      },
    ]);

    setOperationAmount("");
    setOperationDescription("");
    setOperationReference("");
    setOperationNotes("");

    setCashBoxMessage(
      `${description} agregado a la cuenta por ${formatMoney(cashBoxAmountValue)}.`,
    );

    setStatusMessage(
      `${description} agregado a la cuenta. Total actual: ${formatMoney(
        grandTotal + cashBoxAmountValue,
      )}.`,
    );

    setActiveOperation("NEGOCIO");

    window.setTimeout(() => {
      barcodeInputRef.current?.focus();
    }, 0);
  }

  function addProductToSale(product: Product) {
    setSaleItems((currentItems) => {
      const existingItem = currentItems.find(
        (item) =>
          item.productId === product.id && item.operationType === "NEGOCIO",
      );

      if (existingItem) {
        return currentItems.map((item) =>
          item.lineId === existingItem.lineId
            ? {
                ...item,
                quantity: item.quantity + 1,
              }
            : item,
        );
      }

      return [
        ...currentItems,
        {
          lineId: createLineId(),
          productId: product.id,
          barcode: product.barcode,
          name: product.name,
          quantity: 1,
          unitPrice: product.price,
          operationType: "NEGOCIO",
        },
      ];
    });

    setStatusMessage(
      `${product.name} agregado por ${formatMoney(product.price)}.`,
    );
  }

  function openNewProductModal(missingBarcode: string) {
    setNewProductBarcode(missingBarcode);

    setNewProductName("");
    setNewProductCategory("General");
    setNewProductCostPrice("");
    setNewProductSalePrice("");
    setNewProductStock("0");

    setIsNewProductModalOpen(true);

    setStatusMessage(`El código ${missingBarcode} no está registrado.`);
  }

  function closeNewProductModal() {
    setIsNewProductModalOpen(false);
    setIsSavingNewProduct(false);

    window.setTimeout(() => {
      barcodeInputRef.current?.focus();
    }, 0);
  }

  function handleBarcodeSubmit(event: FormEvent) {
    event.preventDefault();

    const searchedBarcode = barcode.trim();

    if (!searchedBarcode) {
      setStatusMessage("Escribí o escaneá un código.");

      barcodeInputRef.current?.focus();
      return;
    }

    const foundProduct = products.find(
      (product) => product.barcode === searchedBarcode,
    );

    setBarcode("");

    if (!foundProduct) {
      openNewProductModal(searchedBarcode);

      return;
    }

    addProductToSale(foundProduct);

    window.setTimeout(() => {
      barcodeInputRef.current?.focus();
    }, 0);
  }

  async function findExistingProduct(
    searchedBarcode: string,
  ): Promise<Product | null> {
    const response = await fetch("/api/products?includeInactive=true", {
      cache: "no-store",
    });

    const data = (await response.json()) as ProductsResponse;

    if (!response.ok) {
      throw new Error(data.error || "No se pudo revisar el producto.");
    }

    return (
      data.products?.find((product) => product.barcode === searchedBarcode) ??
      null
    );
  }

  async function createProductAndAddToSale(event: FormEvent) {
    event.preventDefault();

    const normalizedName = newProductName.trim();

    const normalizedCategory = newProductCategory.trim() || "General";

    const costPrice = parseMoney(newProductCostPrice || "0");

    const salePrice = parseMoney(newProductSalePrice);

    const stock = parseStock(newProductStock || "0");

    if (!normalizedName) {
      setStatusMessage("Ingresá el nombre del producto.");
      return;
    }

    if (!Number.isFinite(costPrice) || costPrice < 0) {
      setStatusMessage("Ingresá un precio de costo válido.");
      return;
    }

    if (!Number.isFinite(salePrice) || salePrice <= 0) {
      setStatusMessage("El precio de venta debe ser mayor que cero.");
      return;
    }

    if (!Number.isFinite(stock) || stock < 0) {
      setStatusMessage("Ingresá un stock válido.");
      return;
    }

    setIsSavingNewProduct(true);

    setStatusMessage(`Guardando ${normalizedName}...`);

    try {
      const response = await fetch("/api/products", {
        method: "POST",

        headers: {
          "Content-Type": "application/json",
        },

        body: JSON.stringify({
          barcode: newProductBarcode,
          name: normalizedName,
          category: normalizedCategory,
          costPrice,
          price: salePrice,
          stock,
        }),
      });

      const data = (await response.json()) as ProductResponse;

      if (response.status === 409) {
        const existingProduct = await findExistingProduct(newProductBarcode);

        if (!existingProduct) {
          throw new Error(data.error || "Ese código ya está registrado.");
        }

        if (!existingProduct.active) {
          throw new Error(
            "Ese código ya existe, pero el producto está desactivado.",
          );
        }

        setProducts((currentProducts) => [
          existingProduct,
          ...currentProducts.filter(
            (product) => product.id !== existingProduct.id,
          ),
        ]);

        addProductToSale(existingProduct);

        closeNewProductModal();

        setStatusMessage(
          `${existingProduct.name} ya estaba registrado y se agregó a la venta.`,
        );

        return;
      }

      if (!response.ok || !data.product) {
        throw new Error(data.error || "No se pudo crear el producto.");
      }

      const createdProduct = data.product;

      setProducts((currentProducts) => [
        createdProduct,
        ...currentProducts.filter(
          (product) => product.id !== createdProduct.id,
        ),
      ]);

      addProductToSale(createdProduct);

      closeNewProductModal();

      setStatusMessage(
        `${createdProduct.name} fue guardado y agregado a la venta.`,
      );
    } catch (error) {
      console.error("Error al crear producto:", error);

      setStatusMessage(
        error instanceof Error
          ? error.message
          : "No se pudo crear el producto.",
      );
    } finally {
      setIsSavingNewProduct(false);
    }
  }

  function addUnknownProductOnlyToSale() {
    const normalizedName = newProductName.trim();

    const salePrice = parseMoney(newProductSalePrice);

    if (!normalizedName) {
      setStatusMessage("Ingresá una descripción.");
      return;
    }

    if (!Number.isFinite(salePrice) || salePrice <= 0) {
      setStatusMessage("Ingresá un precio de venta válido.");
      return;
    }

    setSaleItems((currentItems) => [
      ...currentItems,
      {
        lineId: createLineId(),
        productId: null,
        barcode: newProductBarcode,
        name: normalizedName,
        quantity: 1,
        unitPrice: salePrice,
        operationType: "NEGOCIO",
      },
    ]);

    closeNewProductModal();

    setStatusMessage(`${normalizedName} fue agregado solo a esta venta.`);
  }

  function addManualProduct(event: FormEvent) {
    event.preventDefault();

    const amount = parseMoney(manualPrice);

    const description = manualDescription.trim();

    if (!description) {
      setStatusMessage("Escribí el nombre del producto manual.");
      return;
    }

    if (!Number.isFinite(amount) || amount <= 0) {
      setStatusMessage("Ingresá un precio manual válido.");
      return;
    }

    setSaleItems((currentItems) => [
      ...currentItems,
      {
        lineId: createLineId(),
        productId: null,
        barcode: null,
        name: description,
        quantity: 1,
        unitPrice: amount,
        operationType: "NEGOCIO",
      },
    ]);

    setManualDescription("");
    setManualPrice("");

    setStatusMessage(`${description} agregado manualmente.`);
  }

  function changeQuantity(lineId: string, difference: number) {
    setSaleItems((currentItems) =>
      currentItems
        .map((item) =>
          item.lineId === lineId
            ? {
                ...item,
                quantity: item.quantity + difference,
              }
            : item,
        )
        .filter((item) => item.quantity > 0),
    );
  }

  function changeItemPrice(lineId: string, newPrice: number) {
    if (!Number.isFinite(newPrice) || newPrice < 0) {
      return;
    }

    setSaleItems((currentItems) =>
      currentItems.map((item) =>
        item.lineId === lineId
          ? {
              ...item,
              unitPrice: newPrice,
            }
          : item,
      ),
    );
  }

  async function saveProductPrice(item: SaleItem) {
    if (!item.productId) {
      setStatusMessage("Este producto fue agregado manualmente.");

      return;
    }

    if (!Number.isFinite(item.unitPrice) || item.unitPrice <= 0) {
      setStatusMessage("El nuevo precio debe ser mayor que cero.");

      return;
    }

    setStatusMessage(`Guardando el nuevo precio de ${item.name}...`);

    try {
      const response = await fetch("/api/products", {
        method: "PATCH",

        headers: {
          "Content-Type": "application/json",
        },

        body: JSON.stringify({
          productId: item.productId,
          price: item.unitPrice,
          changedBy: currentUser?.displayName ?? "Cajera",
        }),
      });

      const data = (await response.json()) as ProductResponse;

      if (!response.ok || !data.product) {
        throw new Error(data.error || "No se pudo guardar el precio.");
      }

      const updatedProduct = data.product;

      setProducts((currentProducts) =>
        currentProducts.map((product) =>
          product.id === updatedProduct.id ? updatedProduct : product,
        ),
      );

      setSaleItems((currentItems) =>
        currentItems.map((currentItem) =>
          currentItem.productId === updatedProduct.id
            ? {
                ...currentItem,
                unitPrice: updatedProduct.price,
              }
            : currentItem,
        ),
      );

      setStatusMessage(
        `Nuevo precio guardado para ${updatedProduct.name}: ${formatMoney(
          updatedProduct.price,
        )}.`,
      );
    } catch (error) {
      console.error("Error al guardar precio:", error);

      setStatusMessage(
        error instanceof Error
          ? error.message
          : "No se pudo guardar el precio.",
      );
    }
  }

  function removeItem(lineId: string) {
    setSaleItems((currentItems) =>
      currentItems.filter((item) => item.lineId !== lineId),
    );

    setStatusMessage("Ítem eliminado de la cuenta.");
  }

  function clearSale() {
    setSaleItems([]);
    setStatusMessage("Cuenta vaciada.");

    barcodeInputRef.current?.focus();
  }

  function handleCheckout() {
    if (saleItems.length === 0) {
      setStatusMessage("No hay productos ni operaciones para cobrar.");
      return;
    }

    setPaymentMethod("EFECTIVO");

    setCashReceived(String(grandTotal));

    setPaymentReference("");

    setMixedCash("");
    setMixedTransfer("");
    setMixedCard("");
    setMixedReference("");

    setCheckoutMessage("Seleccioná el medio de pago.");

    setIsCheckoutModalOpen(true);
  }

  function closeCheckoutModal() {
    if (isSavingSale) {
      return;
    }

    setIsCheckoutModalOpen(false);
    setCheckoutMessage("");

    window.setTimeout(() => {
      barcodeInputRef.current?.focus();
    }, 0);
  }

  function selectPaymentMethod(method: PaymentMethod) {
    const cashOnlyTotal = categoryTotals.VIRTUAL + categoryTotals.QUINIELA;

    if (
      cashOnlyTotal > 0 &&
      (method === "TRANSFERENCIA" || method === "TARJETA")
    ) {
      setCheckoutMessage(
        `Las cargas, Servicios y Quiniela requieren ${formatMoney(
          cashOnlyTotal,
        )} en efectivo. Usá Efectivo o Mixto.`,
      );
      return;
    }

    setPaymentMethod(method);
    setCheckoutMessage("");

    if (method === "EFECTIVO") {
      setCashReceived(String(grandTotal));
    }
  }

  async function confirmSale(event: FormEvent) {
    event.preventDefault();

    const cashOnlyTotal = categoryTotals.VIRTUAL + categoryTotals.QUINIELA;

    let payments: Array<{
      method: PaymentPartMethod;
      amount: number;
      reference?: string;
    }> = [];

    if (paymentMethod === "EFECTIVO") {
      if (
        !Number.isFinite(parsedCashReceived) ||
        parsedCashReceived < grandTotal
      ) {
        setCheckoutMessage(
          "El efectivo recibido no alcanza para cubrir la cuenta.",
        );
        return;
      }

      payments = [
        {
          method: "EFECTIVO",
          amount: grandTotal,
        },
      ];
    }

    if (
      paymentMethod === "TRANSFERENCIA" ||
      paymentMethod === "TARJETA"
    ) {
      if (cashOnlyTotal > 0) {
        setCheckoutMessage(
          `Las cargas, Servicios y Quiniela requieren ${formatMoney(
            cashOnlyTotal,
          )} en efectivo.`,
        );
        return;
      }

      payments = [
        {
          method: paymentMethod,
          amount: grandTotal,
          reference: paymentReference.trim(),
        },
      ];
    }

    if (paymentMethod === "MIXTO") {
      const possiblePayments = [
        {
          method: "EFECTIVO" as const,
          amount: parseMoney(mixedCash || "0"),
        },
        {
          method: "TRANSFERENCIA" as const,
          amount: parseMoney(mixedTransfer || "0"),
          reference: mixedReference.trim(),
        },
        {
          method: "TARJETA" as const,
          amount: parseMoney(mixedCard || "0"),
          reference: mixedReference.trim(),
        },
      ];

      payments = possiblePayments.filter(
        (payment) => Number.isFinite(payment.amount) && payment.amount > 0,
      );

      if (payments.length < 2) {
        setCheckoutMessage("En el pago mixto usá al menos dos medios de pago.");
        return;
      }

      if (Math.abs(mixedTotal - grandTotal) > 0.009) {
        setCheckoutMessage(
          `Los pagos deben sumar exactamente ${formatMoney(grandTotal)}.`,
        );
        return;
      }

      const cashEntered = payments
        .filter((payment) => payment.method === "EFECTIVO")
        .reduce((total, payment) => total + payment.amount, 0);

      if (cashEntered + 0.009 < cashOnlyTotal) {
        setCheckoutMessage(
          `Ingresá al menos ${formatMoney(
            cashOnlyTotal,
          )} en efectivo para cubrir las cargas, Servicios y Quiniela.`,
        );
        return;
      }
    }

    setIsSavingSale(true);
    setCheckoutMessage("Guardando cuenta...");

    try {
      const response = await fetch("/api/sales", {
        method: "POST",

        headers: {
          "Content-Type": "application/json",
        },

        credentials: "include",

        body: JSON.stringify({
          items: saleItems.map((item) => ({
            productId: item.productId,
            barcode: item.barcode,
            name: item.name,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            operationType: item.operationType,
            reference: item.reference,
            notes: item.notes,
          })),

          paymentMethod,
          payments,
        }),
      });

      const data = (await response.json()) as SaleResponse;

      if (
        !response.ok ||
        (!data.sale && (!data.operations || data.operations.length === 0))
      ) {
        if (response.status === 401) {
          router.replace("/login");
        }

        throw new Error(data.error || "No se pudo guardar la cuenta.");
      }

      const createdSale = data.sale ?? null;
      const createdOperations = data.operations ?? [];

      setSaleItems([]);

      try {
        const loadedProducts = await fetchProducts();

        setProducts(loadedProducts);
      } catch (refreshError) {
        console.error("No se pudo actualizar el stock visual:", refreshError);
      }

      setIsCheckoutModalOpen(false);

      const savedParts: string[] = [];

      if (createdSale) {
        savedParts.push(`Venta N.º ${createdSale.saleNumber}`);
      }

      if (createdOperations.length === 1) {
        savedParts.push(
          `${createdOperations[0].operationTypeLabel} N.º ${createdOperations[0].operationNumber}`,
        );
      }

      if (createdOperations.length > 1) {
        savedParts.push(`${createdOperations.length} operaciones en efectivo`);
      }

      setStatusMessage(
        `${savedParts.join(" + ")} guardada correctamente por ${
          currentUser?.displayName ?? createdSale?.createdBy ?? "la cajera"
        } por ${formatMoney(data.summary?.grandTotal ?? grandTotal)}.`,
      );

      if (createdOperations.length > 0) {
        await loadCashBoxOperationInformation(false);
      }

      window.setTimeout(() => {
        barcodeInputRef.current?.focus();
      }, 0);
    } catch (error) {
      console.error("Error al cobrar:", error);

      setCheckoutMessage(
        error instanceof Error ? error.message : "No se pudo guardar la cuenta.",
      );
    } finally {
      setIsSavingSale(false);
    }
  }

  async function handleLogout() {
    setIsLoggingOut(true);
    setStatusMessage("Cerrando sesión...");

    try {
      const response = await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "include",
      });

      const data = (await response.json()) as {
        message?: string;
        error?: string;
      };

      if (!response.ok) {
        throw new Error(data.error || "No se pudo cerrar la sesión.");
      }

      setSaleItems([]);
      setCurrentUser(null);
      setOpenRegisterSession(null);

      router.replace("/login");
      router.refresh();
    } catch (error) {
      console.error("Error al cerrar sesión:", error);

      setStatusMessage(
        error instanceof Error ? error.message : "No se pudo cerrar la sesión.",
      );
    } finally {
      setIsLoggingOut(false);
    }
  }

  if (isCheckingSession || !currentUser || !openRegisterSession) {
    return (
      <main className={styles.page}>
        <section className={styles.panel}>
          <p className={styles.eyebrow}>CONTROL DE ACCESO</p>

          <h1 className={styles.title}>Comprobando sesión</h1>

          <p className={styles.hint}>
            Verificando la cajera y la caja asignada...
          </p>
        </section>
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>SISTEMA DE PUNTO DE VENTA</p>

          <h1 className={styles.title}>Mi Caja</h1>
        </div>

        <div className={styles.userBox}>
          <span>{openRegisterSession.registerName ?? "Caja física"}</span>

          <strong>{currentUser.displayName}</strong>

          <button
            type="button"
            className={styles.secondaryButton}
            onClick={handleLogout}
            disabled={isLoggingOut}
          >
            {isLoggingOut ? "Saliendo..." : "Cerrar sesión"}
          </button>
        </div>
      </header>

      <nav className={styles.tabs}>
        {(Object.entries(operationLabels) as [OperationType, string][]).map(
          ([operationType, label]) => (
            <button
              key={operationType}
              type="button"
              className={`${styles.tab} ${
                activeOperation === operationType ? styles.tabActive : ""
              }`}
              onClick={() => setActiveOperation(operationType)}
            >
              {label}
            </button>
          ),
        )}
      </nav>

      <section
        className={`${styles.mainGrid} ${
          activeOperation === "NEGOCIO" ? styles.businessMainGrid : ""
        }`}
      >
        <section
          className={`${styles.panel} ${
            activeOperation === "NEGOCIO" ? styles.businessPanel : ""
          }`}
        >
          {activeOperation === "NEGOCIO" ? (
            <>
              <div className={styles.businessHeading}>
                <div>
                  <p className={styles.eyebrow}>VENTA DE NEGOCIO</p>

                  <h2 className={styles.panelTitle}>Nueva venta</h2>

                  <p className={styles.hint}>
                    Escaneá un producto o cargalo manualmente. Todo lo agregado
                    aparecerá debajo.
                  </p>
                </div>

                <span className={styles.itemCount}>{saleItems.length}</span>
              </div>

              <div className={styles.entryGrid}>
                <section className={styles.entryCard}>
                  <div className={styles.entryCardHeader}>
                    <span className={styles.entryIcon}>▦</span>

                    <div>
                      <h3>Escanear o escribir código</h3>

                      <p>Usá la lectora o escribí el código y presioná Enter.</p>
                    </div>
                  </div>

                  <form
                    className={styles.scanForm}
                    onSubmit={handleBarcodeSubmit}
                  >
                    <input
                      ref={barcodeInputRef}
                      className={styles.scanInput}
                      value={barcode}
                      onChange={(event) => setBarcode(event.target.value)}
                      placeholder="Código de barras"
                      autoComplete="off"
                    />

                    <button className={styles.primaryButton} type="submit">
                      Agregar
                    </button>
                  </form>
                </section>

                <form
                  className={`${styles.entryCard} ${styles.manualEntryCard}`}
                  onSubmit={addManualProduct}
                >
                  <div className={styles.entryCardHeader}>
                    <span className={styles.entryIcon}>＋</span>

                    <div>
                      <h3>Producto sin código</h3>

                      <p>Para pan, caramelos o mercadería suelta.</p>
                    </div>
                  </div>

                  <div className={styles.manualFields}>
                    <label className={styles.field}>
                      <span>Descripción</span>

                      <input
                        className={styles.input}
                        value={manualDescription}
                        onChange={(event) =>
                          setManualDescription(event.target.value)
                        }
                        placeholder="Ejemplo: 1 kg de pan"
                      />
                    </label>

                    <label className={styles.field}>
                      <span>Precio</span>

                      <input
                        className={styles.input}
                        value={manualPrice}
                        onChange={(event) => setManualPrice(event.target.value)}
                        placeholder="Ejemplo: 2500"
                        inputMode="decimal"
                      />
                    </label>
                  </div>

                  <button className={styles.primaryButton} type="submit">
                    Agregar manual
                  </button>
                </form>
              </div>

              <section className={styles.saleWorkspace}>
                <div className={styles.saleWorkspaceHeader}>
                  <div>
                    <p className={styles.eyebrow}>CUENTA ACTUAL</p>

                    <h2 className={styles.panelTitle}>
                      Productos y operaciones agregadas
                    </h2>
                  </div>

                  <span className={styles.saleItemCounter}>
                    {saleItems.length === 1
                      ? "1 ítem"
                      : `${saleItems.length} ítems`}
                  </span>
                </div>

                {saleItems.length === 0 ? (
                  <div className={styles.emptyCart}>
                    <span>🛒</span>

                    <strong>Todavía no agregaste nada a la cuenta</strong>

                    <p>
                      Escaneá un producto, cargalo manualmente o agregá una
                      carga, Servicio o Quiniela desde su pestaña.
                    </p>
                  </div>
                ) : (
                  <div className={`${styles.itemList} ${styles.saleItemList}`}>
                    {saleItems.map((item) => {
                      const isBusinessItem = item.operationType === "NEGOCIO";

                      return (
                        <article key={item.lineId} className={styles.itemCard}>
                          <div className={styles.itemTop}>
                            <span className={styles.itemType}>
                              {operationLabels[item.operationType]}
                            </span>

                            <button
                              type="button"
                              className={styles.removeButton}
                              onClick={() => removeItem(item.lineId)}
                            >
                              Eliminar
                            </button>
                          </div>

                          <h3 className={styles.itemName}>{item.name}</h3>

                          {item.barcode && (
                            <p className={styles.barcodeText}>
                              Código: {item.barcode}
                            </p>
                          )}

                          {item.reference && (
                            <p className={styles.barcodeText}>
                              Referencia: {item.reference}
                            </p>
                          )}

                          <div className={styles.itemControls}>
                            {isBusinessItem && (
                              <div className={styles.quantityBlock}>
                                <span>Cantidad</span>

                                <div className={styles.quantityControl}>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      changeQuantity(item.lineId, -1)
                                    }
                                  >
                                    −
                                  </button>

                                  <strong>{item.quantity}</strong>

                                  <button
                                    type="button"
                                    onClick={() =>
                                      changeQuantity(item.lineId, 1)
                                    }
                                  >
                                    +
                                  </button>
                                </div>
                              </div>
                            )}

                            <label className={styles.priceBlock}>
                              <span>
                                {isBusinessItem ? "Precio unitario" : "Importe"}
                              </span>

                              <input
                                className={styles.priceInput}
                                type="number"
                                min="0"
                                step="1"
                                value={item.unitPrice}
                                onChange={(event) =>
                                  changeItemPrice(
                                    item.lineId,
                                    Number(event.target.value),
                                  )
                                }
                              />
                            </label>
                          </div>

                          <div className={styles.itemFooter}>
                            {item.productId ? (
                              <button
                                type="button"
                                className={styles.savePriceButton}
                                onClick={() => void saveProductPrice(item)}
                              >
                                Guardar como nuevo precio
                              </button>
                            ) : (
                              <span className={styles.manualLabel}>
                                {item.operationType === "VIRTUAL"
                                  ? "Carga / Servicio"
                                  : item.operationType === "QUINIELA"
                                    ? "Quiniela"
                                    : "Carga manual"}
                              </span>
                            )}

                            <strong className={styles.lineTotal}>
                              {formatMoney(item.unitPrice * item.quantity)}
                            </strong>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                )}

                <div className={styles.status}>{statusMessage}</div>

                <div className={styles.saleBottom}>
                  <div className={styles.saleSummaryCard}>
                    <p className={styles.eyebrow}>RESUMEN</p>

                    <div className={styles.summary}>
                      <div className={styles.summaryRow}>
                        <span>Ítems cargados</span>

                        <strong>{saleItems.length}</strong>
                      </div>

                      <div className={styles.summaryRow}>
                        <span>Productos de Negocio</span>

                        <strong>{formatMoney(categoryTotals.NEGOCIO)}</strong>
                      </div>

                      {categoryTotals.VIRTUAL > 0 && (
                        <div className={styles.summaryRow}>
                          <span>Cargas, Servicios y Boletas</span>

                          <strong>{formatMoney(categoryTotals.VIRTUAL)}</strong>
                        </div>
                      )}

                      {categoryTotals.QUINIELA > 0 && (
                        <div className={styles.summaryRow}>
                          <span>Quiniela</span>

                          <strong>{formatMoney(categoryTotals.QUINIELA)}</strong>
                        </div>
                      )}

                      <div
                        className={`${styles.summaryRow} ${styles.totalRow}`}
                      >
                        <span>Total de la cuenta</span>

                        <strong>{formatMoney(grandTotal)}</strong>
                      </div>
                    </div>
                  </div>

                  <div className={styles.saleActionsCard}>
                    <p>
                      Revisá todos los ítems y el total antes de continuar con
                      el cobro.
                    </p>

                    <div className={styles.actions}>
                      <button
                        type="button"
                        className={styles.secondaryButton}
                        onClick={clearSale}
                        disabled={saleItems.length === 0}
                      >
                        Vaciar cuenta
                      </button>

                      <button
                        type="button"
                        className={styles.checkoutButton}
                        onClick={handleCheckout}
                        disabled={saleItems.length === 0}
                      >
                        Cobrar {formatMoney(grandTotal)}
                      </button>
                    </div>
                  </div>
                </div>
              </section>
            </>
          ) : activeOperation === "RETIRO" ? (
            <div className={styles.operationBox}>
              <span className={styles.operationBadge}>
                EXTRACCIÓN CONTRA TRANSFERENCIA
              </span>

              <h2 className={styles.panelTitle}>Entregar efectivo</h2>

              <p className={styles.hint}>
                El cliente recibe efectivo y transfiere el importe más una
                comisión del {withdrawalCommissionRate}%.
              </p>

              <form onSubmit={confirmWithdrawal}>
                <label className={styles.field}>
                  <span>Importe que retira el cliente</span>

                  <input
                    className={styles.input}
                    value={withdrawalAmount}
                    onChange={(event) =>
                      setWithdrawalAmount(event.target.value)
                    }
                    placeholder="Ejemplo: 5000"
                    inputMode="decimal"
                    autoFocus
                  />
                </label>

                <div
                  style={{
                    marginTop: "16px",
                    display: "grid",
                    gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
                    gap: "10px",
                  }}
                >
                  <div
                    style={{
                      padding: "13px",
                      border: "1px solid #dbe3ef",
                      borderRadius: "12px",
                      background: "#ffffff",
                    }}
                  >
                    <span
                      style={{
                        display: "block",
                        color: "#64748b",
                        fontSize: "11px",
                        fontWeight: 800,
                      }}
                    >
                      Efectivo entregado
                    </span>

                    <strong
                      style={{
                        display: "block",
                        marginTop: "6px",
                        fontSize: "18px",
                      }}
                    >
                      {formatMoney(withdrawalAmountValue)}
                    </strong>
                  </div>

                  <div
                    style={{
                      padding: "13px",
                      border: "1px solid #bfdbfe",
                      borderRadius: "12px",
                      background: "#eff6ff",
                    }}
                  >
                    <span
                      style={{
                        display: "block",
                        color: "#1d4f9e",
                        fontSize: "11px",
                        fontWeight: 800,
                      }}
                    >
                      Comisión {withdrawalCommissionRate}%
                    </span>

                    <strong
                      style={{
                        display: "block",
                        marginTop: "6px",
                        color: "#174fae",
                        fontSize: "18px",
                      }}
                    >
                      {formatMoney(withdrawalCommission)}
                    </strong>
                  </div>

                  <div
                    style={{
                      padding: "13px",
                      border: "1px solid #bbf7d0",
                      borderRadius: "12px",
                      background: "#ecfdf3",
                    }}
                  >
                    <span
                      style={{
                        display: "block",
                        color: "#166534",
                        fontSize: "11px",
                        fontWeight: 800,
                      }}
                    >
                      Total a transferir
                    </span>

                    <strong
                      style={{
                        display: "block",
                        marginTop: "6px",
                        color: "#166534",
                        fontSize: "20px",
                      }}
                    >
                      {formatMoney(withdrawalTransferTotal)}
                    </strong>
                  </div>
                </div>

                <fieldset
                  style={{
                    margin: "18px 0 0",
                    padding: 0,
                    border: 0,
                  }}
                >
                  <legend
                    style={{
                      marginBottom: "9px",
                      color: "#526074",
                      fontSize: "12px",
                      fontWeight: 900,
                    }}
                  >
                    ¿De dónde sale el efectivo?
                  </legend>

                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                      gap: "10px",
                    }}
                  >
                    <label
                      style={{
                        padding: "13px",
                        display: "flex",
                        alignItems: "flex-start",
                        gap: "9px",
                        border:
                          withdrawalCashSource === "PHYSICAL_REGISTER"
                            ? "2px solid #2563eb"
                            : "1px solid #dbe3ef",
                        borderRadius: "12px",
                        background:
                          withdrawalCashSource === "PHYSICAL_REGISTER"
                            ? "#eff6ff"
                            : "#ffffff",
                        cursor: "pointer",
                      }}
                    >
                      <input
                        type="radio"
                        name="withdrawal-source"
                        value="PHYSICAL_REGISTER"
                        checked={withdrawalCashSource === "PHYSICAL_REGISTER"}
                        onChange={() =>
                          setWithdrawalCashSource("PHYSICAL_REGISTER")
                        }
                      />

                      <span>
                        <strong
                          style={{
                            display: "block",
                          }}
                        >
                          {withdrawalInformation?.physicalSource
                            ?.registerName ??
                            openRegisterSession.registerName ??
                            "Caja física asignada"}
                        </strong>

                        <small
                          style={{
                            display: "block",
                            marginTop: "4px",
                            color: "#64748b",
                          }}
                        >
                          Disponible:{" "}
                          {formatMoney(
                            withdrawalInformation?.physicalSource
                              ?.availableAmount ?? 0,
                          )}
                        </small>
                      </span>
                    </label>

                    <label
                      style={{
                        padding: "13px",
                        display: "flex",
                        alignItems: "flex-start",
                        gap: "9px",
                        border:
                          withdrawalCashSource === "VIRTUAL_ACCOUNT"
                            ? "2px solid #2563eb"
                            : "1px solid #dbe3ef",
                        borderRadius: "12px",
                        background:
                          withdrawalCashSource === "VIRTUAL_ACCOUNT"
                            ? "#eff6ff"
                            : "#ffffff",
                        cursor: "pointer",
                      }}
                    >
                      <input
                        type="radio"
                        name="withdrawal-source"
                        value="VIRTUAL_ACCOUNT"
                        checked={withdrawalCashSource === "VIRTUAL_ACCOUNT"}
                        onChange={() =>
                          setWithdrawalCashSource("VIRTUAL_ACCOUNT")
                        }
                      />

                      <span>
                        <strong
                          style={{
                            display: "block",
                          }}
                        >
                          {withdrawalInformation?.virtualSource?.accountName ??
                            "Fondo virtual"}
                        </strong>

                        <small
                          style={{
                            display: "block",
                            marginTop: "4px",
                            color: "#64748b",
                          }}
                        >
                          Disponible:{" "}
                          {formatMoney(
                            withdrawalInformation?.virtualSource
                              ?.availableAmount ?? 0,
                          )}
                        </small>
                      </span>
                    </label>
                  </div>
                </fieldset>

                <label className={styles.field}>
                  <span>Referencia de la transferencia</span>

                  <input
                    className={styles.input}
                    value={withdrawalReference}
                    onChange={(event) =>
                      setWithdrawalReference(event.target.value)
                    }
                    placeholder="Número de operación o titular"
                  />
                </label>

                <label className={styles.field}>
                  <span>Observación opcional</span>

                  <input
                    className={styles.input}
                    value={withdrawalNotes}
                    onChange={(event) => setWithdrawalNotes(event.target.value)}
                    placeholder="Detalle adicional"
                  />
                </label>

                <div
                  style={{
                    marginTop: "15px",
                    padding: "12px 13px",
                    border: "1px solid #c7d8f3",
                    borderRadius: "11px",
                    background: "#edf4ff",
                    color: "#275ba9",
                    fontSize: "13px",
                    fontWeight: 800,
                  }}
                >
                  {withdrawalMessage}
                </div>

                <div
                  style={{
                    marginTop: "16px",
                    display: "flex",
                    gap: "10px",
                    flexWrap: "wrap",
                  }}
                >
                  <button
                    type="button"
                    className={styles.secondaryButton}
                    onClick={() => void loadWithdrawalInformation()}
                    disabled={isLoadingWithdrawals || isSavingWithdrawal}
                  >
                    {isLoadingWithdrawals
                      ? "Actualizando..."
                      : "Actualizar fondos"}
                  </button>

                  <button
                    className={styles.primaryButton}
                    type="submit"
                    disabled={
                      isSavingWithdrawal ||
                      isLoadingWithdrawals ||
                      !withdrawalInformation
                    }
                  >
                    {isSavingWithdrawal
                      ? "Registrando..."
                      : `Confirmar extracción ${formatMoney(
                          withdrawalAmountValue,
                        )}`}
                  </button>
                </div>
              </form>

              <div
                className={styles.sampleBox}
                style={{
                  marginTop: "20px",
                }}
              >
                <strong>Últimas extracciones</strong>

                {(withdrawalInformation?.recentWithdrawals?.length ?? 0) ===
                0 ? (
                  <p className={styles.hint}>
                    Todavía no hay extracciones registradas en esta jornada.
                  </p>
                ) : (
                  <div
                    style={{
                      marginTop: "12px",
                      display: "grid",
                      gap: "9px",
                    }}
                  >
                    {withdrawalInformation?.recentWithdrawals?.map(
                      (withdrawal) => (
                        <article
                          key={withdrawal.id}
                          style={{
                            padding: "12px",
                            border: "1px solid #e2e8f0",
                            borderRadius: "11px",
                            background: "#ffffff",
                          }}
                        >
                          <div
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              gap: "12px",
                            }}
                          >
                            <div>
                              <strong>
                                Extracción N.º {withdrawal.operationNumber}
                              </strong>

                              <small
                                style={{
                                  display: "block",
                                  marginTop: "3px",
                                  color: "#64748b",
                                }}
                              >
                                {withdrawal.operatorName} ·{" "}
                                {formatDateTime(withdrawal.createdAt)}
                              </small>
                            </div>

                            <strong>
                              {formatMoney(withdrawal.withdrawalAmount)}
                            </strong>
                          </div>

                          <p
                            style={{
                              margin: "8px 0 0",
                              color: "#526074",
                              fontSize: "13px",
                            }}
                          >
                            Comisión: {formatMoney(withdrawal.commissionAmount)}{" "}
                            · Transferencia:{" "}
                            {formatMoney(withdrawal.transferTotal)}
                          </p>

                          <p
                            style={{
                              margin: "5px 0 0",
                              color: "#64748b",
                              fontSize: "12px",
                            }}
                          >
                            Origen:{" "}
                            {withdrawal.cashSource === "PHYSICAL_REGISTER"
                              ? (withdrawal.registerName ?? "Caja física")
                              : withdrawal.virtualAccountName}
                            {withdrawal.transferReference
                              ? ` · Ref.: ${withdrawal.transferReference}`
                              : ""}
                          </p>
                        </article>
                      ),
                    )}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className={styles.operationBox}>
              <span className={styles.operationBadge}>
                {activeOperation === "VIRTUAL"
                  ? "SERVICIOS Y BOLETAS"
                  : "QUINIELA"}
              </span>

              <h2 className={styles.panelTitle}>
                {activeOperation === "VIRTUAL"
                  ? "Registrar pago de servicio"
                  : "Registrar Quiniela"}
              </h2>

              <p className={styles.hint}>
                {activeOperation === "VIRTUAL"
                  ? "El efectivo recibido se sumará automáticamente a Caja Virtual."
                  : "El efectivo recibido se sumará automáticamente a la caja física asignada."}
              </p>

              <form onSubmit={confirmCashBoxOperation}>
                <div
                  style={{
                    marginTop: "16px",
                    padding: "14px",
                    border: "1px solid #bfdbfe",
                    borderRadius: "12px",
                    background: "#eff6ff",
                  }}
                >
                  <span
                    style={{
                      display: "block",
                      color: "#1d4f9e",
                      fontSize: "11px",
                      fontWeight: 900,
                    }}
                  >
                    DESTINO DEL EFECTIVO
                  </span>

                  <strong
                    style={{
                      display: "block",
                      marginTop: "5px",
                      color: "#174fae",
                      fontSize: "18px",
                    }}
                  >
                    {cashBoxDestinationLabel}
                  </strong>
                </div>

                <label className={styles.field}>
                  <span>Importe recibido en efectivo</span>

                  <input
                    className={styles.input}
                    value={operationAmount}
                    onChange={(event) => setOperationAmount(event.target.value)}
                    placeholder="Ejemplo: 5000"
                    inputMode="decimal"
                    autoFocus
                  />
                </label>

                <label className={styles.field}>
                  <span>Descripción opcional</span>

                  <input
                    className={styles.input}
                    value={operationDescription}
                    onChange={(event) =>
                      setOperationDescription(event.target.value)
                    }
                    placeholder={
                      activeOperation === "VIRTUAL"
                        ? "Ejemplo: Pago de luz"
                        : "Ejemplo: Quiniela nocturna"
                    }
                  />
                </label>

                <label className={styles.field}>
                  <span>Referencia o comprobante opcional</span>

                  <input
                    className={styles.input}
                    value={operationReference}
                    onChange={(event) =>
                      setOperationReference(event.target.value)
                    }
                    placeholder="Número de ticket, boleta o comprobante"
                  />
                </label>

                <label className={styles.field}>
                  <span>Observación opcional</span>

                  <input
                    className={styles.input}
                    value={operationNotes}
                    onChange={(event) => setOperationNotes(event.target.value)}
                    placeholder="Detalle adicional"
                  />
                </label>

                <div
                  style={{
                    marginTop: "15px",
                    padding: "12px 13px",
                    border: "1px solid #c7d8f3",
                    borderRadius: "11px",
                    background: "#edf4ff",
                    color: "#275ba9",
                    fontSize: "13px",
                    fontWeight: 800,
                  }}
                >
                  {cashBoxMessage}
                </div>

                <div
                  style={{
                    marginTop: "16px",
                    display: "flex",
                    gap: "10px",
                    flexWrap: "wrap",
                  }}
                >
                  <button
                    className={styles.primaryButton}
                    type="button"
                    onClick={addCashBoxOperationToAccount}
                    disabled={
                      isSavingCashBoxOperation ||
                      isLoadingCashBoxOperations ||
                      !cashBoxInformation ||
                      (activeOperation === "VIRTUAL" &&
                        !cashBoxInformation.serviceAvailable)
                    }
                  >
                    Agregar a la cuenta {formatMoney(cashBoxAmountValue)}
                  </button>

                  <button
                    className={styles.secondaryButton}
                    type="submit"
                    disabled={
                      isSavingCashBoxOperation ||
                      isLoadingCashBoxOperations ||
                      !cashBoxInformation ||
                      (activeOperation === "VIRTUAL" &&
                        !cashBoxInformation.serviceAvailable)
                    }
                  >
                    {isSavingCashBoxOperation
                      ? "Registrando..."
                      : "Registrar por separado"}
                  </button>

                  <button
                    type="button"
                    className={styles.secondaryButton}
                    onClick={() => void loadCashBoxOperationInformation()}
                    disabled={
                      isLoadingCashBoxOperations || isSavingCashBoxOperation
                    }
                  >
                    {isLoadingCashBoxOperations
                      ? "Actualizando..."
                      : "Actualizar información"}
                  </button>
                </div>
              </form>

              <div
                className={styles.sampleBox}
                style={{
                  marginTop: "20px",
                }}
              >
                <strong>
                  {activeOperation === "VIRTUAL"
                    ? "Últimos Servicios y Boletas"
                    : "Últimas operaciones de Quiniela"}
                </strong>

                {recentCashBoxOperations.length === 0 ? (
                  <p className={styles.hint}>
                    Todavía no hay operaciones de este tipo en la jornada.
                  </p>
                ) : (
                  <div
                    style={{
                      marginTop: "12px",
                      display: "grid",
                      gap: "9px",
                    }}
                  >
                    {recentCashBoxOperations.map((operation) => (
                      <article
                        key={operation.id}
                        style={{
                          padding: "12px",
                          border: "1px solid #e2e8f0",
                          borderRadius: "11px",
                          background: "#ffffff",
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            gap: "12px",
                          }}
                        >
                          <div>
                            <strong>
                              Operación N.º {operation.operationNumber}
                            </strong>

                            <small
                              style={{
                                display: "block",
                                marginTop: "3px",
                                color: "#64748b",
                              }}
                            >
                              {operation.operatorName} ·{" "}
                              {formatDateTime(operation.createdAt)}
                            </small>
                          </div>

                          <strong>{formatMoney(operation.amount)}</strong>
                        </div>

                        <p
                          style={{
                            margin: "8px 0 0",
                            color: "#526074",
                            fontSize: "13px",
                          }}
                        >
                          {operation.description || operation.operationTypeLabel}
                        </p>

                        <p
                          style={{
                            margin: "5px 0 0",
                            color: "#64748b",
                            fontSize: "12px",
                          }}
                        >
                          Destino: {operation.destinationLabel}
                          {operation.reference
                            ? ` · Ref.: ${operation.reference}`
                            : ""}
                        </p>
                      </article>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </section>

        {activeOperation === "RETIRO" ? (
          <aside className={`${styles.panel} ${styles.cartPanel}`}>
            <div className={styles.cartHeader}>
              <div>
                <p className={styles.eyebrow}>RESUMEN AUTOMÁTICO</p>

                <h2 className={styles.panelTitle}>Extracción actual</h2>
              </div>

              <span className={styles.itemCount}>3%</span>
            </div>

            <div
              style={{
                padding: "18px",
                border: "1px solid #dbe3ef",
                borderRadius: "14px",
                background: "#fbfdff",
              }}
            >
              <p
                style={{
                  margin: 0,
                  color: "#64748b",
                  fontSize: "12px",
                  fontWeight: 800,
                }}
              >
                EL CLIENTE RECIBE
              </p>

              <strong
                style={{
                  display: "block",
                  marginTop: "7px",
                  fontSize: "31px",
                }}
              >
                {formatMoney(withdrawalAmountValue)}
              </strong>

              <div
                style={{
                  marginTop: "18px",
                  display: "grid",
                  gap: "10px",
                }}
              >
                <div className={styles.summaryRow}>
                  <span>Comisión del {withdrawalCommissionRate}%</span>

                  <strong>{formatMoney(withdrawalCommission)}</strong>
                </div>

                <div className={`${styles.summaryRow} ${styles.totalRow}`}>
                  <span>Debe transferir</span>

                  <strong>{formatMoney(withdrawalTransferTotal)}</strong>
                </div>
              </div>
            </div>

            <div className={styles.summary}>
              <div className={styles.summaryRow}>
                <span>Origen seleccionado</span>

                <strong>
                  {withdrawalCashSource === "PHYSICAL_REGISTER"
                    ? (withdrawalInformation?.physicalSource?.registerName ??
                      "Caja física")
                    : (withdrawalInformation?.virtualSource?.accountName ??
                      "Fondo virtual")}
                </strong>
              </div>

              <div className={styles.summaryRow}>
                <span>Disponible</span>

                <strong>{formatMoney(selectedWithdrawalAvailable)}</strong>
              </div>

              <div className={styles.summaryRow}>
                <span>Saldo luego de entregar</span>

                <strong>
                  {formatMoney(
                    Math.max(
                      0,
                      selectedWithdrawalAvailable - withdrawalAmountValue,
                    ),
                  )}
                </strong>
              </div>
            </div>

            <div className={styles.status}>{withdrawalMessage}</div>

            <div
              style={{
                marginTop: "15px",
                padding: "14px",
                border: "1px solid #bbf7d0",
                borderRadius: "12px",
                background: "#ecfdf3",
                color: "#166534",
                fontSize: "13px",
                lineHeight: 1.5,
              }}
            >
              <strong>Resultado de la operación</strong>

              <p
                style={{
                  margin: "6px 0 0",
                }}
              >
                Se entrega {formatMoney(withdrawalAmountValue)}, ingresa una
                transferencia de {formatMoney(withdrawalTransferTotal)} y la
                ganancia es {formatMoney(withdrawalCommission)}.
              </p>
            </div>
          </aside>
        ) : activeOperation === "VIRTUAL" || activeOperation === "QUINIELA" ? (
          <aside className={`${styles.panel} ${styles.cartPanel}`}>
            <div className={styles.cartHeader}>
              <div>
                <p className={styles.eyebrow}>RESUMEN DE OPERACIÓN</p>

                <h2 className={styles.panelTitle}>
                  {activeOperation === "VIRTUAL"
                    ? "Servicios y Boletas"
                    : "Quiniela"}
                </h2>
              </div>

              <span className={styles.itemCount}>
                {recentCashBoxOperations.length}
              </span>
            </div>

            <div
              style={{
                padding: "18px",
                border: "1px solid #dbe3ef",
                borderRadius: "14px",
                background: "#fbfdff",
              }}
            >
              <p
                style={{
                  margin: 0,
                  color: "#64748b",
                  fontSize: "12px",
                  fontWeight: 800,
                }}
              >
                IMPORTE ACTUAL
              </p>

              <strong
                style={{
                  display: "block",
                  marginTop: "7px",
                  fontSize: "31px",
                }}
              >
                {formatMoney(cashBoxAmountValue)}
              </strong>
            </div>

            <div className={styles.summary}>
              <div className={styles.summaryRow}>
                <span>Destino del efectivo</span>

                <strong>{cashBoxDestinationLabel}</strong>
              </div>

              <div className={styles.summaryRow}>
                <span>Medio de pago</span>

                <strong>Efectivo</strong>
              </div>

              <div className={styles.summaryRow}>
                <span>Total registrado hoy</span>

                <strong>{formatMoney(cashBoxDayTotal)}</strong>
              </div>

              <div className={`${styles.summaryRow} ${styles.totalRow}`}>
                <span>Total luego de registrar</span>

                <strong>{formatMoney(cashBoxDayTotal + cashBoxAmountValue)}</strong>
              </div>
            </div>

            <div className={styles.status}>{cashBoxMessage}</div>

            <div
              style={{
                marginTop: "15px",
                padding: "14px",
                border: "1px solid #bbf7d0",
                borderRadius: "12px",
                background: "#ecfdf3",
                color: "#166534",
                fontSize: "13px",
                lineHeight: 1.5,
              }}
            >
              <strong>Movimiento de caja</strong>

              <p
                style={{
                  margin: "6px 0 0",
                }}
              >
                {activeOperation === "VIRTUAL"
                  ? `El efectivo se sumará a ${cashBoxDestinationLabel}.`
                  : `El efectivo se sumará a ${cashBoxDestinationLabel}, la caja física asignada.`}
              </p>
            </div>
          </aside>
        ) : null}
      </section>

      {isNewProductModalOpen && (
        <div
          className={styles.modalOverlay}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !isSavingNewProduct) {
              closeNewProductModal();
            }
          }}
        >
          <section className={styles.modalCard} role="dialog" aria-modal="true">
            <header className={styles.modalHeader}>
              <div>
                <p className={styles.modalEyebrow}>PRODUCTO NO ENCONTRADO</p>

                <h2 className={styles.modalTitle}>Agregar producto</h2>
              </div>

              <button
                type="button"
                className={styles.closeModalButton}
                onClick={closeNewProductModal}
                disabled={isSavingNewProduct}
              >
                ×
              </button>
            </header>

            <div className={styles.scannedCode}>
              <span>Código escaneado</span>

              <strong>{newProductBarcode}</strong>
            </div>

            <form
              className={styles.modalForm}
              onSubmit={createProductAndAddToSale}
            >
              <label className={styles.modalField}>
                <span>Nombre o descripción</span>

                <input
                  value={newProductName}
                  onChange={(event) => setNewProductName(event.target.value)}
                  placeholder="Ejemplo: Galletitas"
                  autoFocus
                />
              </label>

              <label className={styles.modalField}>
                <span>Categoría</span>

                <input
                  value={newProductCategory}
                  onChange={(event) =>
                    setNewProductCategory(event.target.value)
                  }
                />
              </label>

              <div className={styles.modalTwoColumns}>
                <label className={styles.modalField}>
                  <span>Precio de costo</span>

                  <input
                    value={newProductCostPrice}
                    onChange={(event) =>
                      setNewProductCostPrice(event.target.value)
                    }
                    inputMode="decimal"
                  />
                </label>

                <label className={styles.modalField}>
                  <span>Precio de venta</span>

                  <input
                    value={newProductSalePrice}
                    onChange={(event) =>
                      setNewProductSalePrice(event.target.value)
                    }
                    inputMode="decimal"
                  />
                </label>
              </div>

              <label className={styles.modalField}>
                <span>Stock inicial</span>

                <input
                  value={newProductStock}
                  onChange={(event) => setNewProductStock(event.target.value)}
                  inputMode="decimal"
                />
              </label>

              <p className={styles.modalNote}>
                Para agregarlo solo a esta venta completá el nombre y el precio
                de venta.
              </p>

              <div className={styles.modalActions}>
                <button
                  type="submit"
                  className={styles.modalPrimaryButton}
                  disabled={isSavingNewProduct}
                >
                  {isSavingNewProduct
                    ? "Guardando..."
                    : "Guardar y agregar a la venta"}
                </button>

                <button
                  type="button"
                  className={styles.modalSecondaryButton}
                  disabled={isSavingNewProduct}
                  onClick={addUnknownProductOnlyToSale}
                >
                  Agregar solo a esta venta
                </button>

                <button
                  type="button"
                  className={styles.modalCancelButton}
                  disabled={isSavingNewProduct}
                  onClick={closeNewProductModal}
                >
                  Cancelar
                </button>
              </div>
            </form>
          </section>
        </div>
      )}

      {isCheckoutModalOpen && (
        <div
          className={styles.modalOverlay}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !isSavingSale) {
              closeCheckoutModal();
            }
          }}
        >
          <section
            className={`${styles.modalCard} ${styles.checkoutModalCard}`}
            role="dialog"
            aria-modal="true"
          >
            <header className={styles.modalHeader}>
              <div>
                <p className={styles.checkoutEyebrow}>FINALIZAR OPERACIÓN</p>

                <h2 className={styles.modalTitle}>Cobrar cuenta</h2>
              </div>

              <button
                type="button"
                className={styles.closeModalButton}
                onClick={closeCheckoutModal}
                disabled={isSavingSale}
              >
                ×
              </button>
            </header>

            <form className={styles.modalForm} onSubmit={confirmSale}>
              <div className={styles.checkoutTotal}>
                <span>Total a cobrar</span>

                <strong>{formatMoney(grandTotal)}</strong>
              </div>

              {(categoryTotals.VIRTUAL > 0 || categoryTotals.QUINIELA > 0) && (
                <div className={styles.checkoutMessage}>
                  De este total, {formatMoney(
                    categoryTotals.VIRTUAL + categoryTotals.QUINIELA,
                  )} debe cobrarse en efectivo porque corresponde a cargas,
                  Servicios o Quiniela.
                </div>
              )}

              <div className={styles.paymentOptions}>
                {(
                  Object.entries(paymentLabels) as [PaymentMethod, string][]
                ).map(([method, label]) => (
                  <button
                    key={method}
                    type="button"
                    className={`${styles.paymentOption} ${
                      paymentMethod === method ? styles.paymentOptionActive : ""
                    }`}
                    onClick={() => selectPaymentMethod(method)}
                    disabled={
                      (categoryTotals.VIRTUAL > 0 ||
                        categoryTotals.QUINIELA > 0) &&
                      (method === "TRANSFERENCIA" || method === "TARJETA")
                    }
                  >
                    {label}
                  </button>
                ))}
              </div>

              {paymentMethod === "EFECTIVO" && (
                <div className={styles.paymentSection}>
                  <label className={styles.modalField}>
                    <span>Efectivo recibido</span>

                    <input
                      value={cashReceived}
                      onChange={(event) => setCashReceived(event.target.value)}
                      inputMode="decimal"
                      autoFocus
                    />
                  </label>

                  <div className={styles.changeBox}>
                    <span>Vuelto</span>

                    <strong>{formatMoney(cashChange)}</strong>
                  </div>
                </div>
              )}

              {(paymentMethod === "TRANSFERENCIA" ||
                paymentMethod === "TARJETA") && (
                <div className={styles.paymentSection}>
                  <label className={styles.modalField}>
                    <span>Referencia o detalle</span>

                    <input
                      value={paymentReference}
                      onChange={(event) =>
                        setPaymentReference(event.target.value)
                      }
                      placeholder="Opcional"
                      autoFocus
                    />
                  </label>
                </div>
              )}

              {paymentMethod === "MIXTO" && (
                <div className={styles.paymentSection}>
                  <div className={styles.mixedPaymentGrid}>
                    <label className={styles.modalField}>
                      <span>Efectivo</span>

                      <input
                        value={mixedCash}
                        onChange={(event) => setMixedCash(event.target.value)}
                        inputMode="decimal"
                        placeholder="0"
                        autoFocus
                      />
                    </label>

                    <label className={styles.modalField}>
                      <span>Transferencia</span>

                      <input
                        value={mixedTransfer}
                        onChange={(event) =>
                          setMixedTransfer(event.target.value)
                        }
                        inputMode="decimal"
                        placeholder="0"
                      />
                    </label>

                    <label className={styles.modalField}>
                      <span>Tarjeta</span>

                      <input
                        value={mixedCard}
                        onChange={(event) => setMixedCard(event.target.value)}
                        inputMode="decimal"
                        placeholder="0"
                      />
                    </label>
                  </div>

                  <label className={styles.modalField}>
                    <span>Referencia opcional</span>

                    <input
                      value={mixedReference}
                      onChange={(event) =>
                        setMixedReference(event.target.value)
                      }
                    />
                  </label>

                  <div
                    className={`${styles.mixedSummary} ${
                      Math.abs(mixedDifference) < 0.009
                        ? styles.mixedSummaryCorrect
                        : styles.mixedSummaryPending
                    }`}
                  >
                    <div>
                      <span>Total ingresado</span>

                      <strong>{formatMoney(mixedTotal)}</strong>
                    </div>

                    <div>
                      <span>
                        {mixedDifference > 0
                          ? "Falta"
                          : mixedDifference < 0
                            ? "Sobra"
                            : "Diferencia"}
                      </span>

                      <strong>{formatMoney(Math.abs(mixedDifference))}</strong>
                    </div>
                  </div>
                </div>
              )}

              <div className={styles.checkoutMessage}>
                {checkoutMessage ||
                  `Pago seleccionado: ${paymentLabels[paymentMethod]}.`}
              </div>

              <div className={styles.checkoutActions}>
                <button
                  type="button"
                  className={styles.modalCancelButton}
                  onClick={closeCheckoutModal}
                  disabled={isSavingSale}
                >
                  Cancelar
                </button>

                <button
                  type="submit"
                  className={styles.confirmSaleButton}
                  disabled={isSavingSale}
                >
                  {isSavingSale
                    ? "Guardando cuenta.."
                    : `Confirmar cobro ${formatMoney(grandTotal)}`}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </main>
  );
}
