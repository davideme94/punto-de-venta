import { type NextRequest } from "next/server";

import { getCloudflareContext } from "@opennextjs/cloudflare";

import { getAuthenticatedCashier } from "@/lib/cashier-session";

export const dynamic = "force-dynamic";

type PaymentMethod =
  | "EFECTIVO"
  | "TRANSFERENCIA"
  | "TARJETA"
  | "MIXTO";

type PaymentPartMethod =
  | "EFECTIVO"
  | "TRANSFERENCIA"
  | "TARJETA";

type CartOperationType =
  | "NEGOCIO"
  | "VIRTUAL"
  | "QUINIELA";

type CashBoxOperationType =
  | "SERVICIO"
  | "QUINIELA";

type SaleItemInput = {
  productId?: string | null;
  barcode?: string | null;
  name?: string;
  quantity?: number;
  unitPrice?: number;
  operationType?: string;
  reference?: string | null;
  notes?: string | null;
};

type PaymentInput = {
  method?: PaymentPartMethod;
  amount?: number;
  reference?: string;
};

type CreateSaleBody = {
  items?: SaleItemInput[];
  paymentMethod?: PaymentMethod;
  payments?: PaymentInput[];
  notes?: string;
};

type ProductRow = {
  id: string;
  barcode: string;
  name: string;
  cost_price_cents: number;
  price_cents: number;
  stock: number;
  active: number;
};

type RecentSaleRow = {
  id: string;
  sale_number: number;
  operation_type: string;
  payment_method: string;
  total_cents: number;
  status: string;
  created_by: string;
  notes: string | null;
  created_at: string;
  cashier_user_id: string | null;
  physical_register_session_id: string | null;
  cashier_name: string | null;
  register_name: string | null;
  item_count: number;
};

type CreatedSaleRow = {
  id: string;
  sale_number: number;
  operation_type: string;
  payment_method: string;
  total_cents: number;
  status: string;
  created_by: string;
  notes: string | null;
  created_at: string;
  cashier_user_id: string | null;
  physical_register_session_id: string | null;
  cashier_name: string | null;
  register_name: string | null;
};

type VirtualSessionRow = {
  id: string;
  virtual_account_id: string;
  account_code: string;
  account_name: string;
  business_date: string;
  opening_balance_cents: number;
  opened_at: string;
};

type CreatedCashBoxOperationRow = {
  id: string;
  operation_number: number;
  operation_type: CashBoxOperationType;
  operator_user_id: string;
  operator_name: string;
  operator_physical_session_id: string;
  register_name: string;
  virtual_account_session_id: string | null;
  virtual_account_name: string | null;
  payment_method: string;
  amount_cents: number;
  description: string | null;
  reference: string | null;
  notes: string | null;
  status: string;
  created_at: string;
};

type PreparedSaleItem = {
  id: string;
  productId: string | null;
  barcode: string | null;
  productName: string;
  quantity: number;
  unitCostCents: number;
  unitPriceCents: number;
  lineTotalCents: number;
  isManual: boolean;
};

type PreparedCashBoxOperation = {
  id: string;
  operationType: CashBoxOperationType;
  amountCents: number;
  description: string;
  reference: string | null;
  notes: string | null;
};

type PreparedPayment = {
  id: string;
  method: PaymentPartMethod;
  amountCents: number;
  reference: string | null;
};

function normalizeText(value: string | null | undefined): string {
  return value?.trim() ?? "";
}

function isPaymentMethod(value: unknown): value is PaymentMethod {
  return (
    value === "EFECTIVO" ||
    value === "TRANSFERENCIA" ||
    value === "TARJETA" ||
    value === "MIXTO"
  );
}

function isPaymentPartMethod(value: unknown): value is PaymentPartMethod {
  return (
    value === "EFECTIVO" ||
    value === "TRANSFERENCIA" ||
    value === "TARJETA"
  );
}

function normalizeCartOperationType(value: unknown): CartOperationType | null {
  if (value === undefined || value === null || value === "") {
    return "NEGOCIO";
  }

  if (
    value === "NEGOCIO" ||
    value === "VIRTUAL" ||
    value === "QUINIELA"
  ) {
    return value;
  }

  return null;
}

function moneyToCents(value: number): number {
  return Math.round(value * 100);
}

function centsToMoney(value: number): number {
  return Number(value || 0) / 100;
}

function deriveSalePaymentMethod(
  payments: PreparedPayment[],
): PaymentMethod {
  const methods = [...new Set(payments.map((payment) => payment.method))];

  if (methods.length === 1) {
    return methods[0];
  }

  return "MIXTO";
}

async function loadOpenVirtualSession(
  db: D1Database,
): Promise<VirtualSessionRow | null> {
  return db
    .prepare(`
      SELECT
        sessions.id,
        sessions.virtual_account_id,
        accounts.code AS account_code,
        accounts.name AS account_name,
        sessions.business_date,
        sessions.opening_balance_cents,
        sessions.opened_at
      FROM virtual_account_sessions AS sessions
      INNER JOIN virtual_accounts AS accounts
        ON accounts.id = sessions.virtual_account_id
      WHERE
        sessions.status = 'ABIERTA'
        AND accounts.active = 1
      ORDER BY sessions.opened_at DESC
      LIMIT 1
    `)
    .first<VirtualSessionRow>();
}

function mapCashBoxOperation(operation: CreatedCashBoxOperationRow) {
  const destinationLabel =
    operation.operation_type === "SERVICIO"
      ? operation.virtual_account_name ?? "Caja Virtual"
      : operation.register_name;

  return {
    id: operation.id,
    operationNumber: operation.operation_number,
    operationType: operation.operation_type,
    operationTypeLabel:
      operation.operation_type === "SERVICIO"
        ? "Servicio o Boleta"
        : "Quiniela",
    operatorUserId: operation.operator_user_id,
    operatorName: operation.operator_name,
    physicalSessionId: operation.operator_physical_session_id,
    registerName: operation.register_name,
    virtualSessionId: operation.virtual_account_session_id,
    virtualAccountName: operation.virtual_account_name,
    destinationLabel,
    paymentMethod: operation.payment_method,
    amount: centsToMoney(operation.amount_cents),
    description: operation.description,
    reference: operation.reference,
    notes: operation.notes,
    status: operation.status,
    createdAt: operation.created_at,
  };
}

/*
 * GET /api/sales
 *
 * Conserva el listado reciente de ventas existente.
 */
export async function GET() {
  try {
    const { env } = getCloudflareContext();

    const result = await env.DB.prepare(`
      SELECT
        sales.id,
        sales.sale_number,
        sales.operation_type,
        sales.payment_method,
        sales.total_cents,
        sales.status,
        sales.created_by,
        sales.notes,
        sales.created_at,
        sales.cashier_user_id,
        sales.physical_register_session_id,
        users.display_name AS cashier_name,
        registers.name AS register_name,
        COALESCE(item_totals.item_count, 0) AS item_count
      FROM sales
      LEFT JOIN app_users AS users
        ON users.id = sales.cashier_user_id
      LEFT JOIN physical_register_sessions AS register_sessions
        ON register_sessions.id = sales.physical_register_session_id
      LEFT JOIN physical_registers AS registers
        ON registers.id = register_sessions.register_id
      LEFT JOIN (
        SELECT
          sale_id,
          COUNT(id) AS item_count
        FROM sale_items
        GROUP BY sale_id
      ) AS item_totals
        ON item_totals.sale_id = sales.id
      ORDER BY sales.sale_number DESC
      LIMIT 50
    `).all<RecentSaleRow>();

    return Response.json({
      sales: result.results.map((sale) => ({
        id: sale.id,
        saleNumber: sale.sale_number,
        operationType: sale.operation_type,
        paymentMethod: sale.payment_method,
        total: centsToMoney(sale.total_cents),
        status: sale.status,
        createdBy: sale.cashier_name ?? sale.created_by,
        notes: sale.notes,
        createdAt: sale.created_at,
        itemCount: Number(sale.item_count || 0),
        cashierUserId: sale.cashier_user_id,
        physicalRegisterSessionId: sale.physical_register_session_id,
        cashierName: sale.cashier_name,
        registerName: sale.register_name,
      })),
    });
  } catch (error) {
    console.error("Error al leer ventas:", error);

    return Response.json(
      {
        error: "No se pudieron cargar las ventas.",
      },
      {
        status: 500,
      },
    );
  }
}

/*
 * POST /api/sales
 *
 * Guarda una cuenta completa de forma atómica.
 *
 * Puede contener:
 * - productos de Negocio;
 * - Servicios o recargas;
 * - Quiniela.
 *
 * El cliente ve un único total, pero cada parte se registra
 * en la tabla y en la caja que le corresponde.
 */
export async function POST(request: NextRequest) {
  try {
    const cashier = await getAuthenticatedCashier(request);

    if (!cashier) {
      return Response.json(
        {
          error: "Primero debés iniciar sesión como cajera.",
        },
        {
          status: 401,
        },
      );
    }

    if (!cashier.physicalSessionId || !cashier.registerId) {
      return Response.json(
        {
          error: "No tenés una caja física abierta y asignada.",
        },
        {
          status: 409,
        },
      );
    }

    if (cashier.confirmationStatus === "PENDIENTE") {
      return Response.json(
        {
          error: "Primero debés contar y confirmar el efectivo recibido.",
        },
        {
          status: 409,
        },
      );
    }

    if (cashier.confirmationStatus === "OBSERVADA") {
      return Response.json(
        {
          error:
            "La caja tiene una diferencia inicial pendiente de revisión administrativa.",
        },
        {
          status: 409,
        },
      );
    }

    if (cashier.confirmationStatus !== "CONFIRMADA") {
      return Response.json(
        {
          error: "La recepción de la caja todavía no fue confirmada.",
        },
        {
          status: 409,
        },
      );
    }

    let body: CreateSaleBody;

    try {
      body = (await request.json()) as CreateSaleBody;
    } catch {
      return Response.json(
        {
          error: "No se pudo leer la cuenta.",
        },
        {
          status: 400,
        },
      );
    }

    const items = body.items;
    const requestedPaymentMethod = body.paymentMethod;
    const saleNotes = normalizeText(body.notes) || null;

    if (!Array.isArray(items) || items.length === 0) {
      return Response.json(
        {
          error: "La cuenta no tiene productos ni operaciones.",
        },
        {
          status: 400,
        },
      );
    }

    if (!isPaymentMethod(requestedPaymentMethod)) {
      return Response.json(
        {
          error: "Seleccioná un medio de pago válido.",
        },
        {
          status: 400,
        },
      );
    }

    const normalizedItems = items.map((item) => ({
      ...item,
      normalizedOperationType: normalizeCartOperationType(item.operationType),
    }));

    if (normalizedItems.some((item) => !item.normalizedOperationType)) {
      return Response.json(
        {
          error:
            "La cuenta contiene un tipo de operación que no puede cobrarse junto.",
        },
        {
          status: 400,
        },
      );
    }

    const businessItems = normalizedItems.filter(
      (item) => item.normalizedOperationType === "NEGOCIO",
    );

    const cashBoxItems = normalizedItems.filter(
      (item) =>
        item.normalizedOperationType === "VIRTUAL" ||
        item.normalizedOperationType === "QUINIELA",
    );

    for (const item of normalizedItems) {
      const name = normalizeText(item.name);
      const quantity = Number(item.quantity);
      const unitPrice = Number(item.unitPrice);

      if (!name) {
        return Response.json(
          {
            error: "Uno de los ítems no tiene nombre o descripción.",
          },
          {
            status: 400,
          },
        );
      }

      if (!Number.isFinite(quantity) || quantity <= 0) {
        return Response.json(
          {
            error: `La cantidad de ${name} no es válida.`,
          },
          {
            status: 400,
          },
        );
      }

      if (!Number.isFinite(unitPrice) || unitPrice <= 0) {
        return Response.json(
          {
            error: `El importe de ${name} no es válido.`,
          },
          {
            status: 400,
          },
        );
      }
    }

    const { env } = getCloudflareContext();

    const productIds = [
      ...new Set(
        businessItems
          .map((item) => normalizeText(item.productId))
          .filter((productId) => productId.length > 0),
      ),
    ];

    const productsById = new Map<string, ProductRow>();

    if (productIds.length > 0) {
      const placeholders = productIds.map(() => "?").join(", ");

      const productsResult = await env.DB.prepare(`
        SELECT
          id,
          barcode,
          name,
          cost_price_cents,
          price_cents,
          stock,
          active
        FROM products
        WHERE id IN (${placeholders})
      `)
        .bind(...productIds)
        .all<ProductRow>();

      productsResult.results.forEach((product) => {
        productsById.set(product.id, product);
      });

      if (productsById.size !== productIds.length) {
        return Response.json(
          {
            error: "Uno de los productos ya no existe.",
          },
          {
            status: 409,
          },
        );
      }
    }

    const requestedStock = new Map<string, number>();

    for (const item of businessItems) {
      const productId = normalizeText(item.productId);

      if (!productId) {
        continue;
      }

      const product = productsById.get(productId);

      if (!product) {
        return Response.json(
          {
            error: "Uno de los productos no fue encontrado.",
          },
          {
            status: 409,
          },
        );
      }

      if (product.active !== 1) {
        return Response.json(
          {
            error: `${product.name} está desactivado.`,
          },
          {
            status: 409,
          },
        );
      }

      const accumulated = requestedStock.get(productId) ?? 0;

      requestedStock.set(productId, accumulated + Number(item.quantity));
    }

    for (const [productId, requestedQuantity] of requestedStock) {
      const product = productsById.get(productId);

      if (product && product.stock < requestedQuantity) {
        return Response.json(
          {
            error: `Stock insuficiente para ${product.name}. Disponible: ${product.stock}.`,
          },
          {
            status: 409,
          },
        );
      }
    }

    const preparedSaleItems: PreparedSaleItem[] = businessItems.map((item) => {
      const productId = normalizeText(item.productId);
      const product = productId ? productsById.get(productId) : undefined;
      const quantity = Number(item.quantity);
      const unitPriceCents = moneyToCents(Number(item.unitPrice));
      const manualBarcode = normalizeText(item.barcode);

      return {
        id: crypto.randomUUID(),
        productId: product?.id ?? null,
        barcode: product?.barcode ?? (manualBarcode || null),
        productName: product?.name ?? normalizeText(item.name),
        quantity,
        unitCostCents: product?.cost_price_cents ?? 0,
        unitPriceCents,
        lineTotalCents: Math.round(unitPriceCents * quantity),
        isManual: !product,
      };
    });

    const preparedCashBoxOperations: PreparedCashBoxOperation[] =
      cashBoxItems.map((item) => {
        const operationType: CashBoxOperationType =
          item.normalizedOperationType === "VIRTUAL"
            ? "SERVICIO"
            : "QUINIELA";

        const unitPriceCents = moneyToCents(Number(item.unitPrice));
        const quantity = Number(item.quantity);

        return {
          id: crypto.randomUUID(),
          operationType,
          amountCents: Math.round(unitPriceCents * quantity),
          description:
            normalizeText(item.name) ||
            (operationType === "SERVICIO"
              ? "Servicios y boletas"
              : "Quiniela"),
          reference: normalizeText(item.reference) || null,
          notes: normalizeText(item.notes) || null,
        };
      });

    const businessTotalCents = preparedSaleItems.reduce(
      (total, item) => total + item.lineTotalCents,
      0,
    );

    const cashBoxTotalCents = preparedCashBoxOperations.reduce(
      (total, operation) => total + operation.amountCents,
      0,
    );

    const grandTotalCents = businessTotalCents + cashBoxTotalCents;

    if (grandTotalCents <= 0) {
      return Response.json(
        {
          error: "El total de la cuenta debe ser mayor que cero.",
        },
        {
          status: 400,
        },
      );
    }

    let overallPayments: PreparedPayment[] = [];

    if (requestedPaymentMethod === "MIXTO") {
      if (!Array.isArray(body.payments) || body.payments.length < 2) {
        return Response.json(
          {
            error: "En un pago mixto ingresá al menos dos medios de pago.",
          },
          {
            status: 400,
          },
        );
      }

      for (const payment of body.payments) {
        if (!isPaymentPartMethod(payment.method)) {
          return Response.json(
            {
              error: "Uno de los medios del pago mixto no es válido.",
            },
            {
              status: 400,
            },
          );
        }

        const amount = Number(payment.amount);

        if (!Number.isFinite(amount) || amount <= 0) {
          return Response.json(
            {
              error:
                "Todos los importes del pago mixto deben ser mayores que cero.",
            },
            {
              status: 400,
            },
          );
        }

        overallPayments.push({
          id: crypto.randomUUID(),
          method: payment.method,
          amountCents: moneyToCents(amount),
          reference: normalizeText(payment.reference) || null,
        });
      }
    } else {
      overallPayments = [
        {
          id: crypto.randomUUID(),
          method: requestedPaymentMethod,
          amountCents: grandTotalCents,
          reference: normalizeText(body.payments?.[0]?.reference) || null,
        },
      ];
    }

    const overallPaymentTotalCents = overallPayments.reduce(
      (total, payment) => total + payment.amountCents,
      0,
    );

    if (overallPaymentTotalCents !== grandTotalCents) {
      return Response.json(
        {
          error: `Los pagos suman ${centsToMoney(
            overallPaymentTotalCents,
          )}, pero la cuenta totaliza ${centsToMoney(grandTotalCents)}.`,
        },
        {
          status: 400,
        },
      );
    }

    const cashPaidCents = overallPayments
      .filter((payment) => payment.method === "EFECTIVO")
      .reduce((total, payment) => total + payment.amountCents, 0);

    if (cashPaidCents < cashBoxTotalCents) {
      return Response.json(
        {
          error: `Servicios, recargas y Quiniela requieren ${centsToMoney(
            cashBoxTotalCents,
          )} en efectivo.`,
        },
        {
          status: 400,
        },
      );
    }

    let cashToAssignToOperations = cashBoxTotalCents;
    const preparedSalePayments: PreparedPayment[] = [];

    for (const payment of overallPayments) {
      if (payment.method !== "EFECTIVO") {
        preparedSalePayments.push({
          ...payment,
          id: crypto.randomUUID(),
        });
        continue;
      }

      const cashUsedForOperations = Math.min(
        payment.amountCents,
        cashToAssignToOperations,
      );

      cashToAssignToOperations -= cashUsedForOperations;

      const remainingCashForBusiness =
        payment.amountCents - cashUsedForOperations;

      if (remainingCashForBusiness > 0) {
        preparedSalePayments.push({
          ...payment,
          id: crypto.randomUUID(),
          amountCents: remainingCashForBusiness,
        });
      }
    }

    const salePaymentTotalCents = preparedSalePayments.reduce(
      (total, payment) => total + payment.amountCents,
      0,
    );

    if (salePaymentTotalCents !== businessTotalCents) {
      return Response.json(
        {
          error:
            "No se pudo distribuir correctamente el cobro entre Negocio y las operaciones en efectivo.",
        },
        {
          status: 400,
        },
      );
    }

    let virtualSession: VirtualSessionRow | null = null;

    if (
      preparedCashBoxOperations.some(
        (operation) => operation.operationType === "SERVICIO",
      )
    ) {
      virtualSession = await loadOpenVirtualSession(env.DB);

      if (!virtualSession) {
        return Response.json(
          {
            error:
              "No existe una Caja Virtual abierta para registrar Servicios y recargas.",
          },
          {
            status: 409,
          },
        );
      }

      if (cashier.businessDate !== virtualSession.business_date) {
        return Response.json(
          {
            error:
              "La caja de la cajera y la Caja Virtual tienen fechas comerciales diferentes.",
          },
          {
            status: 409,
          },
        );
      }
    }

    const saleId = businessTotalCents > 0 ? crypto.randomUUID() : null;
    const statements: D1PreparedStatement[] = [];

    if (saleId) {
      const salePaymentMethod = deriveSalePaymentMethod(preparedSalePayments);

      statements.push(
        env.DB.prepare(`
          UPDATE sale_counter
          SET last_number = last_number + 1
          WHERE id = 1
        `),
      );

      statements.push(
        env.DB.prepare(`
          INSERT INTO sales (
            id,
            sale_number,
            operation_type,
            payment_method,
            subtotal_cents,
            total_cents,
            status,
            created_by,
            notes,
            cashier_user_id,
            physical_register_session_id
          )
          SELECT
            ?,
            last_number,
            'NEGOCIO',
            ?,
            ?,
            ?,
            'COMPLETADA',
            ?,
            ?,
            ?,
            ?
          FROM sale_counter
          WHERE id = 1
        `).bind(
          saleId,
          salePaymentMethod,
          businessTotalCents,
          businessTotalCents,
          cashier.displayName,
          saleNotes,
          cashier.userId,
          cashier.physicalSessionId,
        ),
      );

      for (const item of preparedSaleItems) {
        statements.push(
          env.DB.prepare(`
            INSERT INTO sale_items (
              id,
              sale_id,
              product_id,
              barcode,
              product_name,
              quantity,
              unit_cost_cents,
              unit_price_cents,
              line_total_cents,
              is_manual
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).bind(
            item.id,
            saleId,
            item.productId,
            item.barcode,
            item.productName,
            item.quantity,
            item.unitCostCents,
            item.unitPriceCents,
            item.lineTotalCents,
            item.isManual ? 1 : 0,
          ),
        );

        if (item.productId) {
          statements.push(
            env.DB.prepare(`
              UPDATE products
              SET
                stock = stock - ?,
                updated_at = CURRENT_TIMESTAMP
              WHERE id = ?
            `).bind(item.quantity, item.productId),
          );
        }
      }

      for (const payment of preparedSalePayments) {
        statements.push(
          env.DB.prepare(`
            INSERT INTO sale_payments (
              id,
              sale_id,
              method,
              amount_cents,
              reference
            )
            VALUES (?, ?, ?, ?, ?)
          `).bind(
            payment.id,
            saleId,
            payment.method,
            payment.amountCents,
            payment.reference,
          ),
        );
      }
    }

    for (const operation of preparedCashBoxOperations) {
      const virtualSessionId =
        operation.operationType === "SERVICIO" ? virtualSession?.id ?? null : null;

      statements.push(
        env.DB.prepare(`
          UPDATE cash_box_operation_counter
          SET last_number = last_number + 1
          WHERE id = 1
        `),
      );

      statements.push(
        env.DB.prepare(`
          INSERT INTO cash_box_operations (
            id,
            operation_number,
            operation_type,
            operator_user_id,
            operator_physical_session_id,
            virtual_account_session_id,
            payment_method,
            amount_cents,
            description,
            reference,
            notes,
            status
          )
          SELECT
            ?,
            last_number,
            ?,
            ?,
            ?,
            ?,
            'EFECTIVO',
            ?,
            ?,
            ?,
            ?,
            'COMPLETADA'
          FROM cash_box_operation_counter
          WHERE id = 1
        `).bind(
          operation.id,
          operation.operationType,
          cashier.userId,
          cashier.physicalSessionId,
          virtualSessionId,
          operation.amountCents,
          operation.description,
          operation.reference,
          operation.notes,
        ),
      );
    }

    await env.DB.batch(statements);

    let createdSale: CreatedSaleRow | null = null;

    if (saleId) {
      createdSale = await env.DB.prepare(`
        SELECT
          sales.id,
          sales.sale_number,
          sales.operation_type,
          sales.payment_method,
          sales.total_cents,
          sales.status,
          sales.created_by,
          sales.notes,
          sales.created_at,
          sales.cashier_user_id,
          sales.physical_register_session_id,
          users.display_name AS cashier_name,
          registers.name AS register_name
        FROM sales
        LEFT JOIN app_users AS users
          ON users.id = sales.cashier_user_id
        LEFT JOIN physical_register_sessions AS sessions
          ON sessions.id = sales.physical_register_session_id
        LEFT JOIN physical_registers AS registers
          ON registers.id = sessions.register_id
        WHERE sales.id = ?
        LIMIT 1
      `)
        .bind(saleId)
        .first<CreatedSaleRow>();

      if (!createdSale) {
        return Response.json(
          {
            error: "La cuenta se guardó, pero la venta no pudo recuperarse.",
          },
          {
            status: 500,
          },
        );
      }
    }

    let createdOperations: CreatedCashBoxOperationRow[] = [];

    if (preparedCashBoxOperations.length > 0) {
      const operationIds = preparedCashBoxOperations.map(
        (operation) => operation.id,
      );
      const placeholders = operationIds.map(() => "?").join(", ");

      const operationsResult = await env.DB.prepare(`
        SELECT
          operations.id,
          operations.operation_number,
          operations.operation_type,
          operations.operator_user_id,
          operator.display_name AS operator_name,
          operations.operator_physical_session_id,
          physical_register.name AS register_name,
          operations.virtual_account_session_id,
          virtual_account.name AS virtual_account_name,
          operations.payment_method,
          operations.amount_cents,
          operations.description,
          operations.reference,
          operations.notes,
          operations.status,
          operations.created_at
        FROM cash_box_operations AS operations
        INNER JOIN app_users AS operator
          ON operator.id = operations.operator_user_id
        INNER JOIN physical_register_sessions AS physical_session
          ON physical_session.id = operations.operator_physical_session_id
        INNER JOIN physical_registers AS physical_register
          ON physical_register.id = physical_session.register_id
        LEFT JOIN virtual_account_sessions AS virtual_session
          ON virtual_session.id = operations.virtual_account_session_id
        LEFT JOIN virtual_accounts AS virtual_account
          ON virtual_account.id = virtual_session.virtual_account_id
        WHERE operations.id IN (${placeholders})
        ORDER BY operations.operation_number ASC
      `)
        .bind(...operationIds)
        .all<CreatedCashBoxOperationRow>();

      createdOperations = operationsResult.results;
    }

    const mappedSale = createdSale
      ? {
          id: createdSale.id,
          saleNumber: createdSale.sale_number,
          operationType: createdSale.operation_type,
          paymentMethod: createdSale.payment_method,
          total: centsToMoney(createdSale.total_cents),
          status: createdSale.status,
          createdBy: createdSale.cashier_name ?? createdSale.created_by,
          notes: createdSale.notes,
          createdAt: createdSale.created_at,
          cashierUserId: createdSale.cashier_user_id,
          physicalRegisterSessionId:
            createdSale.physical_register_session_id,
          cashierName: createdSale.cashier_name,
          registerName: createdSale.register_name,
        }
      : null;

    const mappedOperations = createdOperations.map(mapCashBoxOperation);

    return Response.json(
      {
        message: "La cuenta fue guardada correctamente.",
        sale: mappedSale,
        operations: mappedOperations,
        summary: {
          businessTotal: centsToMoney(businessTotalCents),
          cashBoxOperationsTotal: centsToMoney(cashBoxTotalCents),
          grandTotal: centsToMoney(grandTotalCents),
        },
        cashier: {
          id: cashier.userId,
          displayName: cashier.displayName,
          registerName: cashier.registerName,
          physicalSessionId: cashier.physicalSessionId,
        },
      },
      {
        status: 201,
      },
    );
  } catch (error) {
    console.error("Error al guardar la cuenta:", error);

    const errorMessage = error instanceof Error ? error.message : "";

    if (errorMessage.includes("INSUFFICIENT_STOCK")) {
      return Response.json(
        {
          error:
            "El stock cambió mientras se procesaba la cuenta. Revisá las cantidades.",
        },
        {
          status: 409,
        },
      );
    }

    if (errorMessage.includes("INVALID_OR_CLOSED_REGISTER_SESSION")) {
      return Response.json(
        {
          error:
            "La caja fue cerrada o ya no pertenece a la cajera conectada.",
        },
        {
          status: 409,
        },
      );
    }

    if (errorMessage.includes("SALE_CASHIER_AND_SESSION_REQUIRED_TOGETHER")) {
      return Response.json(
        {
          error: "La venta debe tener una cajera y una sesión de caja.",
        },
        {
          status: 400,
        },
      );
    }

    if (errorMessage.includes("INVALID_CASHIER")) {
      return Response.json(
        {
          error: "La cajera ya no está habilitada.",
        },
        {
          status: 401,
        },
      );
    }

    if (errorMessage.includes("INVALID_OPERATOR_REGISTER")) {
      return Response.json(
        {
          error:
            "La caja física ya no está abierta, confirmada o asignada a esta cajera.",
        },
        {
          status: 409,
        },
      );
    }

    if (errorMessage.includes("INVALID_VIRTUAL_SESSION")) {
      return Response.json(
        {
          error: "La Caja Virtual ya no está abierta.",
        },
        {
          status: 409,
        },
      );
    }

    if (errorMessage.includes("BUSINESS_DATE_MISMATCH")) {
      return Response.json(
        {
          error:
            "La caja física y la Caja Virtual tienen fechas comerciales diferentes.",
        },
        {
          status: 409,
        },
      );
    }

    return Response.json(
      {
        error: "No se pudo guardar la cuenta.",
      },
      {
        status: 500,
      },
    );
  }
}
