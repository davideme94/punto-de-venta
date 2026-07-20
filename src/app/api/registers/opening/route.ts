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

type OpeningAssignmentInput = {
  registerId?: string;
  responsibleUserId?: string;
  openingAmount?: number;
  openingNotes?: string;
};

type CreateOpeningBody = {
  businessDate?: string;
  assignments?: OpeningAssignmentInput[];
  virtualAccountId?: string;
  virtualOpeningBalance?: number;
  virtualOpeningNotes?: string;
};

type UserRow = {
  id: string;
  username: string;
  display_name: string;
  role: string;
  active: number;
};

type RegisterRow = {
  id: string;
  code: string;
  name: string;
  active: number;
};

type VirtualAccountRow = {
  id: string;
  code: string;
  name: string;
  active: number;
};

type OpenPhysicalSessionRow = {
  id: string;
  register_id: string;
  register_code: string;
  register_name: string;
  responsible_user_id: string;
  responsible_username: string;
  responsible_name: string;
  business_date: string;
  opening_amount_cents: number;
  status: string;
  opened_at: string;
  opened_by_user_id: string;
  opened_by_name: string;
  opening_notes: string | null;
};

type OpenVirtualSessionRow = {
  id: string;
  virtual_account_id: string;
  virtual_account_code: string;
  virtual_account_name: string;
  business_date: string;
  opening_balance_cents: number;
  status: string;
  opened_at: string;
  opened_by_user_id: string;
  opened_by_name: string;
  opening_notes: string | null;
};

type ExistingPhysicalSessionRow = {
  id: string;
  register_id: string;
  responsible_user_id: string;
};

type ExistingVirtualSessionRow = {
  id: string;
};

type PreparedAssignment = {
  sessionId: string;
  registerId: string;
  responsibleUserId: string;
  openingAmountCents: number;
  openingNotes: string | null;
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

function isValidBusinessDate(
  value: string,
): boolean {
  const match =
    /^(\d{4})-(\d{2})-(\d{2})$/.exec(
      value,
    );

  if (!match) {
    return false;
  }

  const year =
    Number(
      match[1],
    );

  const month =
    Number(
      match[2],
    );

  const day =
    Number(
      match[3],
    );

  const date =
    new Date(
      Date.UTC(
        year,
        month - 1,
        day,
      ),
    );

  return (
    date.getUTCFullYear() ===
      year &&
    date.getUTCMonth() ===
      month - 1 &&
    date.getUTCDate() ===
      day
  );
}

function getBuenosAiresToday(): string {
  const formatter =
    new Intl.DateTimeFormat(
      "en-US",
      {
        timeZone:
          "America/Argentina/Buenos_Aires",

        year:
          "numeric",

        month:
          "2-digit",

        day:
          "2-digit",
      },
    );

  const parts =
    formatter.formatToParts(
      new Date(),
    );

  const year =
    parts.find(
      (part) =>
        part.type ===
        "year",
    )?.value;

  const month =
    parts.find(
      (part) =>
        part.type ===
        "month",
    )?.value;

  const day =
    parts.find(
      (part) =>
        part.type ===
        "day",
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

function mapPhysicalSession(
  session: OpenPhysicalSessionRow,
) {
  return {
    id:
      session.id,

    registerId:
      session.register_id,

    registerCode:
      session.register_code,

    registerName:
      session.register_name,

    responsibleUserId:
      session.responsible_user_id,

    responsibleUsername:
      session.responsible_username,

    responsibleName:
      session.responsible_name,

    businessDate:
      session.business_date,

    openingAmount:
      centsToMoney(
        session.opening_amount_cents,
      ),

    status:
      session.status,

    openedAt:
      session.opened_at,

    openedByUserId:
      session.opened_by_user_id,

    openedByName:
      session.opened_by_name,

    openingNotes:
      session.opening_notes,
  };
}

function mapVirtualSession(
  session: OpenVirtualSessionRow,
) {
  return {
    id:
      session.id,

    virtualAccountId:
      session.virtual_account_id,

    virtualAccountCode:
      session.virtual_account_code,

    virtualAccountName:
      session.virtual_account_name,

    businessDate:
      session.business_date,

    openingBalance:
      centsToMoney(
        session.opening_balance_cents,
      ),

    status:
      session.status,

    openedAt:
      session.opened_at,

    openedByUserId:
      session.opened_by_user_id,

    openedByName:
      session.opened_by_name,

    openingNotes:
      session.opening_notes,
  };
}

/*
 * GET /api/registers/opening
 *
 * Solo un administrador autenticado
 * puede consultar la apertura.
 */
export async function GET(
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
            "Acceso administrativo requerido.",
        },
        {
          status: 401,
        },
      );
    }

    const { env } =
      getCloudflareContext();

    const [
      cashiersResult,
      registersResult,
      virtualAccountsResult,
      physicalSessionsResult,
      virtualSession,
    ] = await Promise.all([
      env.DB.prepare(`
        SELECT
          id,
          username,
          display_name,
          role,
          active

        FROM app_users

        WHERE
          role = 'CAJERO'
          AND active = 1

        ORDER BY
          display_name ASC
      `).all<UserRow>(),

      env.DB.prepare(`
        SELECT
          id,
          code,
          name,
          active

        FROM physical_registers

        WHERE
          active = 1

        ORDER BY
          code ASC
      `).all<RegisterRow>(),

      env.DB.prepare(`
        SELECT
          id,
          code,
          name,
          active

        FROM virtual_accounts

        WHERE
          active = 1

        ORDER BY
          code ASC
      `).all<VirtualAccountRow>(),

      env.DB.prepare(`
        SELECT
          sessions.id,
          sessions.register_id,

          registers.code
            AS register_code,

          registers.name
            AS register_name,

          sessions.responsible_user_id,

          responsible.username
            AS responsible_username,

          responsible.display_name
            AS responsible_name,

          sessions.business_date,
          sessions.opening_amount_cents,
          sessions.status,
          sessions.opened_at,
          sessions.opened_by_user_id,

          opened_by.display_name
            AS opened_by_name,

          sessions.opening_notes

        FROM physical_register_sessions
          AS sessions

        INNER JOIN physical_registers
          AS registers
          ON registers.id =
             sessions.register_id

        INNER JOIN app_users
          AS responsible
          ON responsible.id =
             sessions.responsible_user_id

        INNER JOIN app_users
          AS opened_by
          ON opened_by.id =
             sessions.opened_by_user_id

        WHERE
          sessions.status =
            'ABIERTA'

        ORDER BY
          registers.code ASC
      `).all<OpenPhysicalSessionRow>(),

      env.DB.prepare(`
        SELECT
          sessions.id,
          sessions.virtual_account_id,

          accounts.code
            AS virtual_account_code,

          accounts.name
            AS virtual_account_name,

          sessions.business_date,
          sessions.opening_balance_cents,
          sessions.status,
          sessions.opened_at,
          sessions.opened_by_user_id,

          opened_by.display_name
            AS opened_by_name,

          sessions.opening_notes

        FROM virtual_account_sessions
          AS sessions

        INNER JOIN virtual_accounts
          AS accounts
          ON accounts.id =
             sessions.virtual_account_id

        INNER JOIN app_users
          AS opened_by
          ON opened_by.id =
             sessions.opened_by_user_id

        WHERE
          sessions.status =
            'ABIERTA'

        LIMIT 1
      `).first<OpenVirtualSessionRow>(),
    ]);

    return Response.json({
      authenticatedAdmin: {
        id:
          admin.userId,

        username:
          admin.username,

        displayName:
          admin.displayName,

        role:
          admin.role,
      },

      businessDate:
        getBuenosAiresToday(),

      cashiers:
        cashiersResult.results.map(
          (cashier) => ({
            id:
              cashier.id,

            username:
              cashier.username,

            displayName:
              cashier.display_name,

            role:
              cashier.role,

            active:
              cashier.active ===
              1,
          }),
        ),

      physicalRegisters:
        registersResult.results.map(
          (register) => ({
            id:
              register.id,

            code:
              register.code,

            name:
              register.name,

            active:
              register.active ===
              1,
          }),
        ),

      virtualAccounts:
        virtualAccountsResult.results.map(
          (account) => ({
            id:
              account.id,

            code:
              account.code,

            name:
              account.name,

            active:
              account.active ===
              1,
          }),
        ),

      openPhysicalSessions:
        physicalSessionsResult.results.map(
          mapPhysicalSession,
        ),

      openVirtualSession:
        virtualSession
          ? mapVirtualSession(
              virtualSession,
            )
          : null,
    });
  } catch (error) {
    console.error(
      "Error al cargar apertura de cajas:",
      error,
    );

    return Response.json(
      {
        error:
          "No se pudo cargar la información de las cajas.",
      },
      {
        status: 500,
      },
    );
  }
}

/*
 * POST /api/registers/opening
 *
 * Abre:
 *
 * - las dos cajas físicas;
 * - la caja virtual compartida.
 *
 * Solo puede hacerlo un administrador
 * autenticado.
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
            "Acceso administrativo requerido.",
        },
        {
          status: 401,
        },
      );
    }

    const body =
      (await request.json()) as CreateOpeningBody;

    const businessDate =
      normalizeText(
        body.businessDate,
      ) ||
      getBuenosAiresToday();

    /*
     * El usuario que realiza la
     * apertura se obtiene de la
     * sesión segura.
     *
     * No se acepta un identificador
     * enviado desde la pantalla.
     */
    const openedByUserId =
      admin.userId;

    const virtualAccountId =
      normalizeText(
        body.virtualAccountId,
      ) ||
      "virtual-account-main";

    const assignments =
      body.assignments;

    const virtualOpeningBalance =
      Number(
        body.virtualOpeningBalance,
      );

    if (
      !isValidBusinessDate(
        businessDate,
      )
    ) {
      return Response.json(
        {
          error:
            "La fecha comercial no es válida.",
        },
        {
          status: 400,
        },
      );
    }

    if (
      !Array.isArray(
        assignments,
      ) ||
      assignments.length !==
        2
    ) {
      return Response.json(
        {
          error:
            "Debés asignar exactamente dos cajas físicas.",
        },
        {
          status: 400,
        },
      );
    }

    if (
      !Number.isFinite(
        virtualOpeningBalance,
      ) ||
      virtualOpeningBalance <
        0
    ) {
      return Response.json(
        {
          error:
            "El saldo inicial virtual no es válido.",
        },
        {
          status: 400,
        },
      );
    }

    const preparedAssignments:
      PreparedAssignment[] =
      [];

    for (
      const assignment of
      assignments
    ) {
      const registerId =
        normalizeText(
          assignment.registerId,
        );

      const responsibleUserId =
        normalizeText(
          assignment.responsibleUserId,
        );

      const openingAmount =
        Number(
          assignment.openingAmount,
        );

      if (!registerId) {
        return Response.json(
          {
            error:
              "Una de las cajas físicas no fue identificada.",
          },
          {
            status: 400,
          },
        );
      }

      if (
        !responsibleUserId
      ) {
        return Response.json(
          {
            error:
              "Seleccioná una responsable para cada caja.",
          },
          {
            status: 400,
          },
        );
      }

      if (
        !Number.isFinite(
          openingAmount,
        ) ||
        openingAmount < 0
      ) {
        return Response.json(
          {
            error:
              "Uno de los importes iniciales no es válido.",
          },
          {
            status: 400,
          },
        );
      }

      preparedAssignments.push({
        sessionId:
          crypto.randomUUID(),

        registerId,

        responsibleUserId,

        openingAmountCents:
          moneyToCents(
            openingAmount,
          ),

        openingNotes:
          normalizeText(
            assignment.openingNotes,
          ) || null,
      });
    }

    const registerIds =
      preparedAssignments.map(
        (assignment) =>
          assignment.registerId,
      );

    const responsibleUserIds =
      preparedAssignments.map(
        (assignment) =>
          assignment.responsibleUserId,
      );

    if (
      new Set(
        registerIds,
      ).size !== 2
    ) {
      return Response.json(
        {
          error:
            "No podés abrir dos veces la misma caja física.",
        },
        {
          status: 400,
        },
      );
    }

    if (
      new Set(
        responsibleUserIds,
      ).size !== 2
    ) {
      return Response.json(
        {
          error:
            "La misma empleada no puede quedar asignada a las dos cajas.",
        },
        {
          status: 400,
        },
      );
    }

    const { env } =
      getCloudflareContext();

    const [
      cashiersResult,
      registersResult,
      virtualAccount,
      openingUser,
      existingPhysicalSessions,
      existingVirtualSession,
    ] = await Promise.all([
      env.DB.prepare(`
        SELECT
          id,
          username,
          display_name,
          role,
          active

        FROM app_users

        WHERE
          id IN (?, ?)

          AND role =
              'CAJERO'

          AND active = 1
      `)
        .bind(
          responsibleUserIds[0],
          responsibleUserIds[1],
        )
        .all<UserRow>(),

      env.DB.prepare(`
        SELECT
          id,
          code,
          name,
          active

        FROM physical_registers

        WHERE
          id IN (?, ?)

          AND active = 1
      `)
        .bind(
          registerIds[0],
          registerIds[1],
        )
        .all<RegisterRow>(),

      env.DB.prepare(`
        SELECT
          id,
          code,
          name,
          active

        FROM virtual_accounts

        WHERE
          id = ?

          AND active = 1

        LIMIT 1
      `)
        .bind(
          virtualAccountId,
        )
        .first<VirtualAccountRow>(),

      env.DB.prepare(`
        SELECT
          id,
          username,
          display_name,
          role,
          active

        FROM app_users

        WHERE
          id = ?

          AND role =
              'ADMIN'

          AND active = 1

        LIMIT 1
      `)
        .bind(
          openedByUserId,
        )
        .first<UserRow>(),

      env.DB.prepare(`
        SELECT
          id,
          register_id,
          responsible_user_id

        FROM physical_register_sessions

        WHERE
          status =
            'ABIERTA'

          AND (
            register_id
              IN (?, ?)

            OR responsible_user_id
              IN (?, ?)
          )
      `)
        .bind(
          registerIds[0],
          registerIds[1],
          responsibleUserIds[0],
          responsibleUserIds[1],
        )
        .all<ExistingPhysicalSessionRow>(),

      env.DB.prepare(`
        SELECT
          id

        FROM virtual_account_sessions

        WHERE
          virtual_account_id = ?

          AND status =
              'ABIERTA'

        LIMIT 1
      `)
        .bind(
          virtualAccountId,
        )
        .first<ExistingVirtualSessionRow>(),
    ]);

    if (
      cashiersResult.results
        .length !== 2
    ) {
      return Response.json(
        {
          error:
            "Una de las empleadas no existe, está inactiva o no tiene rol de cajera.",
        },
        {
          status: 409,
        },
      );
    }

    if (
      registersResult.results
        .length !== 2
    ) {
      return Response.json(
        {
          error:
            "Una de las cajas físicas no existe o está desactivada.",
        },
        {
          status: 409,
        },
      );
    }

    if (!virtualAccount) {
      return Response.json(
        {
          error:
            "La caja virtual no existe o está desactivada.",
        },
        {
          status: 409,
        },
      );
    }

    if (!openingUser) {
      return Response.json(
        {
          error:
            "La sesión administrativa ya no pertenece a un administrador activo.",
        },
        {
          status: 401,
        },
      );
    }

    if (
      existingPhysicalSessions
        .results.length > 0
    ) {
      return Response.json(
        {
          error:
            "Una de las cajas o empleadas ya tiene una sesión abierta.",
        },
        {
          status: 409,
        },
      );
    }

    if (
      existingVirtualSession
    ) {
      return Response.json(
        {
          error:
            "La caja virtual ya tiene una sesión abierta.",
        },
        {
          status: 409,
        },
      );
    }

    const virtualSessionId =
      crypto.randomUUID();

    const statements:
      D1PreparedStatement[] =
      [];

    for (
      const assignment of
      preparedAssignments
    ) {
      statements.push(
        env.DB.prepare(`
          INSERT INTO physical_register_sessions (
            id,
            register_id,
            responsible_user_id,
            business_date,
            opening_amount_cents,
            status,
            opened_by_user_id,
            opening_notes
          )

          VALUES (
            ?,
            ?,
            ?,
            ?,
            ?,
            'ABIERTA',
            ?,
            ?
          )
        `).bind(
          assignment.sessionId,
          assignment.registerId,
          assignment.responsibleUserId,
          businessDate,
          assignment.openingAmountCents,
          openedByUserId,
          assignment.openingNotes,
        ),
      );
    }

    statements.push(
      env.DB.prepare(`
        INSERT INTO virtual_account_sessions (
          id,
          virtual_account_id,
          business_date,
          opening_balance_cents,
          status,
          opened_by_user_id,
          opening_notes
        )

        VALUES (
          ?,
          ?,
          ?,
          ?,
          'ABIERTA',
          ?,
          ?
        )
      `).bind(
        virtualSessionId,
        virtualAccountId,
        businessDate,
        moneyToCents(
          virtualOpeningBalance,
        ),
        openedByUserId,
        normalizeText(
          body.virtualOpeningNotes,
        ) || null,
      ),
    );

    await env.DB.batch(
      statements,
    );

    const [
      createdPhysicalSessions,
      createdVirtualSession,
    ] = await Promise.all([
      env.DB.prepare(`
        SELECT
          sessions.id,
          sessions.register_id,

          registers.code
            AS register_code,

          registers.name
            AS register_name,

          sessions.responsible_user_id,

          responsible.username
            AS responsible_username,

          responsible.display_name
            AS responsible_name,

          sessions.business_date,
          sessions.opening_amount_cents,
          sessions.status,
          sessions.opened_at,
          sessions.opened_by_user_id,

          opened_by.display_name
            AS opened_by_name,

          sessions.opening_notes

        FROM physical_register_sessions
          AS sessions

        INNER JOIN physical_registers
          AS registers
          ON registers.id =
             sessions.register_id

        INNER JOIN app_users
          AS responsible
          ON responsible.id =
             sessions.responsible_user_id

        INNER JOIN app_users
          AS opened_by
          ON opened_by.id =
             sessions.opened_by_user_id

        WHERE
          sessions.id
            IN (?, ?)

        ORDER BY
          registers.code ASC
      `)
        .bind(
          preparedAssignments[0]
            .sessionId,

          preparedAssignments[1]
            .sessionId,
        )
        .all<OpenPhysicalSessionRow>(),

      env.DB.prepare(`
        SELECT
          sessions.id,
          sessions.virtual_account_id,

          accounts.code
            AS virtual_account_code,

          accounts.name
            AS virtual_account_name,

          sessions.business_date,
          sessions.opening_balance_cents,
          sessions.status,
          sessions.opened_at,
          sessions.opened_by_user_id,

          opened_by.display_name
            AS opened_by_name,

          sessions.opening_notes

        FROM virtual_account_sessions
          AS sessions

        INNER JOIN virtual_accounts
          AS accounts
          ON accounts.id =
             sessions.virtual_account_id

        INNER JOIN app_users
          AS opened_by
          ON opened_by.id =
             sessions.opened_by_user_id

        WHERE
          sessions.id = ?

        LIMIT 1
      `)
        .bind(
          virtualSessionId,
        )
        .first<OpenVirtualSessionRow>(),
    ]);

    return Response.json(
      {
        message:
          "Las cajas fueron abiertas correctamente.",

        openedBy: {
          id:
            admin.userId,

          username:
            admin.username,

          displayName:
            admin.displayName,
        },

        businessDate,

        physicalSessions:
          createdPhysicalSessions.results.map(
            mapPhysicalSession,
          ),

        virtualSession:
          createdVirtualSession
            ? mapVirtualSession(
                createdVirtualSession,
              )
            : null,
      },
      {
        status: 201,
      },
    );
  } catch (error) {
    console.error(
      "Error al abrir las cajas:",
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
            "Una caja o empleada ya tiene una sesión abierta.",
        },
        {
          status: 409,
        },
      );
    }

    return Response.json(
      {
        error:
          "No se pudieron abrir las cajas.",
      },
      {
        status: 500,
      },
    );
  }
}