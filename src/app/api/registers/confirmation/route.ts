import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  getCloudflareContext,
} from "@opennextjs/cloudflare";

import {
  hashSessionToken,
} from "@/lib/auth";

import {
  SESSION_COOKIE_NAME,
} from "@/lib/session";

export const dynamic =
  "force-dynamic";

type ConfirmationBody = {
  countedAmount?: number;
  notes?: string;
};

type AuthenticatedUserRow = {
  login_session_id: string;
  user_id: string;
  display_name: string;
};

type OpenPhysicalSessionRow = {
  session_id: string;
  register_id: string;
  register_code: string;
  register_name: string;
  business_date: string;
  opening_amount_cents: number;
  confirmation_status: string;
};

type ConfirmedPhysicalSessionRow = {
  session_id: string;
  register_id: string;
  register_code: string;
  register_name: string;
  business_date: string;
  opening_amount_cents: number;
  confirmation_status: string;
  confirmed_amount_cents: number | null;
  confirmation_difference_cents:
    | number
    | null;
  confirmed_at: string | null;
  confirmation_notes: string | null;
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
  value:
    | number
    | null
    | undefined,
): number | null {
  if (
    value === null ||
    value === undefined
  ) {
    return null;
  }

  return Number(value) / 100;
}

function mapSession(
  session: ConfirmedPhysicalSessionRow,
) {
  return {
    id:
      session.session_id,

    registerId:
      session.register_id,

    registerCode:
      session.register_code,

    registerName:
      session.register_name,

    businessDate:
      session.business_date,

    openingAmount:
      centsToMoney(
        session.opening_amount_cents,
      ),

    confirmationStatus:
      session.confirmation_status,

    confirmedAmount:
      centsToMoney(
        session.confirmed_amount_cents,
      ),

    confirmationDifference:
      centsToMoney(
        session
          .confirmation_difference_cents,
      ),

    confirmedAt:
      session.confirmed_at,

    confirmationNotes:
      session.confirmation_notes,

    requiresConfirmation:
      session.confirmation_status ===
      "PENDIENTE",
  };
}

/*
 * POST /api/registers/confirmation
 *
 * La cajera conectada confirma cuánto
 * efectivo recibió realmente.
 */
export async function POST(
  request: NextRequest,
) {
  try {
    const token =
      request.cookies.get(
        SESSION_COOKIE_NAME,
      )?.value;

    if (!token) {
      return NextResponse.json(
        {
          error:
            "Primero debés iniciar sesión.",
        },
        {
          status: 401,
        },
      );
    }

    const body =
      (await request.json()) as ConfirmationBody;

    const countedAmount =
      Number(
        body.countedAmount,
      );

    const notes =
      normalizeText(
        body.notes,
      );

    if (
      !Number.isFinite(
        countedAmount,
      ) ||
      countedAmount < 0
    ) {
      return NextResponse.json(
        {
          error:
            "Ingresá el importe que contaste.",
        },
        {
          status: 400,
        },
      );
    }

    const tokenHash =
      await hashSessionToken(
        token,
      );

    const { env } =
      getCloudflareContext();

    /*
     * Comprueba quién está conectado.
     */
    const authenticatedUser =
      await env.DB.prepare(`
        SELECT
          login_sessions.id
            AS login_session_id,

          users.id
            AS user_id,

          users.display_name

        FROM app_user_sessions
          AS login_sessions

        INNER JOIN app_users
          AS users
          ON users.id =
             login_sessions.user_id

        WHERE
          login_sessions.token_hash = ?
          AND login_sessions.revoked_at
              IS NULL

          AND login_sessions.expires_at >
              CURRENT_TIMESTAMP

          AND users.active = 1

        LIMIT 1
      `)
        .bind(
          tokenHash,
        )
        .first<AuthenticatedUserRow>();

    if (!authenticatedUser) {
      const response =
        NextResponse.json(
          {
            error:
              "La sesión venció. Iniciá sesión nuevamente.",
          },
          {
            status: 401,
          },
        );

      response.cookies.set({
        name:
          SESSION_COOKIE_NAME,

        value:
          "",

        httpOnly:
          true,

        sameSite:
          "lax",

        path:
          "/",

        maxAge:
          0,
      });

      return response;
    }

    /*
     * Busca únicamente la caja abierta
     * asignada a la empleada conectada.
     */
    const openSession =
      await env.DB.prepare(`
        SELECT
          sessions.id
            AS session_id,

          registers.id
            AS register_id,

          registers.code
            AS register_code,

          registers.name
            AS register_name,

          sessions.business_date,
          sessions.opening_amount_cents,

          sessions.cashier_confirmation_status
            AS confirmation_status

        FROM physical_register_sessions
          AS sessions

        INNER JOIN physical_registers
          AS registers
          ON registers.id =
             sessions.register_id

        WHERE
          sessions.responsible_user_id = ?
          AND sessions.status = 'ABIERTA'
          AND registers.active = 1

        LIMIT 1
      `)
        .bind(
          authenticatedUser.user_id,
        )
        .first<OpenPhysicalSessionRow>();

    if (!openSession) {
      return NextResponse.json(
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
      openSession.confirmation_status !==
      "PENDIENTE"
    ) {
      return NextResponse.json(
        {
          error:
            "Esta caja ya fue confirmada anteriormente.",
        },
        {
          status: 409,
        },
      );
    }

    const countedAmountCents =
      moneyToCents(
        countedAmount,
      );

    const differenceCents =
      countedAmountCents -
      openSession.opening_amount_cents;

    const confirmationStatus =
      differenceCents === 0
        ? "CONFIRMADA"
        : "OBSERVADA";

    /*
     * Cuando existe una diferencia,
     * se exige una explicación.
     */
    if (
      differenceCents !== 0 &&
      !notes
    ) {
      return NextResponse.json(
        {
          error:
            "Hay una diferencia. Escribí una observación antes de confirmar.",
        },
        {
          status: 400,
        },
      );
    }

    const updateResult =
      await env.DB.prepare(`
        UPDATE physical_register_sessions

        SET
          cashier_confirmation_status = ?,

          cashier_confirmed_amount_cents = ?,

          cashier_confirmation_difference_cents = ?,

          cashier_confirmed_at =
            CURRENT_TIMESTAMP,

          cashier_confirmed_by_user_id = ?,

          cashier_confirmation_notes = ?,

          updated_at =
            CURRENT_TIMESTAMP

        WHERE
          id = ?

          AND responsible_user_id = ?

          AND status = 'ABIERTA'

          AND cashier_confirmation_status =
              'PENDIENTE'
      `)
        .bind(
          confirmationStatus,
          countedAmountCents,
          differenceCents,
          authenticatedUser.user_id,
          notes || null,
          openSession.session_id,
          authenticatedUser.user_id,
        )
        .run();

    if (
      Number(
        updateResult.meta.changes,
      ) !== 1
    ) {
      return NextResponse.json(
        {
          error:
            "La caja cambió mientras se procesaba la confirmación. Actualizá la página.",
        },
        {
          status: 409,
        },
      );
    }

    await env.DB.prepare(`
      UPDATE app_user_sessions

      SET
        last_seen_at =
          CURRENT_TIMESTAMP

      WHERE id = ?
    `)
      .bind(
        authenticatedUser
          .login_session_id,
      )
      .run();

    const confirmedSession =
      await env.DB.prepare(`
        SELECT
          sessions.id
            AS session_id,

          registers.id
            AS register_id,

          registers.code
            AS register_code,

          registers.name
            AS register_name,

          sessions.business_date,
          sessions.opening_amount_cents,

          sessions.cashier_confirmation_status
            AS confirmation_status,

          sessions.cashier_confirmed_amount_cents
            AS confirmed_amount_cents,

          sessions.cashier_confirmation_difference_cents
            AS confirmation_difference_cents,

          sessions.cashier_confirmed_at
            AS confirmed_at,

          sessions.cashier_confirmation_notes
            AS confirmation_notes

        FROM physical_register_sessions
          AS sessions

        INNER JOIN physical_registers
          AS registers
          ON registers.id =
             sessions.register_id

        WHERE
          sessions.id = ?

        LIMIT 1
      `)
        .bind(
          openSession.session_id,
        )
        .first<ConfirmedPhysicalSessionRow>();

    if (!confirmedSession) {
      return NextResponse.json(
        {
          error:
            "La confirmación se guardó, pero no pudo recuperarse.",
        },
        {
          status: 500,
        },
      );
    }

    const message =
      differenceCents === 0
        ? "La recepción de la caja fue confirmada correctamente."
        : "La recepción quedó observada por una diferencia de efectivo.";

    return NextResponse.json({
      message,

      user: {
        id:
          authenticatedUser.user_id,

        displayName:
          authenticatedUser.display_name,
      },

      openRegisterSession:
        mapSession(
          confirmedSession,
        ),
    });
  } catch (error) {
    console.error(
      "Error al confirmar recepción:",
      error,
    );

    const errorMessage =
      error instanceof Error
        ? error.message
        : "";

    if (
      errorMessage.includes(
        "ONLY_RESPONSIBLE_CASHIER_CAN_CONFIRM",
      )
    ) {
      return NextResponse.json(
        {
          error:
            "Solo la responsable puede confirmar esta caja.",
        },
        {
          status: 403,
        },
      );
    }

    if (
      errorMessage.includes(
        "INCOMPLETE_CASHIER_CONFIRMATION",
      )
    ) {
      return NextResponse.json(
        {
          error:
            "Faltan datos para completar la confirmación.",
        },
        {
          status: 400,
        },
      );
    }

    return NextResponse.json(
      {
        error:
          "No se pudo confirmar la recepción de la caja.",
      },
      {
        status: 500,
      },
    );
  }
}