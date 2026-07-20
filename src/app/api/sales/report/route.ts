import { getCloudflareContext } from "@opennextjs/cloudflare";

export const dynamic = "force-dynamic";

type SaleStatus =
  | "COMPLETADA"
  | "ANULADA";

type PaymentMethod =
  | "EFECTIVO"
  | "TRANSFERENCIA"
  | "TARJETA"
  | "MIXTO";

type SaleReportRow = {
  id: string;
  sale_number: number;
  operation_type: string;
  payment_method: PaymentMethod;
  total_cents: number;
  status: SaleStatus;
  created_by: string;
  notes: string | null;
  created_at: string;
  item_count: number;
  cost_total_cents: number;
  profit_cents: number;
};

type UserRow = {
  created_by: string;
};

type DateParts = {
  year: number;
  month: number;
  day: number;
};

function centsToMoney(
  value: number,
): number {
  return Number(value || 0) / 100;
}

function normalizeText(
  value: string | null,
): string {
  return value?.trim() ?? "";
}

function isSaleStatus(
  value: string,
): value is SaleStatus {
  return (
    value === "COMPLETADA" ||
    value === "ANULADA"
  );
}

function isPaymentMethod(
  value: string,
): value is PaymentMethod {
  return (
    value === "EFECTIVO" ||
    value === "TRANSFERENCIA" ||
    value === "TARJETA" ||
    value === "MIXTO"
  );
}

function parseDateParts(
  value: string,
): DateParts | null {
  const match =
    /^(\d{4})-(\d{2})-(\d{2})$/.exec(
      value,
    );

  if (!match) {
    return null;
  }

  const year =
    Number(match[1]);

  const month =
    Number(match[2]);

  const day =
    Number(match[3]);

  const date =
    new Date(
      Date.UTC(
        year,
        month - 1,
        day,
      ),
    );

  const isValid =
    date.getUTCFullYear() === year &&
    date.getUTCMonth() ===
      month - 1 &&
    date.getUTCDate() === day;

  if (!isValid) {
    return null;
  }

  return {
    year,
    month,
    day,
  };
}

function formatDateParts(
  parts: DateParts,
): string {
  return [
    String(parts.year).padStart(
      4,
      "0",
    ),

    String(parts.month).padStart(
      2,
      "0",
    ),

    String(parts.day).padStart(
      2,
      "0",
    ),
  ].join("-");
}

function addDays(
  value: string,
  amount: number,
): string {
  const parts =
    parseDateParts(value);

  if (!parts) {
    throw new Error(
      "Fecha inválida.",
    );
  }

  const date =
    new Date(
      Date.UTC(
        parts.year,
        parts.month - 1,
        parts.day + amount,
      ),
    );

  return formatDateParts({
    year:
      date.getUTCFullYear(),

    month:
      date.getUTCMonth() + 1,

    day:
      date.getUTCDate(),
  });
}

function getBuenosAiresToday(): string {
  const formatter =
    new Intl.DateTimeFormat(
      "en-US",
      {
        timeZone:
          "America/Argentina/Buenos_Aires",

        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      },
    );

  const parts =
    formatter.formatToParts(
      new Date(),
    );

  const year =
    parts.find(
      (part) =>
        part.type === "year",
    )?.value;

  const month =
    parts.find(
      (part) =>
        part.type === "month",
    )?.value;

  const day =
    parts.find(
      (part) =>
        part.type === "day",
    )?.value;

  if (
    !year ||
    !month ||
    !day
  ) {
    throw new Error(
      "No se pudo determinar la fecha actual.",
    );
  }

  return `${year}-${month}-${day}`;
}

/*
 * Convierte el inicio de un día argentino
 * a la fecha UTC guardada por D1.
 *
 * Ejemplo:
 * 16/07/2026 00:00 Argentina
 * =
 * 16/07/2026 03:00 UTC
 */
function localDateToUtcBoundary(
  value: string,
): string {
  const date =
    new Date(
      `${value}T00:00:00-03:00`,
    );

  if (
    Number.isNaN(
      date.getTime(),
    )
  ) {
    throw new Error(
      "Fecha inválida.",
    );
  }

  return date
    .toISOString()
    .slice(0, 19)
    .replace("T", " ");
}

function countCalendarDays(
  fromDate: string,
  toDate: string,
): number {
  const fromParts =
    parseDateParts(fromDate);

  const toParts =
    parseDateParts(toDate);

  if (
    !fromParts ||
    !toParts
  ) {
    return 1;
  }

  const fromTime =
    Date.UTC(
      fromParts.year,
      fromParts.month - 1,
      fromParts.day,
    );

  const toTime =
    Date.UTC(
      toParts.year,
      toParts.month - 1,
      toParts.day,
    );

  return (
    Math.floor(
      (toTime - fromTime) /
        86_400_000,
    ) + 1
  );
}

/*
 * GET /api/sales/report
 *
 * Parámetros disponibles:
 *
 * from=2026-07-16
 * to=2026-07-16
 * user=Administrador
 * status=COMPLETADA
 * payment=EFECTIVO
 *
 * Sin parámetros devuelve solamente
 * las ventas del día actual.
 */
export async function GET(
  request: Request,
) {
  try {
    const url =
      new URL(request.url);

    const today =
      getBuenosAiresToday();

    const fromDate =
      normalizeText(
        url.searchParams.get(
          "from",
        ),
      ) || today;

    const toDate =
      normalizeText(
        url.searchParams.get(
          "to",
        ),
      ) || fromDate;

    const user =
      normalizeText(
        url.searchParams.get(
          "user",
        ),
      );

    const status =
      normalizeText(
        url.searchParams.get(
          "status",
        ),
      );

    const payment =
      normalizeText(
        url.searchParams.get(
          "payment",
        ),
      );

    const fromParts =
      parseDateParts(fromDate);

    const toParts =
      parseDateParts(toDate);

    if (
      !fromParts ||
      !toParts
    ) {
      return Response.json(
        {
          error:
            "Las fechas deben tener el formato AAAA-MM-DD.",
        },
        {
          status: 400,
        },
      );
    }

    const fromTime =
      Date.UTC(
        fromParts.year,
        fromParts.month - 1,
        fromParts.day,
      );

    const toTime =
      Date.UTC(
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
        {
          status: 400,
        },
      );
    }

    if (
      status &&
      status !== "TODOS" &&
      !isSaleStatus(status)
    ) {
      return Response.json(
        {
          error:
            "El estado seleccionado no es válido.",
        },
        {
          status: 400,
        },
      );
    }

    if (
      payment &&
      payment !== "TODOS" &&
      !isPaymentMethod(payment)
    ) {
      return Response.json(
        {
          error:
            "El medio de pago seleccionado no es válido.",
        },
        {
          status: 400,
        },
      );
    }

    /*
     * El límite superior es exclusivo.
     *
     * Para consultar el 16/07:
     * desde 16/07 00:00 Argentina
     * hasta 17/07 00:00 Argentina.
     */
    const toExclusiveDate =
      addDays(
        toDate,
        1,
      );

    const fromUtc =
      localDateToUtcBoundary(
        fromDate,
      );

    const toExclusiveUtc =
      localDateToUtcBoundary(
        toExclusiveDate,
      );

    const whereConditions = [
      "sales.created_at >= ?",
      "sales.created_at < ?",
    ];

    const bindings: Array<
      string | number
    > = [
      fromUtc,
      toExclusiveUtc,
    ];

    if (
      user &&
      user !== "TODOS"
    ) {
      whereConditions.push(
        "sales.created_by = ?",
      );

      bindings.push(user);
    }

    if (
      status &&
      status !== "TODOS"
    ) {
      whereConditions.push(
        "sales.status = ?",
      );

      bindings.push(status);
    }

    if (
      payment &&
      payment !== "TODOS"
    ) {
      whereConditions.push(
        "sales.payment_method = ?",
      );

      bindings.push(payment);
    }

    const whereClause =
      whereConditions.join(
        " AND ",
      );

    const { env } =
      getCloudflareContext();

    const [
      result,
      usersResult,
    ] = await Promise.all([
      env.DB.prepare(`
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

          COALESCE(
            item_totals.item_count,
            0
          ) AS item_count,

          COALESCE(
            item_totals.cost_total_cents,
            0
          ) AS cost_total_cents,

          sales.total_cents -
          COALESCE(
            item_totals.cost_total_cents,
            0
          ) AS profit_cents

        FROM sales

        LEFT JOIN (
          SELECT
            sale_id,

            COUNT(id)
              AS item_count,

            SUM(
              unit_cost_cents *
              quantity
            )
              AS cost_total_cents

          FROM sale_items

          GROUP BY
            sale_id
        ) AS item_totals
          ON item_totals.sale_id =
             sales.id

        WHERE
          ${whereClause}

        ORDER BY
          sales.created_at DESC,
          sales.sale_number DESC

        LIMIT 500
      `)
        .bind(...bindings)
        .all<SaleReportRow>(),

      env.DB.prepare(`
        SELECT DISTINCT
          created_by

        FROM sales

        WHERE
          created_by IS NOT NULL
          AND TRIM(created_by) <> ''

        ORDER BY
          created_by ASC
      `).all<UserRow>(),
    ]);

    const sales =
      result.results.map(
        (sale) => ({
          id:
            sale.id,

          saleNumber:
            sale.sale_number,

          operationType:
            sale.operation_type,

          paymentMethod:
            sale.payment_method,

          total:
            centsToMoney(
              sale.total_cents,
            ),

          costTotal:
            centsToMoney(
              sale.cost_total_cents,
            ),

          profit:
            centsToMoney(
              sale.profit_cents,
            ),

          status:
            sale.status,

          createdBy:
            sale.created_by,

          notes:
            sale.notes,

          createdAt:
            sale.created_at,

          itemCount:
            Number(
              sale.item_count || 0,
            ),
        }),
      );

    /*
     * Las ventas anuladas aparecen en
     * la tabla si se las solicita, pero
     * no se suman a los resultados.
     */
    const completedSales =
      sales.filter(
        (sale) =>
          sale.status ===
          "COMPLETADA",
      );

    const totals =
      completedSales.reduce(
        (
          currentSummary,
          sale,
        ) => ({
          saleCount:
            currentSummary.saleCount +
            1,

          totalSold:
            currentSummary.totalSold +
            sale.total,

          totalCost:
            currentSummary.totalCost +
            sale.costTotal,

          totalProfit:
            currentSummary.totalProfit +
            sale.profit,
        }),
        {
          saleCount: 0,
          totalSold: 0,
          totalCost: 0,
          totalProfit: 0,
        },
      );

    const periodDays =
      Math.max(
        1,
        countCalendarDays(
          fromDate,
          toDate,
        ),
      );

    const averageTicket =
      totals.saleCount > 0
        ? totals.totalSold /
          totals.saleCount
        : 0;

    const averagePerDay =
      totals.totalSold /
      periodDays;

    const averageSalesPerDay =
      totals.saleCount /
      periodDays;

    return Response.json({
      period: {
        from:
          fromDate,

        to:
          toDate,

        days:
          periodDays,
      },

      filters: {
        user:
          user || "TODOS",

        status:
          status || "TODOS",

        payment:
          payment || "TODOS",
      },

      summary: {
        ...totals,

        averageTicket,

        averagePerDay,

        averageSalesPerDay,
      },

      users:
        usersResult.results.map(
          (item) =>
            item.created_by,
        ),

      sales,
    });
  } catch (error) {
    console.error(
      "Error al generar informe de ventas:",
      error,
    );

    return Response.json(
      {
        error:
          "No se pudo generar el informe de ventas.",
      },
      {
        status: 500,
      },
    );
  }
}