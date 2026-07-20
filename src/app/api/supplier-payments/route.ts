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

type FundSource =
  | "PHYSICAL_REGISTER"
  | "VIRTUAL_ACCOUNT";

type CreateSupplierPaymentBody = {
  supplierName?: string;
  amount?: number;
  fundSource?: FundSource;
  reference?: string;
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
  supplier_payments_cents: number;
};

type VirtualBalanceRow = {
  opening_balance_cents: number;
  digital_sales_cents: number;
  withdrawal_transfers_cents: number;
  virtual_cash_withdrawals_cents: number;
  supplier_payments_cents: number;
};

type SupplierPaymentRow = {
  id: string;
  payment_number: number;

  operator_user_id: string;
  operator_name: string;

  operator_physical_session_id: string;

  register_name:
    | string
    | null;

  virtual_account_session_id:
    | string
    | null;

  virtual_account_name:
    | string
    | null;

  fund_source: FundSource;

  supplier_name: string;
  amount_cents: number;

  reference:
    | string
    | null;

  notes:
    | string
    | null;

  status: string;
  created_at: string;
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

function isFundSource(
  value: unknown,
): value is FundSource {
  return (
    value ===
      "PHYSICAL_REGISTER" ||
    value ===
      "VIRTUAL_ACCOUNT"
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
      ) AS withdrawals_cents,

      COALESCE(
        (
          SELECT
            SUM(
              supplier_payments.amount_cents
            )

          FROM supplier_payments

          WHERE
            supplier_payments.operator_physical_session_id =
              physical_session.id

            AND supplier_payments.fund_source =
                'PHYSICAL_REGISTER'

            AND supplier_payments.status =
                'COMPLETADA'
        ),
        0
      ) AS supplier_payments_cents

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
        ) AS virtual_cash_withdrawals_cents,

        COALESCE(
          (
            SELECT
              SUM(
                supplier_payments.amount_cents
              )

            FROM supplier_payments

            WHERE
              supplier_payments.virtual_account_session_id =
                ?

              AND supplier_payments.fund_source =
                  'VIRTUAL_ACCOUNT'

              AND supplier_payments.status =
                  'COMPLETADA'
          ),
          0
        ) AS supplier_payments_cents
    `)
      .bind(
        virtualSession
          .opening_balance_cents,

        virtualSession
          .opened_at,

        virtualSession.id,

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

      supplier_payments_cents:
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
    ) -
    Number(
      balance.supplier_payments_cents,
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
    ) -
    Number(
      balance.supplier_payments_cents,
    )
  );
}

function mapSupplierPayment(
  payment: SupplierPaymentRow,
) {
  return {
    id:
      payment.id,

    paymentNumber:
      payment.payment_number,

    operatorUserId:
      payment.operator_user_id,

    operatorName:
      payment.operator_name,

    physicalSessionId:
      payment
        .operator_physical_session_id,

    registerName:
      payment.register_name,

    virtualSessionId:
      payment
        .virtual_account_session_id,

    virtualAccountName:
      payment
        .virtual_account_name,

    fundSource:
      payment.fund_source,

    fundSourceLabel:
      payment.fund_source ===
      "PHYSICAL_REGISTER"
        ? payment.register_name ??
          "Caja física"
        : payment.virtual_account_name ??
          "Caja virtual",

    supplierName:
      payment.supplier_name,

    amount:
      centsToMoney(
        payment.amount_cents,
      ),

    reference:
      payment.reference,

    notes:
      payment.notes,

    status:
      payment.status,

    createdAt:
      payment.created_at,
  };
}

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

    const physicalBalance =
      await loadPhysicalBalance(
        env.DB,
        cashier.physicalSessionId,
      );

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

    let virtualBalance:
      | VirtualBalanceRow
      | null =
      null;

    if (
      virtualSession &&
      virtualSession.business_date ===
        cashier.businessDate
    ) {
      virtualBalance =
        await loadVirtualBalance(
          env.DB,
          virtualSession,
        );
    }

    const recentResult =
      await env.DB.prepare(`
        SELECT
          supplier_payments.id,
          supplier_payments.payment_number,
          supplier_payments.operator_user_id,

          operator.display_name
            AS operator_name,

          supplier_payments.operator_physical_session_id,

          registers.name
            AS register_name,

          supplier_payments.virtual_account_session_id,

          virtual_accounts.name
            AS virtual_account_name,

          supplier_payments.fund_source,
          supplier_payments.supplier_name,
          supplier_payments.amount_cents,
          supplier_payments.reference,
          supplier_payments.notes,
          supplier_payments.status,
          supplier_payments.created_at

        FROM supplier_payments

        INNER JOIN app_users
          AS operator
          ON operator.id =
             supplier_payments.operator_user_id

        INNER JOIN physical_register_sessions
          AS physical_session
          ON physical_session.id =
             supplier_payments
               .operator_physical_session_id

        INNER JOIN physical_registers
          AS registers
          ON registers.id =
             physical_session.register_id

        LEFT JOIN virtual_account_sessions
          AS virtual_session
          ON virtual_session.id =
             supplier_payments
               .virtual_account_session_id

        LEFT JOIN virtual_accounts
          AS virtual_accounts
          ON virtual_accounts.id =
             virtual_session.virtual_account_id

        WHERE
          supplier_payments.operator_physical_session_id =
            ?

          OR supplier_payments.virtual_account_session_id =
            ?

        ORDER BY
          supplier_payments.payment_number
            DESC

        LIMIT 20
      `)
        .bind(
          cashier.physicalSessionId,
          virtualSession?.id ?? "",
        )
        .all<SupplierPaymentRow>();

    const physicalAvailableCents =
      calculatePhysicalAvailableCents(
        physicalBalance,
      );

    const virtualAvailableCents =
      virtualBalance
        ? calculateVirtualAvailableCents(
            virtualBalance,
          )
        : null;

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

        previousSupplierPayments:
          centsToMoney(
            physicalBalance
              .supplier_payments_cents,
          ),

        availableAmount:
          centsToMoney(
            physicalAvailableCents,
          ),
      },

      virtualSource:
        virtualSession &&
        virtualBalance &&
        virtualAvailableCents !==
          null
          ? {
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

              previousSupplierPayments:
                centsToMoney(
                  virtualBalance
                    .supplier_payments_cents,
                ),

              availableAmount:
                centsToMoney(
                  virtualAvailableCents,
                ),
            }
          : null,

      recentPayments:
        recentResult.results.map(
          mapSupplierPayment,
        ),
    });
  } catch (error) {
    console.error(
      "Error al cargar pagos de proveedores:",
      error,
    );

    return Response.json(
      {
        error:
          "No se pudo cargar la información de los pagos de proveedores.",
      },
      {
        status: 500,
      },
    );
  }
}

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
      (await request.json()) as
        CreateSupplierPaymentBody;

    const supplierName =
      normalizeText(
        body.supplierName,
      );

    const amount =
      Number(
        body.amount,
      );

    const fundSource =
      body.fundSource;

    const reference =
      normalizeText(
        body.reference,
      ) || null;

    const notes =
      normalizeText(
        body.notes,
      ) || null;

    if (!supplierName) {
      return Response.json(
        {
          error:
            "Ingresá el nombre del proveedor.",
        },
        {
          status: 400,
        },
      );
    }

    if (
      supplierName.length >
      120
    ) {
      return Response.json(
        {
          error:
            "El nombre del proveedor es demasiado largo.",
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

    if (
      !isFundSource(
        fundSource,
      )
    ) {
      return Response.json(
        {
          error:
            "Seleccioná de qué caja sale el pago.",
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

    const { env } =
      getCloudflareContext();

    const virtualSession =
      await loadOpenVirtualSession(
        env.DB,
      );

    if (
      fundSource ===
        "VIRTUAL_ACCOUNT" &&
      !virtualSession
    ) {
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
      fundSource ===
        "VIRTUAL_ACCOUNT" &&
      virtualSession &&
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

    const physicalBalance =
      await loadPhysicalBalance(
        env.DB,
        cashier.physicalSessionId,
      );

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

    if (
      fundSource ===
        "PHYSICAL_REGISTER" &&
      physicalAvailableCents <
        amountCents
    ) {
      return Response.json(
        {
          error:
            `No hay suficiente dinero en ${cashier.registerName ?? "la caja física"}. Disponible: $${centsToMoney(
              physicalAvailableCents,
            )}.`,
        },
        {
          status: 409,
        },
      );
    }

    let virtualAvailableCents:
      | number
      | null =
      null;

    if (
      fundSource ===
        "VIRTUAL_ACCOUNT" &&
      virtualSession
    ) {
      const virtualBalance =
        await loadVirtualBalance(
          env.DB,
          virtualSession,
        );

      virtualAvailableCents =
        calculateVirtualAvailableCents(
          virtualBalance,
        );

      if (
        virtualAvailableCents <
        amountCents
      ) {
        return Response.json(
          {
            error:
              `No hay suficiente dinero en ${virtualSession.virtual_account_name}. Disponible: $${centsToMoney(
                virtualAvailableCents,
              )}.`,
          },
          {
            status: 409,
          },
        );
      }
    }

    const paymentId =
      crypto.randomUUID();

    const virtualSessionId =
      fundSource ===
        "VIRTUAL_ACCOUNT"
        ? virtualSession?.id ??
          null
        : null;

    await env.DB.batch([
      env.DB.prepare(`
        UPDATE supplier_payment_counter

        SET
          last_number =
            last_number + 1

        WHERE
          id = 1
      `),

      env.DB.prepare(`
        INSERT INTO supplier_payments (
          id,
          payment_number,
          operator_user_id,
          operator_physical_session_id,
          virtual_account_session_id,
          fund_source,
          supplier_name,
          amount_cents,
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
          ?,
          ?,
          ?,
          ?,
          'COMPLETADA'

        FROM supplier_payment_counter

        WHERE
          id = 1
      `).bind(
        paymentId,

        cashier.userId,

        cashier.physicalSessionId,

        virtualSessionId,

        fundSource,

        supplierName,

        amountCents,

        reference,

        notes,
      ),
    ]);

    const createdPayment =
      await env.DB.prepare(`
        SELECT
          supplier_payments.id,
          supplier_payments.payment_number,
          supplier_payments.operator_user_id,

          operator.display_name
            AS operator_name,

          supplier_payments.operator_physical_session_id,

          registers.name
            AS register_name,

          supplier_payments.virtual_account_session_id,

          virtual_accounts.name
            AS virtual_account_name,

          supplier_payments.fund_source,
          supplier_payments.supplier_name,
          supplier_payments.amount_cents,
          supplier_payments.reference,
          supplier_payments.notes,
          supplier_payments.status,
          supplier_payments.created_at

        FROM supplier_payments

        INNER JOIN app_users
          AS operator
          ON operator.id =
             supplier_payments.operator_user_id

        INNER JOIN physical_register_sessions
          AS physical_session
          ON physical_session.id =
             supplier_payments
               .operator_physical_session_id

        INNER JOIN physical_registers
          AS registers
          ON registers.id =
             physical_session.register_id

        LEFT JOIN virtual_account_sessions
          AS virtual_session
          ON virtual_session.id =
             supplier_payments
               .virtual_account_session_id

        LEFT JOIN virtual_accounts
          AS virtual_accounts
          ON virtual_accounts.id =
             virtual_session.virtual_account_id

        WHERE
          supplier_payments.id = ?

        LIMIT 1
      `)
        .bind(
          paymentId,
        )
        .first<SupplierPaymentRow>();

    if (!createdPayment) {
      return Response.json(
        {
          error:
            "El pago fue guardado, pero no pudo recuperarse.",
        },
        {
          status: 500,
        },
      );
    }

    return Response.json(
      {
        message:
          "El pago al proveedor fue registrado correctamente.",

        payment:
          mapSupplierPayment(
            createdPayment,
          ),

        summary: {
          supplierName,

          amount:
            centsToMoney(
              amountCents,
            ),

          fundSource,

          fundSourceLabel:
            fundSource ===
            "PHYSICAL_REGISTER"
              ? cashier.registerName ??
                "Caja física"
              : virtualSession
                  ?.virtual_account_name ??
                "Caja virtual",
        },
      },
      {
        status: 201,
      },
    );
  } catch (error) {
    console.error(
      "Error al registrar pago de proveedor:",
      error,
    );

    const errorMessage =
      error instanceof Error
        ? error.message
        : "";

    if (
      errorMessage.includes(
        "UNIQUE constraint failed",
      )
    ) {
      return Response.json(
        {
          error:
            "No se pudo generar el número del pago. Volvé a intentarlo.",
        },
        {
          status: 409,
        },
      );
    }

    return Response.json(
      {
        error:
          "No se pudo registrar el pago al proveedor.",
      },
      {
        status: 500,
      },
    );
  }
}