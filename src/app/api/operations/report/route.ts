import { getCloudflareContext } from "@opennextjs/cloudflare";

export const dynamic = "force-dynamic";

type OperationType =
  | "VENTA"
  | "SERVICIO"
  | "QUINIELA"
  | "EXTRACCION";

type OperationSource =
  | "SALE"
  | "CASH_BOX_OPERATION"
  | "CASH_WITHDRAWAL";

type OperationStatus = "COMPLETADA" | "ANULADA";

type PaymentMethod =
  | "EFECTIVO"
  | "TRANSFERENCIA"
  | "TARJETA"
  | "MIXTO";

type CashMovement = "ENTRADA" | "SALIDA";
type CashLocation = "CAJA_FISICA" | "CAJA_VIRTUAL";

type UnifiedOperationRow = {
  id: string;
  source: OperationSource;
  operation_type: OperationType;
  operation_number: number;
  payment_method: PaymentMethod;
  status: OperationStatus;
  created_by: string;
  created_at: string;
  description: string | null;
  reference: string | null;
  notes: string | null;
  amount_cents: number;
  cost_total_cents: number;
  profit_cents: number;
  cash_amount_cents: number;
  transfer_amount_cents: number;
  card_amount_cents: number;
  commission_amount_cents: number;
  item_count: number;
  cash_movement: CashMovement | null;
  cash_location: CashLocation | null;
  cash_source: string | null;
  register_name: string | null;
  virtual_account_name: string | null;
};

type UserRow = {
  name: string;
};

type DateParts = {
  year: number;
  month: number;
  day: number;
};

function centsToMoney(value: number): number {
  return Number(value || 0) / 100;
}

function normalizeText(value: string | null): string {
  return value?.trim() ?? "";
}

function isOperationType(value: string): value is OperationType {
  return (
    value === "VENTA" ||
    value === "SERVICIO" ||
    value === "QUINIELA" ||
    value === "EXTRACCION"
  );
}

function isOperationStatus(value: string): value is OperationStatus {
  return value === "COMPLETADA" || value === "ANULADA";
}

function isPaymentMethod(value: string): value is PaymentMethod {
  return (
    value === "EFECTIVO" ||
    value === "TRANSFERENCIA" ||
    value === "TARJETA" ||
    value === "MIXTO"
  );
}

function parseDateParts(value: string): DateParts | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);

  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return { year, month, day };
}

function formatDateParts(parts: DateParts): string {
  return [
    String(parts.year).padStart(4, "0"),
    String(parts.month).padStart(2, "0"),
    String(parts.day).padStart(2, "0"),
  ].join("-");
}

function addDays(value: string, amount: number): string {
  const parts = parseDateParts(value);

  if (!parts) {
    throw new Error("Fecha inválida.");
  }

  const date = new Date(
    Date.UTC(parts.year, parts.month - 1, parts.day + amount),
  );

  return formatDateParts({
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  });
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
    throw new Error("No se pudo determinar la fecha actual.");
  }

  return `${year}-${month}-${day}`;
}

/*
 * D1 guarda CURRENT_TIMESTAMP en UTC.
 * Esta función convierte el comienzo de un día argentino
 * a la fecha UTC utilizada en las consultas.
 */
function localDateToUtcBoundary(value: string): string {
  const date = new Date(`${value}T00:00:00-03:00`);

  if (Number.isNaN(date.getTime())) {
    throw new Error("Fecha inválida.");
  }

  return date.toISOString().slice(0, 19).replace("T", " ");
}

function countCalendarDays(fromDate: string, toDate: string): number {
  const fromParts = parseDateParts(fromDate);
  const toParts = parseDateParts(toDate);

  if (!fromParts || !toParts) {
    return 1;
  }

  const fromTime = Date.UTC(
    fromParts.year,
    fromParts.month - 1,
    fromParts.day,
  );

  const toTime = Date.UTC(
    toParts.year,
    toParts.month - 1,
    toParts.day,
  );

  return Math.floor((toTime - fromTime) / 86_400_000) + 1;
}

/*
 * GET /api/operations/report
 *
 * Parámetros disponibles:
 * from=2026-07-19
 * to=2026-07-19
 * type=VENTA | SERVICIO | QUINIELA | EXTRACCION | TODOS
 * user=nombre de usuario | TODOS
 * status=COMPLETADA | ANULADA | TODOS
 * payment=EFECTIVO | TRANSFERENCIA | TARJETA | MIXTO | TODOS
 *
 * Sin fechas devuelve las operaciones del día actual.
 */
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const today = getBuenosAiresToday();

    const fromDate =
      normalizeText(url.searchParams.get("from")) || today;

    const toDate =
      normalizeText(url.searchParams.get("to")) || fromDate;

    const operationType = normalizeText(url.searchParams.get("type"));
    const user = normalizeText(url.searchParams.get("user"));
    const status = normalizeText(url.searchParams.get("status"));
    const payment = normalizeText(url.searchParams.get("payment"));

    const fromParts = parseDateParts(fromDate);
    const toParts = parseDateParts(toDate);

    if (!fromParts || !toParts) {
      return Response.json(
        { error: "Las fechas deben tener el formato AAAA-MM-DD." },
        { status: 400 },
      );
    }

    const fromTime = Date.UTC(
      fromParts.year,
      fromParts.month - 1,
      fromParts.day,
    );

    const toTime = Date.UTC(
      toParts.year,
      toParts.month - 1,
      toParts.day,
    );

    if (fromTime > toTime) {
      return Response.json(
        {
          error:
            "La fecha desde no puede ser posterior a la fecha hasta.",
        },
        { status: 400 },
      );
    }

    if (
      operationType &&
      operationType !== "TODOS" &&
      !isOperationType(operationType)
    ) {
      return Response.json(
        { error: "El tipo de operación seleccionado no es válido." },
        { status: 400 },
      );
    }

    if (
      status &&
      status !== "TODOS" &&
      !isOperationStatus(status)
    ) {
      return Response.json(
        { error: "El estado seleccionado no es válido." },
        { status: 400 },
      );
    }

    if (
      payment &&
      payment !== "TODOS" &&
      !isPaymentMethod(payment)
    ) {
      return Response.json(
        { error: "El medio de pago seleccionado no es válido." },
        { status: 400 },
      );
    }

    const toExclusiveDate = addDays(toDate, 1);
    const fromUtc = localDateToUtcBoundary(fromDate);
    const toExclusiveUtc = localDateToUtcBoundary(toExclusiveDate);

    const whereConditions = ["created_at >= ?", "created_at < ?"];
    const bindings: Array<string | number> = [fromUtc, toExclusiveUtc];

    if (operationType && operationType !== "TODOS") {
      whereConditions.push("operation_type = ?");
      bindings.push(operationType);
    }

    if (user && user !== "TODOS") {
      whereConditions.push("created_by = ? COLLATE NOCASE");
      bindings.push(user);
    }

    if (status && status !== "TODOS") {
      whereConditions.push("status = ?");
      bindings.push(status);
    }

    if (payment && payment !== "TODOS") {
      whereConditions.push("payment_method = ?");
      bindings.push(payment);
    }

    const whereClause = whereConditions.join(" AND ");
    const { env } = getCloudflareContext();

    const [operationsResult, usersResult] = await Promise.all([
      env.DB.prepare(`
        WITH
        sale_item_totals AS (
          SELECT
            sale_id,
            COUNT(id) AS item_count,
            COALESCE(
              SUM(unit_cost_cents * quantity),
              0
            ) AS cost_total_cents
          FROM sale_items
          GROUP BY sale_id
        ),

        sale_payment_totals AS (
          SELECT
            sale_id,
            COALESCE(
              SUM(
                CASE
                  WHEN method = 'EFECTIVO' THEN amount_cents
                  ELSE 0
                END
              ),
              0
            ) AS cash_amount_cents,
            COALESCE(
              SUM(
                CASE
                  WHEN method = 'TRANSFERENCIA' THEN amount_cents
                  ELSE 0
                END
              ),
              0
            ) AS transfer_amount_cents,
            COALESCE(
              SUM(
                CASE
                  WHEN method = 'TARJETA' THEN amount_cents
                  ELSE 0
                END
              ),
              0
            ) AS card_amount_cents
          FROM sale_payments
          GROUP BY sale_id
        ),

        unified_operations AS (
          SELECT
            sales.id,
            'SALE' AS source,
            'VENTA' AS operation_type,
            sales.sale_number AS operation_number,
            sales.payment_method,
            sales.status,
            sales.created_by,
            sales.created_at,
            'Venta de productos' AS description,
            NULL AS reference,
            sales.notes,
            sales.total_cents AS amount_cents,
            COALESCE(
              item_totals.cost_total_cents,
              0
            ) AS cost_total_cents,
            sales.total_cents - COALESCE(
              item_totals.cost_total_cents,
              0
            ) AS profit_cents,
            COALESCE(
              payment_totals.cash_amount_cents,
              0
            ) AS cash_amount_cents,
            COALESCE(
              payment_totals.transfer_amount_cents,
              0
            ) AS transfer_amount_cents,
            COALESCE(
              payment_totals.card_amount_cents,
              0
            ) AS card_amount_cents,
            0 AS commission_amount_cents,
            COALESCE(item_totals.item_count, 0) AS item_count,
            CASE
              WHEN COALESCE(
                payment_totals.cash_amount_cents,
                0
              ) > 0
              THEN 'ENTRADA'
              ELSE NULL
            END AS cash_movement,
            CASE
              WHEN COALESCE(
                payment_totals.cash_amount_cents,
                0
              ) > 0
              THEN 'CAJA_FISICA'
              ELSE NULL
            END AS cash_location,
            NULL AS cash_source,
            physical_register.name AS register_name,
            NULL AS virtual_account_name
          FROM sales
          LEFT JOIN sale_item_totals AS item_totals
            ON item_totals.sale_id = sales.id
          LEFT JOIN sale_payment_totals AS payment_totals
            ON payment_totals.sale_id = sales.id
          LEFT JOIN physical_register_sessions AS physical_session
            ON physical_session.id = sales.physical_register_session_id
          LEFT JOIN physical_registers AS physical_register
            ON physical_register.id = physical_session.register_id

          UNION ALL

          SELECT
            operations.id,
            'CASH_BOX_OPERATION' AS source,
            operations.operation_type,
            operations.operation_number,
            operations.payment_method,
            operations.status,
            operator.display_name AS created_by,
            operations.created_at,
            COALESCE(
              operations.description,
              CASE
                WHEN operations.operation_type = 'SERVICIO'
                THEN 'Servicios y boletas'
                ELSE 'Quiniela'
              END
            ) AS description,
            operations.reference,
            operations.notes,
            operations.amount_cents,
            0 AS cost_total_cents,
            0 AS profit_cents,
            operations.amount_cents AS cash_amount_cents,
            0 AS transfer_amount_cents,
            0 AS card_amount_cents,
            0 AS commission_amount_cents,
            0 AS item_count,
            'ENTRADA' AS cash_movement,
            CASE
              WHEN operations.operation_type = 'SERVICIO'
              THEN 'CAJA_VIRTUAL'
              ELSE 'CAJA_FISICA'
            END AS cash_location,
            NULL AS cash_source,
            physical_register.name AS register_name,
            virtual_account.name AS virtual_account_name
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

          UNION ALL

          SELECT
            withdrawals.id,
            'CASH_WITHDRAWAL' AS source,
            'EXTRACCION' AS operation_type,
            withdrawals.operation_number,
            'TRANSFERENCIA' AS payment_method,
            withdrawals.status,
            operator.display_name AS created_by,
            withdrawals.created_at,
            'Extracción de efectivo' AS description,
            withdrawals.transfer_reference AS reference,
            withdrawals.notes,
            withdrawals.withdrawal_amount_cents AS amount_cents,
            0 AS cost_total_cents,
            withdrawals.commission_amount_cents AS profit_cents,
            withdrawals.withdrawal_amount_cents AS cash_amount_cents,
            withdrawals.transfer_total_cents AS transfer_amount_cents,
            0 AS card_amount_cents,
            withdrawals.commission_amount_cents,
            0 AS item_count,
            'SALIDA' AS cash_movement,
            CASE
              WHEN withdrawals.cash_source = 'PHYSICAL_REGISTER'
              THEN 'CAJA_FISICA'
              ELSE 'CAJA_VIRTUAL'
            END AS cash_location,
            withdrawals.cash_source,
            physical_register.name AS register_name,
            virtual_account.name AS virtual_account_name
          FROM cash_withdrawals AS withdrawals
          INNER JOIN app_users AS operator
            ON operator.id = withdrawals.operator_user_id
          LEFT JOIN physical_register_sessions AS physical_session
            ON physical_session.id = withdrawals.physical_register_session_id
          LEFT JOIN physical_registers AS physical_register
            ON physical_register.id = physical_session.register_id
          INNER JOIN virtual_account_sessions AS virtual_session
            ON virtual_session.id = withdrawals.virtual_account_session_id
          INNER JOIN virtual_accounts AS virtual_account
            ON virtual_account.id = virtual_session.virtual_account_id
        )

        SELECT
          id,
          source,
          operation_type,
          operation_number,
          payment_method,
          status,
          created_by,
          created_at,
          description,
          reference,
          notes,
          amount_cents,
          cost_total_cents,
          profit_cents,
          cash_amount_cents,
          transfer_amount_cents,
          card_amount_cents,
          commission_amount_cents,
          item_count,
          cash_movement,
          cash_location,
          cash_source,
          register_name,
          virtual_account_name
        FROM unified_operations
        WHERE ${whereClause}
        ORDER BY created_at DESC, operation_number DESC
        LIMIT 1000
      `)
        .bind(...bindings)
        .all<UnifiedOperationRow>(),

      env.DB.prepare(`
        WITH operation_users AS (
          SELECT created_by AS name
          FROM sales
          WHERE created_by IS NOT NULL
            AND TRIM(created_by) <> ''

          UNION

          SELECT users.display_name AS name
          FROM cash_box_operations AS operations
          INNER JOIN app_users AS users
            ON users.id = operations.operator_user_id

          UNION

          SELECT users.display_name AS name
          FROM cash_withdrawals AS withdrawals
          INNER JOIN app_users AS users
            ON users.id = withdrawals.operator_user_id
        )

        SELECT name
        FROM operation_users
        WHERE name IS NOT NULL
          AND TRIM(name) <> ''
        ORDER BY name COLLATE NOCASE ASC
      `).all<UserRow>(),
    ]);

    const operations = operationsResult.results.map((operation) => ({
      id: operation.id,
      source: operation.source,
      operationType: operation.operation_type,
      operationNumber: Number(operation.operation_number),
      paymentMethod: operation.payment_method,
      status: operation.status,
      createdBy: operation.created_by,
      createdAt: operation.created_at,
      description: operation.description,
      reference: operation.reference,
      notes: operation.notes,
      amount: centsToMoney(operation.amount_cents),
      costTotal: centsToMoney(operation.cost_total_cents),
      profit: centsToMoney(operation.profit_cents),
      cashAmount: centsToMoney(operation.cash_amount_cents),
      transferAmount: centsToMoney(operation.transfer_amount_cents),
      cardAmount: centsToMoney(operation.card_amount_cents),
      commission: centsToMoney(operation.commission_amount_cents),
      itemCount: Number(operation.item_count || 0),
      cashMovement: operation.cash_movement,
      cashLocation: operation.cash_location,
      cashSource: operation.cash_source,
      registerName: operation.register_name,
      virtualAccountName: operation.virtual_account_name,
    }));

    /*
     * Las operaciones anuladas pueden aparecer en el historial,
     * pero no forman parte de las estadísticas.
     */
    const completedOperations = operations.filter(
      (operation) => operation.status === "COMPLETADA",
    );

    const totals = completedOperations.reduce(
      (summary, operation) => {
        summary.operationCount += 1;

        if (operation.operationType === "VENTA") {
          summary.saleCount += 1;
          summary.totalSold += operation.amount;
          summary.totalCost += operation.costTotal;
          summary.saleProfit += operation.profit;
          summary.cashSalesTotal += operation.cashAmount;
          summary.transferSalesTotal += operation.transferAmount;
          summary.cardSalesTotal += operation.cardAmount;
        }

        if (operation.operationType === "SERVICIO") {
          summary.serviceCount += 1;
          summary.servicesTotal += operation.amount;
        }

        if (operation.operationType === "QUINIELA") {
          summary.quinielaCount += 1;
          summary.quinielaTotal += operation.amount;
        }

        if (operation.operationType === "EXTRACCION") {
          summary.withdrawalCount += 1;
          summary.withdrawalsTotal += operation.amount;
          summary.withdrawalTransfersTotal += operation.transferAmount;
          summary.withdrawalCommissions += operation.commission;
        }

        if (operation.cashMovement === "ENTRADA") {
          summary.cashInTotal += operation.cashAmount;
        }

        if (operation.cashMovement === "SALIDA") {
          summary.cashOutTotal += operation.cashAmount;
        }

        return summary;
      },
      {
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
      },
    );

    const periodDays = Math.max(
      1,
      countCalendarDays(fromDate, toDate),
    );

    const averageTicket =
      totals.saleCount > 0
        ? totals.totalSold / totals.saleCount
        : 0;

    const averagePerDay = totals.totalSold / periodDays;
    const averageSalesPerDay = totals.saleCount / periodDays;

    /*
     * Ganancia total del sistema:
     * ganancia de ventas + comisiones de extracciones.
     */
    const totalProfit =
      totals.saleProfit + totals.withdrawalCommissions;

    return Response.json({
      period: {
        from: fromDate,
        to: toDate,
        days: periodDays,
      },

      filters: {
        type: operationType || "TODOS",
        user: user || "TODOS",
        status: status || "TODOS",
        payment: payment || "TODOS",
      },

      summary: {
        ...totals,
        totalProfit,
        averageTicket,
        averagePerDay,
        averageSalesPerDay,
      },

      users: usersResult.results.map((item) => item.name),
      operations,
    });
  } catch (error) {
    console.error(
      "Error al generar el informe general de operaciones:",
      error,
    );

    return Response.json(
      {
        error:
          "No se pudo generar el informe general de operaciones.",
      },
      { status: 500 },
    );
  }
}
