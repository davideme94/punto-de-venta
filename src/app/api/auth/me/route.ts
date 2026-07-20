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

type AuthenticatedUserRow = {
  login_session_id: string;
  user_id: string;
  username: string;
  display_name: string;
  role: string;
  expires_at: string;

  physical_session_id: string | null;
  register_id: string | null;
  register_code: string | null;
  register_name: string | null;
  business_date: string | null;

  opening_amount_cents:
    | number
    | null;

  confirmation_status:
    | string
    | null;

  confirmed_amount_cents:
    | number
    | null;

  confirmation_difference_cents:
    | number
    | null;

  confirmed_at:
    | string
    | null;
};

function centsToMoney(
  value:
    | number
    | null,
): number | null {
  if (value === null) {
    return null;
  }

  return Number(value) / 100;
}

/*
 * GET /api/auth/me
 *
 * Indica quién está conectado y
 * cuál es su caja actualmente asignada.
 */
export async function GET(
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
          authenticated:
            false,

          error:
            "No hay una sesión iniciada.",
        },
        {
          status: 401,
        },
      );
    }

    const tokenHash =
      await hashSessionToken(
        token,
      );

    const { env } =
      getCloudflareContext();

    const authenticatedUser =
      await env.DB.prepare(`
        SELECT
          login_sessions.id
            AS login_session_id,

          users.id
            AS user_id,

          users.username,
          users.display_name,
          users.role,

          login_sessions.expires_at,

          physical_sessions.id
            AS physical_session_id,

          registers.id
            AS register_id,

          registers.code
            AS register_code,

          registers.name
            AS register_name,

          physical_sessions.business_date,

          physical_sessions.opening_amount_cents,

          physical_sessions.cashier_confirmation_status
            AS confirmation_status,

          physical_sessions.cashier_confirmed_amount_cents
            AS confirmed_amount_cents,

          physical_sessions.cashier_confirmation_difference_cents
            AS confirmation_difference_cents,

          physical_sessions.cashier_confirmed_at
            AS confirmed_at

        FROM app_user_sessions
          AS login_sessions

        INNER JOIN app_users
          AS users
          ON users.id =
             login_sessions.user_id

        LEFT JOIN physical_register_sessions
          AS physical_sessions
          ON physical_sessions.responsible_user_id =
             users.id

          AND physical_sessions.status =
              'ABIERTA'

        LEFT JOIN physical_registers
          AS registers
          ON registers.id =
             physical_sessions.register_id

        WHERE
          login_sessions.token_hash = ?
          AND login_sessions.revoked_at
              IS NULL

          AND login_sessions.expires_at >
              CURRENT_TIMESTAMP

          AND users.active = 1

        LIMIT 1
      `)
        .bind(tokenHash)
        .first<AuthenticatedUserRow>();

    if (!authenticatedUser) {
      const response =
        NextResponse.json(
          {
            authenticated:
              false,

            error:
              "La sesión venció o ya no es válida.",
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

    const hasAssignedRegister =
      authenticatedUser
        .physical_session_id !== null;

    return NextResponse.json({
      authenticated:
        true,

      user: {
        id:
          authenticatedUser
            .user_id,

        username:
          authenticatedUser
            .username,

        displayName:
          authenticatedUser
            .display_name,

        role:
          authenticatedUser
            .role,
      },

      openRegisterSession:
        hasAssignedRegister
          ? {
              id:
                authenticatedUser
                  .physical_session_id,

              registerId:
                authenticatedUser
                  .register_id,

              registerCode:
                authenticatedUser
                  .register_code,

              registerName:
                authenticatedUser
                  .register_name,

              businessDate:
                authenticatedUser
                  .business_date,

              openingAmount:
                centsToMoney(
                  authenticatedUser
                    .opening_amount_cents,
                ),

              confirmationStatus:
                authenticatedUser
                  .confirmation_status,

              confirmedAmount:
                centsToMoney(
                  authenticatedUser
                    .confirmed_amount_cents,
                ),

              confirmationDifference:
                centsToMoney(
                  authenticatedUser
                    .confirmation_difference_cents,
                ),

              confirmedAt:
                authenticatedUser
                  .confirmed_at,

              requiresConfirmation:
                authenticatedUser
                  .confirmation_status ===
                "PENDIENTE",
            }
          : null,

      hasAssignedRegister,
    });
  } catch (error) {
    console.error(
      "Error al consultar sesión:",
      error,
    );

    return NextResponse.json(
      {
        authenticated:
          false,

        error:
          "No se pudo comprobar la sesión.",
      },
      {
        status: 500,
      },
    );
  }
}