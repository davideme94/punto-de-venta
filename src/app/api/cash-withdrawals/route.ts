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

type CashSource =
  | "PHYSICAL_REGISTER"
  | "VIRTUAL_ACCOUNT";

type CreateWithdrawalBody = {
  withdrawalAmount?: number;
  cashSource?: CashSource;
  transferReference?: string;
  notes?: string;
};

type VirtualSessionRow = {
  id: string;
  virtual_account_id: string;
  virtual_account_code: string;
  virtual_account_name: string;
  business_date: string;
  opening_balance_cents: number;
  opened_at: string;
};

type PhysicalBalanceRow = {
  opening_amount_cents: number;
  cash_sales_cents: number;
  withdrawals_cents: number;
};

type VirtualBalanceRow = {
  opening_balance_cents: number;
  digital_sales_cents: number;
  withdrawal_transfers_cents: number;
  virtual_cash_withdrawals_cents: number;
};

type CreatedWithdrawalRow = {
  id: string;
  operation_number: number;
  operator_user_id: string;
  operator_name: string;

  physical_register_session_id:
    | string
    | null;

  register_name:
    | string
    | null;

  virtual_account_session_id: string;
  virtual_account_name: string;

  cash_source: CashSource;

  withdrawal_amount_cents: number;

  commission_rate_basis_points: number;

  commission_amount_cents: number;

  transfer_total_cents: number;

  transfer_reference:
    | string
    | null;

  notes:
    | string
    | null;

  status: string;
  created_at: string;
};

type RecentWithdrawalRow = {
  id: string;
  operation_number: number;
  operator_name: string;

  register_name:
    | string
    | null;

  virtual_account_name: string;

  cash_source: CashSource;

  withdrawal_amount_cents: number;
  commission_amount_cents: number;
  transfer_total_cents: number;

  transfer_reference:
    | string
    | null;

  notes:
    | string
    | null;

  status: string;
  created_at: string;
};

const COMMISSION_RATE_BASIS_POINTS =
  300;

/*
 * 300 puntos base equivalen al 3%.
 *
 * 100 puntos base = 1%.
 * 300 puntos base = 3%.
 */
const BASIS_POINTS_DIVISOR =
  10_000;

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

function isCashSource(
  value: unknown,
): value is CashSource {
  return (
    value ===
      "PHYSICAL_REGISTER" ||
    value ===
      "VIRTUAL_ACCOUNT"
  );
}

function calculateCommissionCents(
  withdrawalAmountCents: number,
): number {
  return Math.round(
    (
      withdrawalAmountCents *
      COMMISSION_RATE_BASIS_POINTS
    ) /
      BASIS_POINTS_DIVISOR,
  );
}

async function loadOpenVirtualSession(
  db: D1Database,
): Promise<VirtualSessionRow | null> {
  return db.prepare(`
    SELECT
      sessions.id,
      sessions.virtual_account_id,

      accounts.code
        AS virtual_account_code,

      accounts.name
        AS virtual_account_name,

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

    LIMIT 1
  `).first<VirtualSessionRow>();
}

async function loadPhysicalBalance(
  db: D1Database,
  physicalSessionId: string,
): Promise<PhysicalBalanceRow | null> {
  return db.prepare(`
    SELECT
      physical_session.opening_amount_cents,

      COALESCE(
        (
          SELECT
            SUM(
              payments.amount_cents
            )

          FROM sales

          INNER JOIN sale_payments
            AS payments
            ON payments.sale_id =
               sales.id

          WHERE
            sales.physical_register_session_id =
              physical_session.id

            AND sales.status =
                'COMPLETADA'

            AND payments.method =
                'EFECTIVO'
        ),
        0
      ) AS cash_sales_cents,

      COALESCE(
        (
          SELECT
            SUM(
              withdrawals.withdrawal_amount_cents
            )

          FROM cash_withdrawals
            AS withdrawals

          WHERE
            withdrawals.physical_register_session_id =
              physical_session.id

            AND withdrawals.cash_source =
                'PHYSICAL_REGISTER'

            AND withdrawals.status =
                'COMPLETADA'
        ),
        0
      ) AS withdrawals_cents

    FROM physical_register_sessions
      AS physical_session

    WHERE
      physical_session.id = ?

      AND physical_session.status =
          'ABIERTA'

      AND physical_session.cashier_confirmation_status =
          'CONFIRMADA'

    LIMIT 1
  `)
    .bind(
      physicalSessionId,
    )
    .first<PhysicalBalanceRow>();
}

async function loadVirtualBalance(
  db: D1Database,
  virtualSession: VirtualSessionRow,
): Promise<VirtualBalanceRow> {
  const result =
    await db.prepare(`
      SELECT
        ? AS opening_balance_cents,

        COALESCE(
          (
            SELECT
              SUM(
                payments.amount_cents
              )

            FROM sales

            INNER JOIN sale_payments
              AS payments
              ON payments.sale_id =
                 sales.id

            WHERE
              sales.status =
                'COMPLETADA'

              AND sales.created_at >= ?

              AND payments.method IN (
                'TRANSFERENCIA',
                'TARJETA'
              )
          ),
          0
        ) AS digital_sales_cents,

        COALESCE(
          (
            SELECT
              SUM(
                withdrawals.transfer_total_cents
              )

            FROM cash_withdrawals
              AS withdrawals

            WHERE
              withdrawals.virtual_account_session_id =
                ?

              AND withdrawals.status =
                  'COMPLETADA'
          ),
          0
        ) AS withdrawal_transfers_cents,

        COALESCE(
          (
            SELECT
              SUM(
                withdrawals.withdrawal_amount_cents
              )

            FROM cash_withdrawals
              AS withdrawals

            WHERE
              withdrawals.virtual_account_session_id =
                ?

              AND withdrawals.cash_source =
                  'VIRTUAL_ACCOUNT'

              AND withdrawals.status =
                  'COMPLETADA'
          ),
          0
        ) AS virtual_cash_withdrawals_cents
    `)
      .bind(
        virtualSession
          .opening_balance_cents,

        virtualSession
          .opened_at,

        virtualSession.id,

        virtualSession.id,
      )
      .first<VirtualBalanceRow>();

  return (
    result ?? {
      opening_balance_cents:
        virtualSession
          .opening_balance_cents,

      digital_sales_cents:
        0,

      withdrawal_transfers_cents:
        0,

      virtual_cash_withdrawals_cents:
        0,
    }
  );
}

function calculatePhysicalAvailableCents(
  balance: PhysicalBalanceRow,
): number {
  return (
    Number(
      balance.opening_amount_cents,
    ) +
    Number(
      balance.cash_sales_cents,
    ) -
    Number(
      balance.withdrawals_cents,
    )
  );
}

function calculateVirtualAvailableCents(
  balance: VirtualBalanceRow,
): number {
  return (
    Number(
      balance.opening_balance_cents,
    ) +
    Number(
      balance.digital_sales_cents,
    ) +
    Number(
      balance.withdrawal_transfers_cents,
    ) -
    Number(
      balance.virtual_cash_withdrawals_cents,
    )
  );
}

function mapWithdrawal(
  withdrawal: CreatedWithdrawalRow,
) {
  return {
    id:
      withdrawal.id,

    operationNumber:
      withdrawal.operation_number,

    operatorUserId:
      withdrawal.operator_user_id,

    operatorName:
      withdrawal.operator_name,

    physicalRegisterSessionId:
      withdrawal
        .physical_register_session_id,

    registerName:
      withdrawal.register_name,

    virtualAccountSessionId:
      withdrawal
        .virtual_account_session_id,

    virtualAccountName:
      withdrawal
        .virtual_account_name,

    cashSource:
      withdrawal.cash_source,

    cashSourceLabel:
      withdrawal.cash_source ===
      "PHYSICAL_REGISTER"
        ? withdrawal.register_name ??
          "Caja física"
        : withdrawal
            .virtual_account_name,

    withdrawalAmount:
      centsToMoney(
        withdrawal
          .withdrawal_amount_cents,
      ),

    commissionRate:
      Number(
        withdrawal
          .commission_rate_basis_points,
      ) / 100,

    commissionAmount:
      centsToMoney(
        withdrawal
          .commission_amount_cents,
      ),

    transferTotal:
      centsToMoney(
        withdrawal
          .transfer_total_cents,
      ),

    transferReference:
      withdrawal
        .transfer_reference,

    notes:
      withdrawal.notes,

    status:
      withdrawal.status,

    createdAt:
      withdrawal.created_at,
  };
}

/*
 * GET /api/cash-withdrawals
 *
 * Devuelve:
 *
 * - la cajera conectada;
 * - la caja física asignada;
 * - la caja virtual abierta;
 * - los fondos disponibles;
 * - las extracciones recientes.
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

    if (!virtualSession) {
      return Response.json(
        {
          error:
            "No existe una caja virtual abierta.",
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
            "La caja física y la caja virtual tienen fechas comerciales diferentes.",
        },
        {
          status: 409,
        },
      );
    }

    const [
      physicalBalance,
      virtualBalance,
      recentResult,
    ] = await Promise.all([
      loadPhysicalBalance(
        env.DB,
        cashier.physicalSessionId,
      ),

      loadVirtualBalance(
        env.DB,
        virtualSession,
      ),

      env.DB.prepare(`
        SELECT
          withdrawals.id,
          withdrawals.operation_number,

          operator.display_name
            AS operator_name,

          registers.name
            AS register_name,

          virtual_accounts.name
            AS virtual_account_name,

          withdrawals.cash_source,
          withdrawals.withdrawal_amount_cents,
          withdrawals.commission_amount_cents,
          withdrawals.transfer_total_cents,
          withdrawals.transfer_reference,
          withdrawals.notes,
          withdrawals.status,
          withdrawals.created_at

        FROM cash_withdrawals
          AS withdrawals

        INNER JOIN app_users
          AS operator
          ON operator.id =
             withdrawals.operator_user_id

        LEFT JOIN physical_register_sessions
          AS physical_session
          ON physical_session.id =
             withdrawals
               .physical_register_session_id

        LEFT JOIN physical_registers
          AS registers
          ON registers.id =
             physical_session.register_id

        INNER JOIN virtual_account_sessions
          AS virtual_session
          ON virtual_session.id =
             withdrawals
               .virtual_account_session_id

        INNER JOIN virtual_accounts
          AS virtual_accounts
          ON virtual_accounts.id =
             virtual_session
               .virtual_account_id

        WHERE
          withdrawals.virtual_account_session_id =
            ?

        ORDER BY
          withdrawals.operation_number
            DESC

        LIMIT 20
      `)
        .bind(
          virtualSession.id,
        )
        .all<RecentWithdrawalRow>(),
    ]);

    if (!physicalBalance) {
      return Response.json(
        {
          error:
            "La caja física asignada ya no está disponible.",
        },
        {
          status: 409,
        },
      );
    }

    const physicalAvailableCents =
      calculatePhysicalAvailableCents(
        physicalBalance,
      );

    const virtualAvailableCents =
      calculateVirtualAvailableCents(
        virtualBalance,
      );

    return Response.json({
      commissionRate:
        3,

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

      physicalSource: {
        sessionId:
          cashier.physicalSessionId,

        registerId:
          cashier.registerId,

        registerCode:
          cashier.registerCode,

        registerName:
          cashier.registerName,

        openingAmount:
          centsToMoney(
            physicalBalance
              .opening_amount_cents,
          ),

        cashSales:
          centsToMoney(
            physicalBalance
              .cash_sales_cents,
          ),

        previousWithdrawals:
          centsToMoney(
            physicalBalance
              .withdrawals_cents,
          ),

        availableAmount:
          centsToMoney(
            physicalAvailableCents,
          ),
      },

      virtualSource: {
        sessionId:
          virtualSession.id,

        accountId:
          virtualSession
            .virtual_account_id,

        accountCode:
          virtualSession
            .virtual_account_code,

        accountName:
          virtualSession
            .virtual_account_name,

        openingBalance:
          centsToMoney(
            virtualBalance
              .opening_balance_cents,
          ),

        digitalSales:
          centsToMoney(
            virtualBalance
              .digital_sales_cents,
          ),

        withdrawalTransfers:
          centsToMoney(
            virtualBalance
              .withdrawal_transfers_cents,
          ),

        previousCashWithdrawals:
          centsToMoney(
            virtualBalance
              .virtual_cash_withdrawals_cents,
          ),

        availableAmount:
          centsToMoney(
            virtualAvailableCents,
          ),
      },

      recentWithdrawals:
        recentResult.results.map(
          (withdrawal) => ({
            id:
              withdrawal.id,

            operationNumber:
              withdrawal
                .operation_number,

            operatorName:
              withdrawal
                .operator_name,

            registerName:
              withdrawal
                .register_name,

            virtualAccountName:
              withdrawal
                .virtual_account_name,

            cashSource:
              withdrawal
                .cash_source,

            withdrawalAmount:
              centsToMoney(
                withdrawal
                  .withdrawal_amount_cents,
              ),

            commissionAmount:
              centsToMoney(
                withdrawal
                  .commission_amount_cents,
              ),

            transferTotal:
              centsToMoney(
                withdrawal
                  .transfer_total_cents,
              ),

            transferReference:
              withdrawal
                .transfer_reference,

            notes:
              withdrawal.notes,

            status:
              withdrawal.status,

            createdAt:
              withdrawal
                .created_at,
          }),
        ),
    });
  } catch (error) {
    console.error(
      "Error al cargar extracciones:",
      error,
    );

    return Response.json(
      {
        error:
          "No se pudo cargar la información de las extracciones.",
      },
      {
        status: 500,
      },
    );
  }
}

/*
 * POST /api/cash-withdrawals
 *
 * Registra una extracción contra
 * transferencia.
 *
 * La comisión del 3% se calcula
 * exclusivamente en el servidor.
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
      (await request.json()) as CreateWithdrawalBody;

    const withdrawalAmount =
      Number(
        body.withdrawalAmount,
      );

    const cashSource =
      body.cashSource;

    const transferReference =
      normalizeText(
        body.transferReference,
      ) || null;

    const notes =
      normalizeText(
        body.notes,
      ) || null;

    if (
      !Number.isFinite(
        withdrawalAmount,
      ) ||
      withdrawalAmount <= 0
    ) {
      return Response.json(
        {
          error:
            "Ingresá un importe de retiro válido.",
        },
        {
          status: 400,
        },
      );
    }

    if (
      !isCashSource(
        cashSource,
      )
    ) {
      return Response.json(
        {
          error:
            "Seleccioná de dónde sale el efectivo.",
        },
        {
          status: 400,
        },
      );
    }

    const withdrawalAmountCents =
      moneyToCents(
        withdrawalAmount,
      );

    if (
      withdrawalAmountCents <= 0
    ) {
      return Response.json(
        {
          error:
            "El importe de retiro debe ser mayor que cero.",
        },
        {
          status: 400,
        },
      );
    }

    const commissionAmountCents =
      calculateCommissionCents(
        withdrawalAmountCents,
      );

    const transferTotalCents =
      withdrawalAmountCents +
      commissionAmountCents;

    const { env } =
      getCloudflareContext();

    const virtualSession =
      await loadOpenVirtualSession(
        env.DB,
      );

    if (!virtualSession) {
      return Response.json(
        {
          error:
            "No existe una caja virtual abierta.",
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
            "La caja física y la caja virtual tienen fechas comerciales diferentes.",
        },
        {
          status: 409,
        },
      );
    }

    const [
      physicalBalance,
      virtualBalance,
    ] = await Promise.all([
      loadPhysicalBalance(
        env.DB,
        cashier.physicalSessionId,
      ),

      loadVirtualBalance(
        env.DB,
        virtualSession,
      ),
    ]);

    if (!physicalBalance) {
      return Response.json(
        {
          error:
            "La caja física asignada ya no está disponible.",
        },
        {
          status: 409,
        },
      );
    }

    const physicalAvailableCents =
      calculatePhysicalAvailableCents(
        physicalBalance,
      );

    const virtualAvailableCents =
      calculateVirtualAvailableCents(
        virtualBalance,
      );

    if (
      cashSource ===
        "PHYSICAL_REGISTER" &&
      physicalAvailableCents <
        withdrawalAmountCents
    ) {
      return Response.json(
        {
          error:
            `No hay suficiente efectivo en ${cashier.registerName ?? "la caja física"}. Disponible: ${centsToMoney(
              physicalAvailableCents,
            )}.`,
        },
        {
          status: 409,
        },
      );
    }

    if (
      cashSource ===
        "VIRTUAL_ACCOUNT" &&
      virtualAvailableCents <
        withdrawalAmountCents
    ) {
      return Response.json(
        {
          error:
            `No hay suficiente dinero en ${virtualSession.virtual_account_name}. Disponible: ${centsToMoney(
              virtualAvailableCents,
            )}.`,
        },
        {
          status: 409,
        },
      );
    }

    const withdrawalId =
      crypto.randomUUID();

    const physicalSessionId =
      cashSource ===
      "PHYSICAL_REGISTER"
        ? cashier.physicalSessionId
        : null;

    await env.DB.batch([
      env.DB.prepare(`
        UPDATE cash_withdrawal_counter

        SET
          last_number =
            last_number + 1

        WHERE
          id = 1
      `),

      env.DB.prepare(`
        INSERT INTO cash_withdrawals (
          id,
          operation_number,
          operator_user_id,
          physical_register_session_id,
          virtual_account_session_id,
          cash_source,
          withdrawal_amount_cents,
          commission_rate_basis_points,
          commission_amount_cents,
          transfer_total_cents,
          transfer_reference,
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
          ?,
          ?,
          ?,
          ?,
          ?,
          ?,
          'COMPLETADA'

        FROM cash_withdrawal_counter

        WHERE
          id = 1
      `).bind(
        withdrawalId,

        cashier.userId,

        physicalSessionId,

        virtualSession.id,

        cashSource,

        withdrawalAmountCents,

        COMMISSION_RATE_BASIS_POINTS,

        commissionAmountCents,

        transferTotalCents,

        transferReference,

        notes,
      ),
    ]);

    const createdWithdrawal =
      await env.DB.prepare(`
        SELECT
          withdrawals.id,
          withdrawals.operation_number,
          withdrawals.operator_user_id,

          operator.display_name
            AS operator_name,

          withdrawals.physical_register_session_id,

          registers.name
            AS register_name,

          withdrawals.virtual_account_session_id,

          virtual_accounts.name
            AS virtual_account_name,

          withdrawals.cash_source,
          withdrawals.withdrawal_amount_cents,
          withdrawals.commission_rate_basis_points,
          withdrawals.commission_amount_cents,
          withdrawals.transfer_total_cents,
          withdrawals.transfer_reference,
          withdrawals.notes,
          withdrawals.status,
          withdrawals.created_at

        FROM cash_withdrawals
          AS withdrawals

        INNER JOIN app_users
          AS operator
          ON operator.id =
             withdrawals.operator_user_id

        LEFT JOIN physical_register_sessions
          AS physical_session
          ON physical_session.id =
             withdrawals
               .physical_register_session_id

        LEFT JOIN physical_registers
          AS registers
          ON registers.id =
             physical_session.register_id

        INNER JOIN virtual_account_sessions
          AS virtual_session
          ON virtual_session.id =
             withdrawals
               .virtual_account_session_id

        INNER JOIN virtual_accounts
          AS virtual_accounts
          ON virtual_accounts.id =
             virtual_session
               .virtual_account_id

        WHERE
          withdrawals.id = ?

        LIMIT 1
      `)
        .bind(
          withdrawalId,
        )
        .first<CreatedWithdrawalRow>();

    if (!createdWithdrawal) {
      return Response.json(
        {
          error:
            "La extracción fue guardada, pero no pudo recuperarse.",
        },
        {
          status: 500,
        },
      );
    }

    return Response.json(
      {
        message:
          "La extracción fue registrada correctamente.",

        withdrawal:
          mapWithdrawal(
            createdWithdrawal,
          ),

        summary: {
          withdrawalAmount:
            centsToMoney(
              withdrawalAmountCents,
            ),

          commissionRate:
            3,

          commissionAmount:
            centsToMoney(
              commissionAmountCents,
            ),

          transferTotal:
            centsToMoney(
              transferTotalCents,
            ),

          cashSource,

          cashSourceLabel:
            cashSource ===
            "PHYSICAL_REGISTER"
              ? cashier.registerName ??
                "Caja física"
              : virtualSession
                  .virtual_account_name,
        },
      },
      {
        status: 201,
      },
    );
  } catch (error) {
    console.error(
      "Error al registrar extracción:",
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
        "CASHIER_WITHOUT_CONFIRMED_REGISTER",
      )
    ) {
      return Response.json(
        {
          error:
            "La cajera no tiene una caja abierta y confirmada.",
        },
        {
          status: 409,
        },
      );
    }

    if (
      errorMessage.includes(
        "INVALID_OR_CLOSED_VIRTUAL_SESSION",
      )
    ) {
      return Response.json(
        {
          error:
            "La caja virtual fue cerrada o ya no está disponible.",
        },
        {
          status: 409,
        },
      );
    }

    if (
      errorMessage.includes(
        "INVALID_PHYSICAL_CASH_SOURCE",
      )
    ) {
      return Response.json(
        {
          error:
            "La caja física seleccionada ya no pertenece a la cajera.",
        },
        {
          status: 409,
        },
      );
    }

    if (
      errorMessage.includes(
        "REGISTER_BUSINESS_DATE_MISMATCH",
      )
    ) {
      return Response.json(
        {
          error:
            "La caja física y la caja virtual tienen fechas comerciales diferentes.",
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
          "No se pudo registrar la extracción.",
      },
      {
        status: 500,
      },
    );
  }
}