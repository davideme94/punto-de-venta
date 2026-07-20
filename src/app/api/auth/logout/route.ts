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

/*
 * POST /api/auth/logout
 *
 * Revoca la sesión actual y elimina
 * la cookie del dispositivo.
 */
export async function POST(
  request: NextRequest,
) {
  try {
    const token =
      request.cookies.get(
        SESSION_COOKIE_NAME,
      )?.value;

    if (token) {
      const tokenHash =
        await hashSessionToken(
          token,
        );

      const { env } =
        getCloudflareContext();

      await env.DB.prepare(`
        UPDATE app_user_sessions

        SET
          revoked_at =
            CURRENT_TIMESTAMP

        WHERE
          token_hash = ?
          AND revoked_at IS NULL
      `)
        .bind(tokenHash)
        .run();
    }

    const response =
      NextResponse.json({
        message:
          "Sesión cerrada correctamente.",
      });

    response.cookies.set({
      name:
        SESSION_COOKIE_NAME,

      value:
        "",

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
        0,
    });

    return response;
  } catch (error) {
    console.error(
      "Error al cerrar sesión:",
      error,
    );

    return NextResponse.json(
      {
        error:
          "No se pudo cerrar la sesión.",
      },
      {
        status: 500,
      },
    );
  }
}