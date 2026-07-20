import { type NextRequest } from "next/server";

import { getCloudflareContext } from "@opennextjs/cloudflare";

import { getAuthenticatedAdmin } from "@/lib/admin-session";

export const dynamic = "force-dynamic";

type PhysicalClosingInput = {
  sessionId?: string;
  countedAmount?: number;
  notes?: string;
};

type VirtualClosingInput = {
  sessionId?: string;
  countedBalance?: number;
  notes?: string;
};

type ClosingBody = {
  physicalClosings?: PhysicalClosingInput[];
  virtualClosing?: VirtualClosingInput | null;
};

type PhysicalClosingRow = {
  id: string;
  register_id: string;
  register_code: string;
  register_name: string;
  responsible_user_id: string;
  responsible_username: string;
  responsible_name: string;
  business_date: string;
  opening_amount_cents: number;
  cashier_confirmation_status: string;
  cashier_confirmed_amount_cents: number | null;
  opened_at: string;
  opened_by_name: string;
  cash_sales_cents: number;
  transfer_sales_cents: number;
  card_sales_cents: number;
  total_sales_cents: number;
  quiniela_cents: number;
  physical_withdrawals_cents: number;
  withdrawal_commissions_cents: number;
};

type VirtualClosingRow = {
  id: string;
  virtual_account_id: string;
  virtual_account_code: string;
  virtual_account_name: string;
  business_date: string;
  opening_balance_cents: number;
  opened_at: string;
  opened_by_name: string;
  services_cents: number;
  transfer_sales_cents: number;
  card_sales_cents: number;
  digital_sales_cents: number;
  withdrawal_transfers_cents: number;
  virtual_cash_withdrawals_cents: number;
  physical_cash_withdrawals_cents: number;
  withdrawal_commissions_cents: number;
};

type PreparedPhysicalClosing = {
  sessionId: string;
  responsibleUserId: string;
  registerName: string;
  responsibleName: string;
  openingAmountCents: number;
  cashSalesCents: number;
  quinielaCents: number;
  withdrawalsCents: number;
  expectedAmountCents: number;
  countedAmountCents: number;
  differenceCents: number;
  notes: string | null;
};

type PreparedVirtualClosing = {
  sessionId: string;
  accountName: string;
  openingBalanceCents: number;
  servicesCents: number;
  virtualCashWithdrawalsCents: number;
  digitalSalesCents: number;
  withdrawalTransfersCents: number;
  commissionCents: number;
  expectedBalanceCents: number;
  countedBalanceCents: number;
  differenceCents: number;
  notes: string | null;
};

function normalizeText(value: string | null | undefined): string {
  return value?.trim() ?? "";
}

function moneyToCents(value: number): number {
  return Math.round(value * 100);
}

function centsToMoney(value: number): number {
  return Number(value || 0) / 100;
}

/*
 * CAJAS FÍSICAS
 *
 * Efectivo esperado:
 *
 * inicial
 * + ventas de Negocio cobradas en efectivo
 * + Quiniela
 * - extracciones pagadas desde esa caja
 */
async function loadOpenPhysicalSessions(
  db: D1Database,
): Promise<PhysicalClosingRow[]> {
  const result = await db.prepare(`
    SELECT
      sessions.id,
      sessions.register_id,
      registers.code AS register_code,
      registers.name AS register_name,
      sessions.responsible_user_id,
      responsible.username AS responsible_username,
      responsible.display_name AS responsible_name,
      sessions.business_date,
      sessions.opening_amount_cents,
      sessions.cashier_confirmation_status,
      sessions.cashier_confirmed_amount_cents,
      sessions.opened_at,
      opened_by.display_name AS opened_by_name,

      COALESCE(
        (
          SELECT SUM(payments.amount_cents)
          FROM sales
          INNER JOIN sale_payments AS payments
            ON payments.sale_id = sales.id
          WHERE sales.physical_register_session_id = sessions.id
            AND sales.status = 'COMPLETADA'
            AND payments.method = 'EFECTIVO'
        ),
        0
      ) AS cash_sales_cents,

      COALESCE(
        (
          SELECT SUM(payments.amount_cents)
          FROM sales
          INNER JOIN sale_payments AS payments
            ON payments.sale_id = sales.id
          WHERE sales.physical_register_session_id = sessions.id
            AND sales.status = 'COMPLETADA'
            AND payments.method = 'TRANSFERENCIA'
        ),
        0
      ) AS transfer_sales_cents,

      COALESCE(
        (
          SELECT SUM(payments.amount_cents)
          FROM sales
          INNER JOIN sale_payments AS payments
            ON payments.sale_id = sales.id
          WHERE sales.physical_register_session_id = sessions.id
            AND sales.status = 'COMPLETADA'
            AND payments.method = 'TARJETA'
        ),
        0
      ) AS card_sales_cents,

      COALESCE(
        (
          SELECT SUM(payments.amount_cents)
          FROM sales
          INNER JOIN sale_payments AS payments
            ON payments.sale_id = sales.id
          WHERE sales.physical_register_session_id = sessions.id
            AND sales.status = 'COMPLETADA'
        ),
        0
      ) AS total_sales_cents,

      COALESCE(
        (
          SELECT SUM(operations.amount_cents)
          FROM cash_box_operations AS operations
          WHERE operations.operator_physical_session_id = sessions.id
            AND operations.operation_type = 'QUINIELA'
            AND operations.status = 'COMPLETADA'
        ),
        0
      ) AS quiniela_cents,

      COALESCE(
        (
          SELECT SUM(withdrawals.withdrawal_amount_cents)
          FROM cash_withdrawals AS withdrawals
          WHERE withdrawals.physical_register_session_id = sessions.id
            AND withdrawals.cash_source = 'PHYSICAL_REGISTER'
            AND withdrawals.status = 'COMPLETADA'
        ),
        0
      ) AS physical_withdrawals_cents,

      COALESCE(
        (
          SELECT SUM(withdrawals.commission_amount_cents)
          FROM cash_withdrawals AS withdrawals
          WHERE withdrawals.physical_register_session_id = sessions.id
            AND withdrawals.cash_source = 'PHYSICAL_REGISTER'
            AND withdrawals.status = 'COMPLETADA'
        ),
        0
      ) AS withdrawal_commissions_cents

    FROM physical_register_sessions AS sessions

    INNER JOIN physical_registers AS registers
      ON registers.id = sessions.register_id

    INNER JOIN app_users AS responsible
      ON responsible.id = sessions.responsible_user_id

    INNER JOIN app_users AS opened_by
      ON opened_by.id = sessions.opened_by_user_id

    WHERE sessions.status = 'ABIERTA'

    ORDER BY registers.code ASC
  `).all<PhysicalClosingRow>();

  return result.results;
}

/*
 * CAJA VIRTUAL FÍSICA
 *
 * Esta caja contiene billetes de Servicios y Boletas.
 * No representa el dinero bancario o digital.
 *
 * Efectivo esperado:
 *
 * inicial
 * + Servicios y Boletas cobrados
 * - extracciones pagadas desde Caja Virtual
 *
 * Las ventas por transferencia, tarjeta y las transferencias
 * de extracciones se informan por separado como movimientos digitales.
 */
async function loadOpenVirtualSession(
  db: D1Database,
): Promise<VirtualClosingRow | null> {
  return db.prepare(`
    SELECT
      sessions.id,
      sessions.virtual_account_id,
      accounts.code AS virtual_account_code,
      accounts.name AS virtual_account_name,
      sessions.business_date,
      sessions.opening_balance_cents,
      sessions.opened_at,
      opened_by.display_name AS opened_by_name,

      COALESCE(
        (
          SELECT SUM(operations.amount_cents)
          FROM cash_box_operations AS operations
          WHERE operations.virtual_account_session_id = sessions.id
            AND operations.operation_type = 'SERVICIO'
            AND operations.status = 'COMPLETADA'
        ),
        0
      ) AS services_cents,

      COALESCE(
        (
          SELECT SUM(payments.amount_cents)
          FROM sales
          INNER JOIN sale_payments AS payments
            ON payments.sale_id = sales.id
          INNER JOIN physical_register_sessions AS physical_session
            ON physical_session.id = sales.physical_register_session_id
          WHERE sales.status = 'COMPLETADA'
            AND physical_session.business_date = sessions.business_date
            AND payments.method = 'TRANSFERENCIA'
        ),
        0
      ) AS transfer_sales_cents,

      COALESCE(
        (
          SELECT SUM(payments.amount_cents)
          FROM sales
          INNER JOIN sale_payments AS payments
            ON payments.sale_id = sales.id
          INNER JOIN physical_register_sessions AS physical_session
            ON physical_session.id = sales.physical_register_session_id
          WHERE sales.status = 'COMPLETADA'
            AND physical_session.business_date = sessions.business_date
            AND payments.method = 'TARJETA'
        ),
        0
      ) AS card_sales_cents,

      COALESCE(
        (
          SELECT SUM(payments.amount_cents)
          FROM sales
          INNER JOIN sale_payments AS payments
            ON payments.sale_id = sales.id
          INNER JOIN physical_register_sessions AS physical_session
            ON physical_session.id = sales.physical_register_session_id
          WHERE sales.status = 'COMPLETADA'
            AND physical_session.business_date = sessions.business_date
            AND payments.method IN ('TRANSFERENCIA', 'TARJETA')
        ),
        0
      ) AS digital_sales_cents,

      COALESCE(
        (
          SELECT SUM(withdrawals.transfer_total_cents)
          FROM cash_withdrawals AS withdrawals
          WHERE withdrawals.virtual_account_session_id = sessions.id
            AND withdrawals.status = 'COMPLETADA'
        ),
        0
      ) AS withdrawal_transfers_cents,

      COALESCE(
        (
          SELECT SUM(withdrawals.withdrawal_amount_cents)
          FROM cash_withdrawals AS withdrawals
          WHERE withdrawals.virtual_account_session_id = sessions.id
            AND withdrawals.cash_source = 'VIRTUAL_ACCOUNT'
            AND withdrawals.status = 'COMPLETADA'
        ),
        0
      ) AS virtual_cash_withdrawals_cents,

      COALESCE(
        (
          SELECT SUM(withdrawals.withdrawal_amount_cents)
          FROM cash_withdrawals AS withdrawals
          WHERE withdrawals.virtual_account_session_id = sessions.id
            AND withdrawals.cash_source = 'PHYSICAL_REGISTER'
            AND withdrawals.status = 'COMPLETADA'
        ),
        0
      ) AS physical_cash_withdrawals_cents,

      COALESCE(
        (
          SELECT SUM(withdrawals.commission_amount_cents)
          FROM cash_withdrawals AS withdrawals
          WHERE withdrawals.virtual_account_session_id = sessions.id
            AND withdrawals.status = 'COMPLETADA'
        ),
        0
      ) AS withdrawal_commissions_cents

    FROM virtual_account_sessions AS sessions

    INNER JOIN virtual_accounts AS accounts
      ON accounts.id = sessions.virtual_account_id

    INNER JOIN app_users AS opened_by
      ON opened_by.id = sessions.opened_by_user_id

    WHERE sessions.status = 'ABIERTA'

    LIMIT 1
  `).first<VirtualClosingRow>();
}

function getPhysicalExpectedCents(session: PhysicalClosingRow): number {
  return (
    Number(session.opening_amount_cents) +
    Number(session.cash_sales_cents) +
    Number(session.quiniela_cents) -
    Number(session.physical_withdrawals_cents)
  );
}

function getVirtualExpectedCents(session: VirtualClosingRow): number {
  return (
    Number(session.opening_balance_cents) +
    Number(session.services_cents) -
    Number(session.virtual_cash_withdrawals_cents)
  );
}

function mapPhysicalSession(session: PhysicalClosingRow) {
  return {
    id: session.id,
    registerId: session.register_id,
    registerCode: session.register_code,
    registerName: session.register_name,
    responsibleUserId: session.responsible_user_id,
    responsibleUsername: session.responsible_username,
    responsibleName: session.responsible_name,
    businessDate: session.business_date,
    openedAt: session.opened_at,
    openedByName: session.opened_by_name,
    confirmationStatus: session.cashier_confirmation_status,
    openingAmount: centsToMoney(session.opening_amount_cents),
    cashierConfirmedAmount:
      session.cashier_confirmed_amount_cents === null
        ? null
        : centsToMoney(session.cashier_confirmed_amount_cents),
    cashSales: centsToMoney(session.cash_sales_cents),
    transferSales: centsToMoney(session.transfer_sales_cents),
    cardSales: centsToMoney(session.card_sales_cents),
    totalSales: centsToMoney(session.total_sales_cents),
    quiniela: centsToMoney(session.quiniela_cents),
    withdrawalsFromPhysical: centsToMoney(
      session.physical_withdrawals_cents,
    ),
    withdrawalCommissions: centsToMoney(
      session.withdrawal_commissions_cents,
    ),
    expectedClosingAmount: centsToMoney(getPhysicalExpectedCents(session)),
  };
}

function mapVirtualSession(session: VirtualClosingRow) {
  return {
    id: session.id,
    virtualAccountId: session.virtual_account_id,
    virtualAccountCode: session.virtual_account_code,
    virtualAccountName: session.virtual_account_name,
    businessDate: session.business_date,
    openedAt: session.opened_at,
    openedByName: session.opened_by_name,
    openingBalance: centsToMoney(session.opening_balance_cents),
    services: centsToMoney(session.services_cents),
    transferSales: centsToMoney(session.transfer_sales_cents),
    cardSales: centsToMoney(session.card_sales_cents),
    digitalSales: centsToMoney(session.digital_sales_cents),
    withdrawalTransfers: centsToMoney(session.withdrawal_transfers_cents),
    withdrawalsFromVirtual: centsToMoney(
      session.virtual_cash_withdrawals_cents,
    ),
    withdrawalsFromPhysical: centsToMoney(
      session.physical_cash_withdrawals_cents,
    ),
    withdrawalCommissions: centsToMoney(
      session.withdrawal_commissions_cents,
    ),
    expectedClosingBalance: centsToMoney(getVirtualExpectedCents(session)),
  };
}

function createWithdrawalSummary(
  physicalSessions: PhysicalClosingRow[],
  virtualSession: VirtualClosingRow | null,
) {
  const fromPhysicalCents = physicalSessions.reduce(
    (total, session) => total + Number(session.physical_withdrawals_cents),
    0,
  );

  const fromVirtualCents = Number(
    virtualSession?.virtual_cash_withdrawals_cents ?? 0,
  );

  const totalTransferredCents = Number(
    virtualSession?.withdrawal_transfers_cents ?? 0,
  );

  const totalCommissionCents = Number(
    virtualSession?.withdrawal_commissions_cents ?? 0,
  );

  return {
    fromPhysicalRegisters: centsToMoney(fromPhysicalCents),
    fromVirtualAccount: centsToMoney(fromVirtualCents),
    totalWithdrawalAmount: centsToMoney(fromPhysicalCents + fromVirtualCents),
    totalTransferred: centsToMoney(totalTransferredCents),
    totalCommission: centsToMoney(totalCommissionCents),
  };
}

function createCashOperationSummary(
  physicalSessions: PhysicalClosingRow[],
  virtualSession: VirtualClosingRow | null,
) {
  const quinielaCents = physicalSessions.reduce(
    (total, session) => total + Number(session.quiniela_cents),
    0,
  );

  const servicesCents = Number(virtualSession?.services_cents ?? 0);

  return {
    services: centsToMoney(servicesCents),
    quiniela: centsToMoney(quinielaCents),
    total: centsToMoney(servicesCents + quinielaCents),
  };
}

function createDigitalSummary(virtualSession: VirtualClosingRow | null) {
  const transferSalesCents = Number(
    virtualSession?.transfer_sales_cents ?? 0,
  );
  const cardSalesCents = Number(virtualSession?.card_sales_cents ?? 0);
  const withdrawalTransfersCents = Number(
    virtualSession?.withdrawal_transfers_cents ?? 0,
  );
  const commissionCents = Number(
    virtualSession?.withdrawal_commissions_cents ?? 0,
  );

  return {
    transferSales: centsToMoney(transferSalesCents),
    cardSales: centsToMoney(cardSalesCents),
    businessDigitalSales: centsToMoney(
      transferSalesCents + cardSalesCents,
    ),
    withdrawalTransfers: centsToMoney(withdrawalTransfersCents),
    totalDigitalReceived: centsToMoney(
      transferSalesCents + cardSalesCents + withdrawalTransfersCents,
    ),
    withdrawalCommissions: centsToMoney(commissionCents),
  };
}

function getBusinessDates(
  physicalSessions: PhysicalClosingRow[],
  virtualSession: VirtualClosingRow | null,
): Set<string> {
  return new Set(
    [
      ...physicalSessions.map((session) => session.business_date),
      virtualSession?.business_date,
    ].filter((value): value is string => Boolean(value)),
  );
}

/*
 * GET /api/registers/closing
 *
 * Devuelve el cálculo actualizado del cierre sin modificar la base.
 */
export async function GET(request: NextRequest) {
  try {
    const admin = await getAuthenticatedAdmin(request);

    if (!admin) {
      return Response.json(
        { error: "Acceso administrativo requerido." },
        { status: 401 },
      );
    }

    const { env } = getCloudflareContext();

    const [physicalSessions, virtualSession] = await Promise.all([
      loadOpenPhysicalSessions(env.DB),
      loadOpenVirtualSession(env.DB),
    ]);

    const businessDates = getBusinessDates(physicalSessions, virtualSession);

    return Response.json({
      admin: {
        id: admin.userId,
        username: admin.username,
        displayName: admin.displayName,
        role: admin.role,
      },
      hasOpenDay: physicalSessions.length > 0 || virtualSession !== null,
      businessDate:
        businessDates.size === 1 ? Array.from(businessDates)[0] : null,
      hasDateMismatch: businessDates.size > 1,
      physicalSessions: physicalSessions.map(mapPhysicalSession),
      virtualSession: virtualSession ? mapVirtualSession(virtualSession) : null,
      cashOperationSummary: createCashOperationSummary(
        physicalSessions,
        virtualSession,
      ),
      withdrawalSummary: createWithdrawalSummary(
        physicalSessions,
        virtualSession,
      ),
      digitalSummary: createDigitalSummary(virtualSession),
    });
  } catch (error) {
    console.error("Error al cargar cierre de cajas:", error);

    return Response.json(
      { error: "No se pudo cargar la información del cierre." },
      { status: 500 },
    );
  }
}

/*
 * POST /api/registers/closing
 *
 * Recalcula todos los importes en el servidor y cierra la jornada.
 */
export async function POST(request: NextRequest) {
  try {
    const admin = await getAuthenticatedAdmin(request);

    if (!admin) {
      return Response.json(
        { error: "Acceso administrativo requerido." },
        { status: 401 },
      );
    }

    const body = (await request.json()) as ClosingBody;
    const submittedPhysicalClosings = body.physicalClosings;
    const submittedVirtualClosing = body.virtualClosing;

    const { env } = getCloudflareContext();

    const [openPhysicalSessions, openVirtualSession] = await Promise.all([
      loadOpenPhysicalSessions(env.DB),
      loadOpenVirtualSession(env.DB),
    ]);

    if (openPhysicalSessions.length === 0 && !openVirtualSession) {
      return Response.json(
        { error: "No hay una jornada abierta para cerrar." },
        { status: 409 },
      );
    }

    const businessDates = getBusinessDates(
      openPhysicalSessions,
      openVirtualSession,
    );

    if (businessDates.size > 1) {
      return Response.json(
        {
          error:
            "Las cajas abiertas tienen fechas comerciales diferentes.",
        },
        { status: 409 },
      );
    }

    if (
      !Array.isArray(submittedPhysicalClosings) ||
      submittedPhysicalClosings.length !== openPhysicalSessions.length
    ) {
      return Response.json(
        {
          error:
            "Debés ingresar el conteo de todas las cajas físicas abiertas.",
        },
        { status: 400 },
      );
    }

    const submittedPhysicalIds = submittedPhysicalClosings.map((closing) =>
      normalizeText(closing.sessionId),
    );

    if (new Set(submittedPhysicalIds).size !== submittedPhysicalIds.length) {
      return Response.json(
        { error: "Una caja física fue enviada más de una vez." },
        { status: 400 },
      );
    }

    const currentPhysicalIds = new Set(
      openPhysicalSessions.map((session) => session.id),
    );

    if (
      !submittedPhysicalIds.every((sessionId) =>
        currentPhysicalIds.has(sessionId),
      )
    ) {
      return Response.json(
        {
          error:
            "La información de las cajas cambió. Actualizá la pantalla.",
        },
        { status: 409 },
      );
    }

    const submittedPhysicalById = new Map(
      submittedPhysicalClosings.map((closing) => [
        normalizeText(closing.sessionId),
        closing,
      ]),
    );

    const preparedPhysicalClosings: PreparedPhysicalClosing[] = [];

    for (const session of openPhysicalSessions) {
      const submitted = submittedPhysicalById.get(session.id);

      if (!submitted) {
        return Response.json(
          {
            error: `Falta ingresar el conteo de ${session.register_name}.`,
          },
          { status: 400 },
        );
      }

      const countedAmount = Number(submitted.countedAmount);

      if (!Number.isFinite(countedAmount) || countedAmount < 0) {
        return Response.json(
          {
            error: `El importe contado de ${session.register_name} no es válido.`,
          },
          { status: 400 },
        );
      }

      const openingAmountCents = Number(session.opening_amount_cents);
      const cashSalesCents = Number(session.cash_sales_cents);
      const quinielaCents = Number(session.quiniela_cents);
      const withdrawalsCents = Number(session.physical_withdrawals_cents);
      const expectedAmountCents = getPhysicalExpectedCents(session);
      const countedAmountCents = moneyToCents(countedAmount);

      preparedPhysicalClosings.push({
        sessionId: session.id,
        responsibleUserId: session.responsible_user_id,
        registerName: session.register_name,
        responsibleName: session.responsible_name,
        openingAmountCents,
        cashSalesCents,
        quinielaCents,
        withdrawalsCents,
        expectedAmountCents,
        countedAmountCents,
        differenceCents: countedAmountCents - expectedAmountCents,
        notes: normalizeText(submitted.notes) || null,
      });
    }

    let preparedVirtualClosing: PreparedVirtualClosing | null = null;

    if (openVirtualSession) {
      if (!submittedVirtualClosing) {
        return Response.json(
          {
            error:
              "Debés ingresar el efectivo contado de la Caja Virtual.",
          },
          { status: 400 },
        );
      }

      const submittedVirtualId = normalizeText(
        submittedVirtualClosing.sessionId,
      );

      if (submittedVirtualId !== openVirtualSession.id) {
        return Response.json(
          {
            error:
              "La información de la Caja Virtual cambió. Actualizá la pantalla.",
          },
          { status: 409 },
        );
      }

      const countedBalance = Number(submittedVirtualClosing.countedBalance);

      if (!Number.isFinite(countedBalance) || countedBalance < 0) {
        return Response.json(
          {
            error:
              "El efectivo contado de la Caja Virtual no es válido.",
          },
          { status: 400 },
        );
      }

      const openingBalanceCents = Number(
        openVirtualSession.opening_balance_cents,
      );
      const servicesCents = Number(openVirtualSession.services_cents);
      const virtualCashWithdrawalsCents = Number(
        openVirtualSession.virtual_cash_withdrawals_cents,
      );
      const digitalSalesCents = Number(openVirtualSession.digital_sales_cents);
      const withdrawalTransfersCents = Number(
        openVirtualSession.withdrawal_transfers_cents,
      );
      const commissionCents = Number(
        openVirtualSession.withdrawal_commissions_cents,
      );
      const expectedBalanceCents = getVirtualExpectedCents(
        openVirtualSession,
      );
      const countedBalanceCents = moneyToCents(countedBalance);

      preparedVirtualClosing = {
        sessionId: openVirtualSession.id,
        accountName: openVirtualSession.virtual_account_name,
        openingBalanceCents,
        servicesCents,
        virtualCashWithdrawalsCents,
        digitalSalesCents,
        withdrawalTransfersCents,
        commissionCents,
        expectedBalanceCents,
        countedBalanceCents,
        differenceCents: countedBalanceCents - expectedBalanceCents,
        notes: normalizeText(submittedVirtualClosing.notes) || null,
      };
    } else if (submittedVirtualClosing) {
      return Response.json(
        { error: "No existe una Caja Virtual abierta." },
        { status: 409 },
      );
    }

    const statements: D1PreparedStatement[] = [];

    for (const closing of preparedPhysicalClosings) {
      statements.push(
        env.DB.prepare(`
          UPDATE physical_register_sessions
          SET
            status = 'CERRADA',
            expected_closing_amount_cents = ?,
            counted_closing_amount_cents = ?,
            difference_cents = ?,
            closed_at = CURRENT_TIMESTAMP,
            closed_by_user_id = ?,
            closing_notes = ?,
            updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
            AND status = 'ABIERTA'
        `).bind(
          closing.expectedAmountCents,
          closing.countedAmountCents,
          closing.differenceCents,
          admin.userId,
          closing.notes,
          closing.sessionId,
        ),
      );
    }

    if (preparedVirtualClosing) {
      statements.push(
        env.DB.prepare(`
          UPDATE virtual_account_sessions
          SET
            status = 'CERRADA',
            expected_closing_balance_cents = ?,
            counted_closing_balance_cents = ?,
            difference_cents = ?,
            closed_at = CURRENT_TIMESTAMP,
            closed_by_user_id = ?,
            closing_notes = ?,
            updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
            AND status = 'ABIERTA'
        `).bind(
          preparedVirtualClosing.expectedBalanceCents,
          preparedVirtualClosing.countedBalanceCents,
          preparedVirtualClosing.differenceCents,
          admin.userId,
          preparedVirtualClosing.notes,
          preparedVirtualClosing.sessionId,
        ),
      );
    }

    /*
     * Al cerrar la jornada se invalidan las sesiones de las cajeras.
     * La sesión administrativa permanece activa.
     */
    statements.push(
      env.DB.prepare(`
        UPDATE app_user_sessions
        SET revoked_at = CURRENT_TIMESTAMP
        WHERE revoked_at IS NULL
          AND user_id IN (
            SELECT id
            FROM app_users
            WHERE role = 'CAJERO'
          )
      `),
    );

    await env.DB.batch(statements);

    return Response.json({
      message: "La jornada fue cerrada correctamente.",
      closedBy: {
        id: admin.userId,
        username: admin.username,
        displayName: admin.displayName,
      },
      businessDate:
        businessDates.size === 1 ? Array.from(businessDates)[0] : null,
      physicalClosings: preparedPhysicalClosings.map((closing) => ({
        sessionId: closing.sessionId,
        registerName: closing.registerName,
        responsibleName: closing.responsibleName,
        openingAmount: centsToMoney(closing.openingAmountCents),
        cashSales: centsToMoney(closing.cashSalesCents),
        quiniela: centsToMoney(closing.quinielaCents),
        withdrawals: centsToMoney(closing.withdrawalsCents),
        expectedAmount: centsToMoney(closing.expectedAmountCents),
        countedAmount: centsToMoney(closing.countedAmountCents),
        difference: centsToMoney(closing.differenceCents),
      })),
      virtualClosing: preparedVirtualClosing
        ? {
            sessionId: preparedVirtualClosing.sessionId,
            accountName: preparedVirtualClosing.accountName,
            openingBalance: centsToMoney(
              preparedVirtualClosing.openingBalanceCents,
            ),
            services: centsToMoney(preparedVirtualClosing.servicesCents),
            withdrawalsFromVirtual: centsToMoney(
              preparedVirtualClosing.virtualCashWithdrawalsCents,
            ),
            digitalSales: centsToMoney(
              preparedVirtualClosing.digitalSalesCents,
            ),
            withdrawalTransfers: centsToMoney(
              preparedVirtualClosing.withdrawalTransfersCents,
            ),
            commission: centsToMoney(preparedVirtualClosing.commissionCents),
            expectedBalance: centsToMoney(
              preparedVirtualClosing.expectedBalanceCents,
            ),
            countedBalance: centsToMoney(
              preparedVirtualClosing.countedBalanceCents,
            ),
            difference: centsToMoney(preparedVirtualClosing.differenceCents),
          }
        : null,
      cashOperationSummary: createCashOperationSummary(
        openPhysicalSessions,
        openVirtualSession,
      ),
      withdrawalSummary: createWithdrawalSummary(
        openPhysicalSessions,
        openVirtualSession,
      ),
      digitalSummary: createDigitalSummary(openVirtualSession),
    });
  } catch (error) {
    console.error("Error al cerrar jornada:", error);

    return Response.json(
      { error: "No se pudo cerrar la jornada." },
      { status: 500 },
    );
  }
}
