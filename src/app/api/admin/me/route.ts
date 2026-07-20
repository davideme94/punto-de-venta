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

type AuthenticatedAdminRow = {
  login_session_id: string;
  user_id: string;
  username: string;
  display_name: string;
  role: string;
  expires_at: string;
};

/*
 * GET /api/admin/me
 *
 * Comprueba que:
 *
 * - exista una cookie;
 * - la sesión siga vigente;
 * - no haya sido revocada;
 * - el usuario sea administrador;
 * - la cuenta continúe activa.
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
            "No hay una sesión administrativa iniciada.",
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

    const admin =
      await env.DB.prepare(`
        SELECT
          login_sessions.id
            AS login_session_id,

          users.id
            AS user_id,

          users.username,
          users.display_name,
          users.role,

          login_sessions.expires_at

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

          AND users.role = 'ADMIN'

        LIMIT 1
      `)
        .bind(
          tokenHash,
        )
        .first<AuthenticatedAdminRow>();

    if (!admin) {
      const response =
        NextResponse.json(
          {
            authenticated:
              false,

            error:
              "La sesión administrativa venció o no es válida.",
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

      WHERE
        id = ?
    `)
      .bind(
        admin.login_session_id,
      )
      .run();

    return NextResponse.json({
      authenticated:
        true,

      user: {
        id:
          admin.user_id,

        username:
          admin.username,

        displayName:
          admin.display_name,

        role:
          admin.role,
      },
    });
  } catch (error) {
    console.error(
      "Error al comprobar sesión administrativa:",
      error,
    );

    return NextResponse.json(
      {
        authenticated:
          false,

        error:
          "No se pudo comprobar la sesión administrativa.",
      },
      {
        status: 500,
      },
    );
  }
}