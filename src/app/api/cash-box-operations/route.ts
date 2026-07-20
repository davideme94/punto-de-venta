import {
  type NextRequest,
} from "next/server";

import {
  getCloudflareContext,
} from "@opennextjs/cloudflare";

import {
  getAuthenticatedCashier,
} from "@/lib/cashier-session";

export const dynamic =
  "force-dynamic";

type CashBoxOperationType =
  | "SERVICIO"
  | "QUINIELA";

type CreateOperationBody = {
  operationType?: CashBoxOperationType;
  amount?: number;
  description?: string;
  reference?: string;
  notes?: string;
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

type OperationRow = {
  id: string;
  operation_number: number;
  operation_type: CashBoxOperationType;

  operator_user_id: string;
  operator_name: string;

  operator_physical_session_id: string;
  register_name: string;

  virtual_account_session_id:
    | string
    | null;

  virtual_account_name:
    | string
    | null;

  payment_method: string;
  amount_cents: number;

  description:
    | string
    | null;

  reference:
    | string
    | null;

  notes:
    | string
    | null;

  status: string;
  created_at: string;
};

type OperationTotalsRow = {
  service_total_cents: number;
  quiniela_total_cents: number;
};

function normalizeText(
  value:
    | string
    | null
    | undefined,
): string {
  return value?.trim() ?? "";
}

function moneyToCents(
  value: number,
): number {
  return Math.round(
    value * 100,
  );
}

function centsToMoney(
  value: number,
): number {
  return (
    Number(
      value || 0,
    ) / 100
  );
}

function isOperationType(
  value: unknown,
): value is CashBoxOperationType {
  return (
    value === "SERVICIO" ||
    value === "QUINIELA"
  );
}

function getDefaultDescription(
  operationType: CashBoxOperationType,
): string {
  if (
    operationType === "SERVICIO"
  ) {
    return "Servicios y boletas";
  }

  return "Quiniela";
}

async function loadOpenVirtualSession(
  db: D1Database,
): Promise<VirtualSessionRow | null> {
  return db.prepare(`
    SELECT
      sessions.id,
      sessions.virtual_account_id,

      accounts.code
        AS account_code,

      accounts.name
        AS account_name,

      sessions.business_date,
      sessions.opening_balance_cents,
      sessions.opened_at

    FROM virtual_account_sessions
      AS sessions

    INNER JOIN virtual_accounts
      AS accounts

      ON accounts.id =
         sessions.virtual_account_id

    WHERE
      sessions.status =
        'ABIERTA'

      AND accounts.active = 1

    ORDER BY
      sessions.opened_at DESC

    LIMIT 1
  `).first<VirtualSessionRow>();
}

async function loadOperationTotals(
  db: D1Database,

  physicalSessionId: string,

  virtualSessionId:
    | string
    | null,
): Promise<OperationTotalsRow> {
  const result =
    await db.prepare(`
      SELECT

        COALESCE(
          (
            SELECT
              SUM(
                operations.amount_cents
              )

            FROM cash_box_operations
              AS operations

            WHERE
              operations.operation_type =
                'SERVICIO'

              AND operations.virtual_account_session_id =
                ?

              AND operations.status =
                'COMPLETADA'
          ),
          0
        ) AS service_total_cents,

        COALESCE(
          (
            SELECT
              SUM(
                operations.amount_cents
              )

            FROM cash_box_operations
              AS operations

            WHERE
              operations.operation_type =
                'QUINIELA'

              AND operations.operator_physical_session_id =
                ?

              AND operations.status =
                'COMPLETADA'
          ),
          0
        ) AS quiniela_total_cents
    `)
      .bind(
        virtualSessionId,
        physicalSessionId,
      )
      .first<OperationTotalsRow>();

  return (
    result ?? {
      service_total_cents: 0,
      quiniela_total_cents: 0,
    }
  );
}

async function loadRecentOperations(
  db: D1Database,

  physicalSessionId: string,

  virtualSessionId:
    | string
    | null,
): Promise<OperationRow[]> {
  const result =
    await db.prepare(`
      SELECT
        operations.id,
        operations.operation_number,
        operations.operation_type,

        operations.operator_user_id,

        operator.display_name
          AS operator_name,

        operations.operator_physical_session_id,

        physical_register.name
          AS register_name,

        operations.virtual_account_session_id,

        virtual_account.name
          AS virtual_account_name,

        operations.payment_method,
        operations.amount_cents,
        operations.description,
        operations.reference,
        operations.notes,
        operations.status,
        operations.created_at

      FROM cash_box_operations
        AS operations

      INNER JOIN app_users
        AS operator

        ON operator.id =
           operations.operator_user_id

      INNER JOIN physical_register_sessions
        AS physical_session

        ON physical_session.id =
           operations.operator_physical_session_id

      INNER JOIN physical_registers
        AS physical_register

        ON physical_register.id =
           physical_session.register_id

      LEFT JOIN virtual_account_sessions
        AS virtual_session

        ON virtual_session.id =
           operations.virtual_account_session_id

      LEFT JOIN virtual_accounts
        AS virtual_account

        ON virtual_account.id =
           virtual_session.virtual_account_id

      WHERE
        operations.operator_physical_session_id =
          ?

        OR (
          ? IS NOT NULL

          AND operations.virtual_account_session_id =
              ?
        )

      ORDER BY
        operations.operation_number DESC

      LIMIT 30
    `)
      .bind(
        physicalSessionId,
        virtualSessionId,
        virtualSessionId,
      )
      .all<OperationRow>();

  return result.results;
}

function mapOperation(
  operation: OperationRow,
) {
  return {
    id:
      operation.id,

    operationNumber:
      operation.operation_number,

    operationType:
      operation.operation_type,

    operationTypeLabel:
      operation.operation_type ===
      "SERVICIO"
        ? "Servicios y boletas"
        : "Quiniela",

    operatorUserId:
      operation.operator_user_id,

    operatorName:
      operation.operator_name,

    physicalSessionId:
      operation
        .operator_physical_session_id,

    registerName:
      operation.register_name,

    virtualSessionId:
      operation
        .virtual_account_session_id,

    virtualAccountName:
      operation
        .virtual_account_name,

    destinationLabel:
      operation.operation_type ===
      "SERVICIO"
        ? operation
            .virtual_account_name ??
          "Caja Virtual"
        : operation.register_name,

    paymentMethod:
      operation.payment_method,

    amount:
      centsToMoney(
        operation.amount_cents,
      ),

    description:
      operation.description,

    reference:
      operation.reference,

    notes:
      operation.notes,

    status:
      operation.status,

    createdAt:
      operation.created_at,
  };
}

/*
 * GET /api/cash-box-operations
 *
 * Devuelve:
 *
 * - la cajera conectada;
 * - la caja física asignada;
 * - la Caja Virtual abierta;
 * - los totales del día;
 * - las operaciones recientes.
 */
export async function GET(
  request: NextRequest,
) {
  try {
    const cashier =
      await getAuthenticatedCashier(
        request,
      );

    if (!cashier) {
      return Response.json(
        {
          error:
            "Primero debés iniciar sesión como cajera.",
        },
        {
          status: 401,
        },
      );
    }

    if (
      !cashier.physicalSessionId ||
      !cashier.registerId
    ) {
      return Response.json(
        {
          error:
            "No tenés una caja física abierta y asignada.",
        },
        {
          status: 409,
        },
      );
    }

    if (
      cashier.confirmationStatus !==
      "CONFIRMADA"
    ) {
      return Response.json(
        {
          error:
            "Primero debés confirmar la recepción de la caja.",
        },
        {
          status: 409,
        },
      );
    }

    const { env } =
      getCloudflareContext();

    const virtualSession =
      await loadOpenVirtualSession(
        env.DB,
      );

    const [
      totals,
      recentOperations,
    ] = await Promise.all([
      loadOperationTotals(
        env.DB,

        cashier.physicalSessionId,

        virtualSession?.id ?? null,
      ),

      loadRecentOperations(
        env.DB,

        cashier.physicalSessionId,

        virtualSession?.id ?? null,
      ),
    ]);

    return Response.json({
      cashier: {
        id:
          cashier.userId,

        username:
          cashier.username,

        displayName:
          cashier.displayName,
      },

      businessDate:
        cashier.businessDate,

      physicalRegister: {
        sessionId:
          cashier.physicalSessionId,

        registerId:
          cashier.registerId,

        registerCode:
          cashier.registerCode,

        registerName:
          cashier.registerName,

        confirmationStatus:
          cashier.confirmationStatus,
      },

      virtualRegister:
        virtualSession
          ? {
              sessionId:
                virtualSession.id,

              accountId:
                virtualSession
                  .virtual_account_id,

              accountCode:
                virtualSession
                  .account_code,

              accountName:
                virtualSession
                  .account_name,

              businessDate:
                virtualSession
                  .business_date,

              openingAmount:
                centsToMoney(
                  virtualSession
                    .opening_balance_cents,
                ),
            }
          : null,

      serviceAvailable:
        Boolean(
          virtualSession &&
            cashier.businessDate ===
              virtualSession
                .business_date,
        ),

      totals: {
        services:
          centsToMoney(
            totals
              .service_total_cents,
          ),

        quiniela:
          centsToMoney(
            totals
              .quiniela_total_cents,
          ),
      },

      recentOperations:
        recentOperations.map(
          mapOperation,
        ),
    });
  } catch (error) {
    console.error(
      "Error al cargar Servicios y Quiniela:",
      error,
    );

    return Response.json(
      {
        error:
          "No se pudo cargar la información de Servicios y Quiniela.",
      },
      {
        status: 500,
      },
    );
  }
}

/*
 * POST /api/cash-box-operations
 *
 * SERVICIO:
 * El efectivo ingresa en Caja Virtual.
 *
 * QUINIELA:
 * El efectivo ingresa en la caja física
 * asignada a la cajera.
 */
export async function POST(
  request: NextRequest,
) {
  try {
    const cashier =
      await getAuthenticatedCashier(
        request,
      );

    if (!cashier) {
      return Response.json(
        {
          error:
            "Primero debés iniciar sesión como cajera.",
        },
        {
          status: 401,
        },
      );
    }

    if (
      !cashier.physicalSessionId ||
      !cashier.registerId
    ) {
      return Response.json(
        {
          error:
            "No tenés una caja física abierta y asignada.",
        },
        {
          status: 409,
        },
      );
    }

    if (
      cashier.confirmationStatus !==
      "CONFIRMADA"
    ) {
      return Response.json(
        {
          error:
            "Primero debés confirmar la recepción de la caja.",
        },
        {
          status: 409,
        },
      );
    }

    const body =
      (await request.json()) as CreateOperationBody;

    const operationType =
      body.operationType;

    const amount =
      Number(
        body.amount,
      );

    if (
      !isOperationType(
        operationType,
      )
    ) {
      return Response.json(
        {
          error:
            "El tipo de operación no es válido.",
        },
        {
          status: 400,
        },
      );
    }

    if (
      !Number.isFinite(
        amount,
      ) ||
      amount <= 0
    ) {
      return Response.json(
        {
          error:
            "Ingresá un importe válido.",
        },
        {
          status: 400,
        },
      );
    }

    const amountCents =
      moneyToCents(
        amount,
      );

    if (
      amountCents <= 0
    ) {
      return Response.json(
        {
          error:
            "El importe debe ser mayor que cero.",
        },
        {
          status: 400,
        },
      );
    }

    const description =
      normalizeText(
        body.description,
      ) ||
      getDefaultDescription(
        operationType,
      );

    const reference =
      normalizeText(
        body.reference,
      ) || null;

    const notes =
      normalizeText(
        body.notes,
      ) || null;

    const { env } =
      getCloudflareContext();

    let virtualSession:
      VirtualSessionRow | null =
      null;

    if (
      operationType ===
      "SERVICIO"
    ) {
      virtualSession =
        await loadOpenVirtualSession(
          env.DB,
        );

      if (!virtualSession) {
        return Response.json(
          {
            error:
              "No existe una Caja Virtual abierta para registrar Servicios y Boletas.",
          },
          {
            status: 409,
          },
        );
      }

      if (
        cashier.businessDate !==
        virtualSession.business_date
      ) {
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

    const operationId =
      crypto.randomUUID();

    const virtualSessionId =
      operationType ===
        "SERVICIO"
        ? virtualSession?.id ??
          null
        : null;

    await env.DB.batch([
      env.DB.prepare(`
        UPDATE cash_box_operation_counter

        SET
          last_number =
            last_number + 1

        WHERE
          id = 1
      `),

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

        WHERE
          id = 1
      `).bind(
        operationId,

        operationType,

        cashier.userId,

        cashier.physicalSessionId,

        virtualSessionId,

        amountCents,

        description,

        reference,

        notes,
      ),
    ]);

    const createdOperation =
      await env.DB.prepare(`
        SELECT
          operations.id,
          operations.operation_number,
          operations.operation_type,

          operations.operator_user_id,

          operator.display_name
            AS operator_name,

          operations.operator_physical_session_id,

          physical_register.name
            AS register_name,

          operations.virtual_account_session_id,

          virtual_account.name
            AS virtual_account_name,

          operations.payment_method,
          operations.amount_cents,
          operations.description,
          operations.reference,
          operations.notes,
          operations.status,
          operations.created_at

        FROM cash_box_operations
          AS operations

        INNER JOIN app_users
          AS operator

          ON operator.id =
             operations.operator_user_id

        INNER JOIN physical_register_sessions
          AS physical_session

          ON physical_session.id =
             operations
               .operator_physical_session_id

        INNER JOIN physical_registers
          AS physical_register

          ON physical_register.id =
             physical_session.register_id

        LEFT JOIN virtual_account_sessions
          AS virtual_session

          ON virtual_session.id =
             operations
               .virtual_account_session_id

        LEFT JOIN virtual_accounts
          AS virtual_account

          ON virtual_account.id =
             virtual_session
               .virtual_account_id

        WHERE
          operations.id = ?

        LIMIT 1
      `)
        .bind(
          operationId,
        )
        .first<OperationRow>();

    if (!createdOperation) {
      return Response.json(
        {
          error:
            "La operación fue guardada, pero no pudo recuperarse.",
        },
        {
          status: 500,
        },
      );
    }

    return Response.json(
      {
        message:
          operationType ===
          "SERVICIO"
            ? "El pago de Servicio o Boleta fue registrado en Caja Virtual."
            : "La operación de Quiniela fue registrada en la caja física.",

        operation:
          mapOperation(
            createdOperation,
          ),
      },
      {
        status: 201,
      },
    );
  } catch (error) {
    console.error(
      "Error al registrar operación:",
      error,
    );

    const errorMessage =
      error instanceof Error
        ? error.message
        : "";

    if (
      errorMessage.includes(
        "INVALID_CASHIER",
      )
    ) {
      return Response.json(
        {
          error:
            "La cajera ya no está habilitada.",
        },
        {
          status: 401,
        },
      );
    }

    if (
      errorMessage.includes(
        "INVALID_OPERATOR_REGISTER",
      )
    ) {
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

    if (
      errorMessage.includes(
        "INVALID_VIRTUAL_SESSION",
      )
    ) {
      return Response.json(
        {
          error:
            "La Caja Virtual ya no está abierta.",
        },
        {
          status: 409,
        },
      );
    }

    if (
      errorMessage.includes(
        "BUSINESS_DATE_MISMATCH",
      )
    ) {
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

    if (
      errorMessage.includes(
        "UNIQUE constraint failed",
      )
    ) {
      return Response.json(
        {
          error:
            "No se pudo generar el número de operación. Volvé a intentarlo.",
        },
        {
          status: 409,
        },
      );
    }

    return Response.json(
      {
        error:
          "No se pudo registrar la operación.",
      },
      {
        status: 500,
      },
    );
  }
}