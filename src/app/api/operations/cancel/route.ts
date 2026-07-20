import {
  type NextRequest,
} from "next/server";

import {
  getCloudflareContext,
} from "@opennextjs/cloudflare";

import {
  getAuthenticatedAdmin,
} from "@/lib/admin-session";

export const dynamic =
  "force-dynamic";

type OperationType =
  | "VENTA"
  | "SERVICIO"
  | "QUINIELA"
  | "EXTRACCION";

type OperationStatus =
  | "COMPLETADA"
  | "ANULADA";

type CancelOperationBody = {
  operationId?: string;
  operationType?: OperationType;
  reason?: string;
};

type ExistingOperationRow = {
  id: string;
  operation_number: number;
  status: OperationStatus;
};

function normalizeText(
  value:
    | string
    | null
    | undefined,
): string {
  return value?.trim() ?? "";
}

function isOperationType(
  value: unknown,
): value is OperationType {
  return (
    value === "VENTA" ||
    value === "SERVICIO" ||
    value === "QUINIELA" ||
    value === "EXTRACCION"
  );
}

function getOperationLabel(
  operationType: OperationType,
): string {
  if (
    operationType === "VENTA"
  ) {
    return "Venta";
  }

  if (
    operationType === "SERVICIO"
  ) {
    return "Servicio";
  }

  if (
    operationType === "QUINIELA"
  ) {
    return "Quiniela";
  }

  return "Extracción";
}

async function loadExistingOperation(
  db: D1Database,
  operationType: OperationType,
  operationId: string,
): Promise<ExistingOperationRow | null> {
  if (
    operationType === "VENTA"
  ) {
    return db.prepare(`
      SELECT
        id,
        sale_number
          AS operation_number,
        status

      FROM sales

      WHERE
        id = ?

      LIMIT 1
    `)
      .bind(
        operationId,
      )
      .first<ExistingOperationRow>();
  }

  if (
    operationType === "SERVICIO" ||
    operationType === "QUINIELA"
  ) {
    return db.prepare(`
      SELECT
        id,
        operation_number,
        status

      FROM cash_box_operations

      WHERE
        id = ?

        AND operation_type = ?

      LIMIT 1
    `)
      .bind(
        operationId,
        operationType,
      )
      .first<ExistingOperationRow>();
  }

  return db.prepare(`
    SELECT
      id,
      operation_number,
      status

    FROM cash_withdrawals

    WHERE
      id = ?

    LIMIT 1
  `)
    .bind(
      operationId,
    )
    .first<ExistingOperationRow>();
}

async function cancelSale(
  db: D1Database,
  operationId: string,
  cancelledAt: string,
  cancelledBy: string,
  reason: string,
): Promise<boolean> {
  const results =
    await db.batch([
      db.prepare(`
        UPDATE sales

        SET
          status =
            'ANULADA',

          cancelled_at =
            ?,

          cancelled_by =
            ?,

          cancellation_reason =
            ?

        WHERE
          id = ?

          AND status =
            'COMPLETADA'
      `).bind(
        cancelledAt,
        cancelledBy,
        reason,
        operationId,
      ),

      /*
       * El stock se devuelve una sola vez.
       *
       * La segunda sentencia solamente se ejecuta
       * sobre productos si la venta quedó anulada
       * con el identificador temporal exclusivo de
       * esta solicitud.
       *
       * Como D1 ejecuta batch de forma atómica,
       * la anulación y la devolución de stock
       * se confirman o se revierten juntas.
       */
      db.prepare(`
        UPDATE products

        SET
          stock =
            stock + COALESCE(
              (
                SELECT
                  SUM(
                    items.quantity
                  )

                FROM sale_items
                  AS items

                WHERE
                  items.sale_id = ?

                  AND items.product_id =
                      products.id
              ),
              0
            ),

          updated_at =
            CURRENT_TIMESTAMP

        WHERE
          id IN (
            SELECT
              items.product_id

            FROM sale_items
              AS items

            WHERE
              items.sale_id = ?

              AND items.product_id
                  IS NOT NULL
          )

          AND EXISTS (
            SELECT
              1

            FROM sales

            WHERE
              sales.id = ?

              AND sales.status =
                  'ANULADA'

              AND sales.cancelled_at = ?
          )
      `).bind(
        operationId,
        operationId,
        operationId,
        cancelledAt,
      ),
    ]);

  return (
    Number(
      results[0]?.meta
        ?.changes ?? 0,
    ) > 0
  );
}

async function cancelCashBoxOperation(
  db: D1Database,
  operationId: string,
  operationType:
    | "SERVICIO"
    | "QUINIELA",
  cancelledAt: string,
  cancelledByUserId: string,
  reason: string,
): Promise<boolean> {
  const result =
    await db.prepare(`
      UPDATE cash_box_operations

      SET
        status =
          'ANULADA',

        cancelled_at =
          ?,

        cancelled_by_user_id =
          ?,

        cancellation_reason =
          ?

      WHERE
        id = ?

        AND operation_type = ?

        AND status =
          'COMPLETADA'
    `)
      .bind(
        cancelledAt,
        cancelledByUserId,
        reason,
        operationId,
        operationType,
      )
      .run();

  return (
    Number(
      result.meta
        ?.changes ?? 0,
    ) > 0
  );
}

async function cancelWithdrawal(
  db: D1Database,
  operationId: string,
  cancelledAt: string,
  cancelledByUserId: string,
  reason: string,
): Promise<boolean> {
  const result =
    await db.prepare(`
      UPDATE cash_withdrawals

      SET
        status =
          'ANULADA',

        cancelled_at =
          ?,

        cancelled_by_user_id =
          ?,

        cancellation_reason =
          ?

      WHERE
        id = ?

        AND status =
          'COMPLETADA'
    `)
      .bind(
        cancelledAt,
        cancelledByUserId,
        reason,
        operationId,
      )
      .run();

  return (
    Number(
      result.meta
        ?.changes ?? 0,
    ) > 0
  );
}

/*
 * POST /api/operations/cancel
 *
 * Anula una operación desde el historial
 * administrativo.
 *
 * Requiere una sesión ADMIN válida.
 *
 * La anulación:
 *
 * - conserva la operación en el historial;
 * - deja de incluirla en cierres y estadísticas;
 * - guarda administrador, fecha y motivo;
 * - devuelve el stock cuando se trata de una venta.
 */
export async function POST(
  request: NextRequest,
) {
  try {
    const admin =
      await getAuthenticatedAdmin(
        request,
      );

    if (!admin) {
      return Response.json(
        {
          error:
            "Primero debés iniciar sesión como administrador.",
        },
        {
          status: 401,
        },
      );
    }

    let body:
      CancelOperationBody;

    try {
      body =
        (await request.json()) as CancelOperationBody;
    } catch {
      return Response.json(
        {
          error:
            "No se pudo leer la información de la anulación.",
        },
        {
          status: 400,
        },
      );
    }

    const operationId =
      normalizeText(
        body.operationId,
      );

    const operationType =
      body.operationType;

    const reason =
      normalizeText(
        body.reason,
      );

    if (!operationId) {
      return Response.json(
        {
          error:
            "Falta identificar la operación.",
        },
        {
          status: 400,
        },
      );
    }

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
      reason.length < 3
    ) {
      return Response.json(
        {
          error:
            "Escribí un motivo de anulación de al menos 3 caracteres.",
        },
        {
          status: 400,
        },
      );
    }

    if (
      reason.length > 500
    ) {
      return Response.json(
        {
          error:
            "El motivo de anulación no puede superar los 500 caracteres.",
        },
        {
          status: 400,
        },
      );
    }

    const { env } =
      getCloudflareContext();

    const existingOperation =
      await loadExistingOperation(
        env.DB,
        operationType,
        operationId,
      );

    if (!existingOperation) {
      return Response.json(
        {
          error:
            "La operación seleccionada no existe.",
        },
        {
          status: 404,
        },
      );
    }

    if (
      existingOperation.status ===
      "ANULADA"
    ) {
      return Response.json(
        {
          error:
            "La operación ya estaba anulada.",
        },
        {
          status: 409,
        },
      );
    }

    /*
     * Se guarda un instante con milisegundos.
     * También funciona como identificador exclusivo
     * de esta anulación al devolver stock.
     */
    const cancelledAt =
      new Date().toISOString();

    let cancelled = false;

    if (
      operationType === "VENTA"
    ) {
      cancelled =
        await cancelSale(
          env.DB,
          operationId,
          cancelledAt,
          admin.displayName,
          reason,
        );
    } else if (
      operationType === "SERVICIO" ||
      operationType === "QUINIELA"
    ) {
      cancelled =
        await cancelCashBoxOperation(
          env.DB,
          operationId,
          operationType,
          cancelledAt,
          admin.userId,
          reason,
        );
    } else {
      cancelled =
        await cancelWithdrawal(
          env.DB,
          operationId,
          cancelledAt,
          admin.userId,
          reason,
        );
    }

    if (!cancelled) {
      return Response.json(
        {
          error:
            "La operación cambió de estado y no pudo anularse. Actualizá el historial e intentá nuevamente.",
        },
        {
          status: 409,
        },
      );
    }

    const operationLabel =
      getOperationLabel(
        operationType,
      );

    return Response.json({
      message:
        `${operationLabel} N.º ${existingOperation.operation_number} anulada correctamente.`,

      operation: {
        id:
          existingOperation.id,

        operationNumber:
          existingOperation.operation_number,

        operationType,

        status:
          "ANULADA" as const,

        cancelledAt,

        cancelledBy:
          admin.displayName,

        cancellationReason:
          reason,
      },
    });
  } catch (error) {
    console.error(
      "Error al anular operación:",
      error,
    );

    return Response.json(
      {
        error:
          "No se pudo anular la operación.",
      },
      {
        status: 500,
      },
    );
  }
}