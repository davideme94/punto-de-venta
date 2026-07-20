import {
  type NextRequest,
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

export type AuthenticatedAdmin = {
  loginSessionId: string;
  userId: string;
  username: string;
  displayName: string;
  role: "ADMIN";
};

type AuthenticatedAdminRow = {
  login_session_id: string;
  user_id: string;
  username: string;
  display_name: string;
  role: string;
};

/*
 * Comprueba que la solicitud tenga:
 *
 * - una cookie de sesión;
 * - una sesión vigente;
 * - una cuenta activa;
 * - un usuario con rol ADMIN.
 */
export async function getAuthenticatedAdmin(
  request: NextRequest,
): Promise<AuthenticatedAdmin | null> {
  const token =
    request.cookies.get(
      SESSION_COOKIE_NAME,
    )?.value;

  if (!token) {
    return null;
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
        users.role

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

  if (
    !admin ||
    admin.role !== "ADMIN"
  ) {
    return null;
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

  return {
    loginSessionId:
      admin.login_session_id,

    userId:
      admin.user_id,

    username:
      admin.username,

    displayName:
      admin.display_name,

    role:
      "ADMIN",
  };
}