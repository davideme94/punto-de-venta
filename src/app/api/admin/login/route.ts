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
  verifyPassword,
} from "@/lib/auth";

import {
  createSessionExpiration,
  SESSION_COOKIE_NAME,
  SESSION_DURATION_SECONDS,
} from "@/lib/session";

export const dynamic =
  "force-dynamic";

type AdminLoginBody = {
  password?: string;
  deviceName?: string;
};

type AdminUserRow = {
  id: string;
  username: string;
  display_name: string;
  role: string;
  active: number;
  password_hash: string | null;
  password_salt: string | null;
};

function normalizeText(
  value: string | null | undefined,
): string {
  return value?.trim() ?? "";
}

/*
 * GET /api/admin/login
 *
 * Informa si existe un administrador
 * activo y si ya tiene una contraseña.
 */
export async function GET() {
  try {
    const { env } =
      getCloudflareContext();

    const admin =
      await env.DB.prepare(`
        SELECT
          id,
          username,
          display_name,
          role,
          active,
          password_hash,
          password_salt

        FROM app_users

        WHERE
          id = 'user-admin'
          AND role = 'ADMIN'

        LIMIT 1
      `).first<AdminUserRow>();

    if (!admin) {
      return NextResponse.json(
        {
          configured: false,

          error:
            "No se encontró el usuario administrador.",
        },
        {
          status: 404,
        },
      );
    }

    return NextResponse.json({
      configured:
        admin.active === 1 &&
        admin.password_hash !== null &&
        admin.password_salt !== null,

      admin: {
        id:
          admin.id,

        username:
          admin.username,

        displayName:
          admin.display_name,

        role:
          admin.role,

        active:
          admin.active === 1,

        hasPassword:
          admin.password_hash !== null &&
          admin.password_salt !== null,
      },
    });
  } catch (error) {
    console.error(
      "Error al consultar administrador:",
      error,
    );

    return NextResponse.json(
      {
        configured: false,

        error:
          "No se pudo comprobar la configuración administrativa.",
      },
      {
        status: 500,
      },
    );
  }
}

/*
 * POST /api/admin/login
 *
 * Comprueba la contraseña administrativa
 * y crea una sesión segura.
 */
export async function POST(
  request: NextRequest,
) {
  try {
    const body =
      (await request.json()) as AdminLoginBody;

    /*
     * No usamos trim sobre la contraseña
     * porque los espacios podrían formar
     * parte de ella.
     */
    const password =
      typeof body.password ===
      "string"
        ? body.password
        : "";

    const deviceName =
      normalizeText(
        body.deviceName,
      ) ||
      "Panel administrativo";

    if (!password) {
      return NextResponse.json(
        {
          error:
            "Ingresá la contraseña administrativa.",
        },
        {
          status: 400,
        },
      );
    }

    const { env } =
      getCloudflareContext();

    const admin =
      await env.DB.prepare(`
        SELECT
          id,
          username,
          display_name,
          role,
          active,
          password_hash,
          password_salt

        FROM app_users

        WHERE
          id = 'user-admin'
          AND role = 'ADMIN'

        LIMIT 1
      `).first<AdminUserRow>();

    if (
      !admin ||
      admin.active !== 1
    ) {
      return NextResponse.json(
        {
          error:
            "Usuario o contraseña incorrectos.",
        },
        {
          status: 401,
        },
      );
    }

    if (
      !admin.password_hash ||
      !admin.password_salt
    ) {
      return NextResponse.json(
        {
          error:
            "La contraseña administrativa todavía no fue configurada.",
        },
        {
          status: 409,
        },
      );
    }

    const passwordIsValid =
      await verifyPassword(
        password,
        admin.password_salt,
        admin.password_hash,
      );

    if (!passwordIsValid) {
      return NextResponse.json(
        {
          error:
            "Usuario o contraseña incorrectos.",
        },
        {
          status: 401,
        },
      );
    }

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

    await env.DB.batch([
      /*
       * Limpia sesiones vencidas
       * o revocadas.
       */
      env.DB.prepare(`
        DELETE FROM app_user_sessions

        WHERE
          expires_at <=
            CURRENT_TIMESTAMP

          OR revoked_at
             IS NOT NULL
      `),

      /*
       * Crea la nueva sesión del
       * administrador.
       */
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
        admin.id,
        tokenHash,
        deviceName,
        expirationSql,
      ),
    ]);

    const response =
      NextResponse.json({
        message:
          "Ingreso administrativo correcto.",

        authenticated:
          true,

        user: {
          id:
            admin.id,

          username:
            admin.username,

          displayName:
            admin.display_name,

          role:
            admin.role,
        },
      });

    /*
     * El navegador recibe el token.
     * D1 solamente conserva su hash.
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
      "Error al iniciar sesión administrativa:",
      error,
    );

    return NextResponse.json(
      {
        error:
          "No se pudo iniciar la sesión administrativa.",
      },
      {
        status: 500,
      },
    );
  }
}