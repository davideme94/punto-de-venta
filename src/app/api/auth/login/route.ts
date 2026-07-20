import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  getCloudflareContext,
} from "@opennextjs/cloudflare";

import {
  createSessionToken,
  hashSessionToken,
  verifyPin,
} from "@/lib/auth";

import {
  createSessionExpiration,
  SESSION_COOKIE_NAME,
  SESSION_DURATION_SECONDS,
} from "@/lib/session";

export const dynamic =
  "force-dynamic";

type LoginBody = {
  userId?: string;
  pin?: string;
  deviceName?: string;
};

type LoginUserRow = {
  id: string;
  username: string;
  display_name: string;
  role: string;
  active: number;
  pin_hash: string | null;
  pin_salt: string | null;
};

type AvailableUserRow = {
  id: string;
  username: string;
  display_name: string;
  role: string;
  active: number;
  has_pin: number;
};

type OpenRegisterSessionRow = {
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
};

function normalizeText(
  value:
    | string
    | null
    | undefined,
): string {
  return value?.trim() ?? "";
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

function mapOpenSession(
  session:
    | OpenRegisterSessionRow
    | null,
) {
  if (!session) {
    return null;
  }

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

    requiresConfirmation:
      session.confirmation_status ===
      "PENDIENTE",
  };
}

/*
 * GET /api/auth/login
 *
 * Devuelve las empleadas activas
 * para mostrarlas en la pantalla
 * de ingreso.
 */
export async function GET() {
  try {
    const { env } =
      getCloudflareContext();

    const result =
      await env.DB.prepare(`
        SELECT
          id,
          username,
          display_name,
          role,
          active,

          CASE
            WHEN
              pin_hash IS NOT NULL
              AND pin_salt IS NOT NULL
            THEN 1
            ELSE 0
          END AS has_pin

        FROM app_users

        WHERE
          role = 'CAJERO'
          AND active = 1

        ORDER BY
          display_name ASC
      `).all<AvailableUserRow>();

    return NextResponse.json({
      users:
        result.results.map(
          (user) => ({
            id:
              user.id,

            username:
              user.username,

            displayName:
              user.display_name,

            role:
              user.role,

            active:
              user.active === 1,

            hasPin:
              user.has_pin === 1,
          }),
        ),
    });
  } catch (error) {
    console.error(
      "Error al cargar usuarios:",
      error,
    );

    return NextResponse.json(
      {
        error:
          "No se pudieron cargar las empleadas.",
      },
      {
        status: 500,
      },
    );
  }
}

/*
 * POST /api/auth/login
 *
 * Comprueba el PIN, crea una sesión
 * y busca automáticamente la caja
 * asignada a la empleada.
 */
export async function POST(
  request: NextRequest,
) {
  try {
    const body =
      (await request.json()) as LoginBody;

    const userId =
      normalizeText(
        body.userId,
      );

    const pin =
      normalizeText(
        body.pin,
      );

    const deviceName =
      normalizeText(
        body.deviceName,
      ) ||
      null;

    if (!userId) {
      return NextResponse.json(
        {
          error:
            "Seleccioná una empleada.",
        },
        {
          status: 400,
        },
      );
    }

    if (
      !/^\d{4,8}$/.test(pin)
    ) {
      return NextResponse.json(
        {
          error:
            "Ingresá un PIN válido.",
        },
        {
          status: 400,
        },
      );
    }

    const { env } =
      getCloudflareContext();

    const user =
      await env.DB.prepare(`
        SELECT
          id,
          username,
          display_name,
          role,
          active,
          pin_hash,
          pin_salt

        FROM app_users

        WHERE
          id = ?
          AND role = 'CAJERO'

        LIMIT 1
      `)
        .bind(userId)
        .first<LoginUserRow>();

    /*
     * Se utiliza un mensaje general
     * para no revelar demasiada
     * información sobre la cuenta.
     */
    if (
      !user ||
      user.active !== 1
    ) {
      return NextResponse.json(
        {
          error:
            "Usuario o PIN incorrecto.",
        },
        {
          status: 401,
        },
      );
    }

    if (
      !user.pin_hash ||
      !user.pin_salt
    ) {
      return NextResponse.json(
        {
          error:
            "Esta empleada todavía no tiene un PIN configurado.",
        },
        {
          status: 409,
        },
      );
    }

    const validPin =
      await verifyPin(
        pin,
        user.pin_salt,
        user.pin_hash,
      );

    if (!validPin) {
      return NextResponse.json(
        {
          error:
            "Usuario o PIN incorrecto.",
        },
        {
          status: 401,
        },
      );
    }

    /*
     * Busca la sesión de caja abierta
     * asignada por el administrador.
     */
    const openRegisterSession =
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
            AS confirmed_at

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
        .bind(user.id)
        .first<OpenRegisterSessionRow>();

    const sessionToken =
      createSessionToken();

    const tokenHash =
      await hashSessionToken(
        sessionToken,
      );

    const {
      expirationDate,
      expirationSql,
    } = createSessionExpiration();

    const loginSessionId =
      crypto.randomUUID();

    /*
     * Elimina sesiones vencidas y crea
     * la nueva sesión de usuario.
     */
    await env.DB.batch([
      env.DB.prepare(`
        DELETE FROM app_user_sessions

        WHERE
          expires_at <=
            CURRENT_TIMESTAMP
          OR revoked_at IS NOT NULL
      `),

      env.DB.prepare(`
        INSERT INTO app_user_sessions (
          id,
          user_id,
          token_hash,
          device_name,
          expires_at
        )

        VALUES (
          ?,
          ?,
          ?,
          ?,
          ?
        )
      `).bind(
        loginSessionId,
        user.id,
        tokenHash,
        deviceName,
        expirationSql,
      ),
    ]);

    const response =
      NextResponse.json({
        message:
          `Bienvenida, ${user.display_name}.`,

        user: {
          id:
            user.id,

          username:
            user.username,

          displayName:
            user.display_name,

          role:
            user.role,
        },

        openRegisterSession:
          mapOpenSession(
            openRegisterSession,
          ),

        hasAssignedRegister:
          openRegisterSession !== null,
      });

    /*
     * La cookie contiene el token original.
     * La base contiene solamente su hash.
     */
    response.cookies.set({
      name:
        SESSION_COOKIE_NAME,

      value:
        sessionToken,

      httpOnly:
        true,

      secure:
        new URL(
          request.url,
        ).protocol === "https:",

      sameSite:
        "lax",

      path:
        "/",

      maxAge:
        SESSION_DURATION_SECONDS,

      expires:
        expirationDate,
    });

    return response;
  } catch (error) {
    console.error(
      "Error al iniciar sesión:",
      error,
    );

    return NextResponse.json(
      {
        error:
          "No se pudo iniciar sesión.",
      },
      {
        status: 500,
      },
    );
  }
}