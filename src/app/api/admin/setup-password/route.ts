import {
  type NextRequest,
  NextResponse,
} from "next/server";

import {
  getCloudflareContext,
} from "@opennextjs/cloudflare";

import {
  hashPassword,
} from "@/lib/auth";

import {
  getAuthenticatedAdmin,
} from "@/lib/admin-session";

import {
  SESSION_COOKIE_NAME,
} from "@/lib/session";

export const dynamic =
  "force-dynamic";

type SetupPasswordBody = {
  password?: string;
  setupSecret?: string;
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
  value:
    | string
    | null
    | undefined,
): string {
  return value?.trim() ?? "";
}

function validatePassword(
  password: string,
): string | null {
  if (
    password.length < 10
  ) {
    return "La contraseña debe tener al menos 10 caracteres.";
  }

  if (
    password.length > 72
  ) {
    return "La contraseña no puede superar los 72 caracteres.";
  }

  if (
    !/[a-z]/.test(
      password,
    )
  ) {
    return "La contraseña debe incluir al menos una letra minúscula.";
  }

  if (
    !/[A-Z]/.test(
      password,
    )
  ) {
    return "La contraseña debe incluir al menos una letra mayúscula.";
  }

  if (
    !/\d/.test(
      password,
    )
  ) {
    return "La contraseña debe incluir al menos un número.";
  }

  return null;
}

/*
 * GET /api/admin/setup-password
 *
 * Indica:
 *
 * - si la contraseña ya está configurada;
 * - si el administrador actual está autenticado.
 *
 * Si todavía no existe contraseña,
 * se permite realizar la configuración inicial.
 */
export async function GET(
  request: NextRequest,
) {
  try {
    const { env } =
      getCloudflareContext();

    const adminUser =
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

    if (!adminUser) {
      return NextResponse.json(
        {
          configured:
            false,

          authenticatedAdmin:
            false,

          error:
            "No se encontró el usuario administrador.",
        },
        {
          status: 404,
        },
      );
    }

    const configured =
      adminUser.password_hash !==
        null &&
      adminUser.password_salt !==
        null;

    /*
     * Antes de la configuración inicial
     * todavía no puede existir una sesión
     * administrativa válida.
     */
    if (!configured) {
      return NextResponse.json({
        configured:
          false,

        authenticatedAdmin:
          false,

        admin: {
          id:
            adminUser.id,

          username:
            adminUser.username,

          displayName:
            adminUser.display_name,

          role:
            adminUser.role,

          active:
            adminUser.active === 1,
        },
      });
    }

    const authenticatedAdmin =
      await getAuthenticatedAdmin(
        request,
      );

    return NextResponse.json({
      configured:
        true,

      authenticatedAdmin:
        authenticatedAdmin !== null,

      admin:
        authenticatedAdmin
          ? {
              id:
                authenticatedAdmin.userId,

              username:
                authenticatedAdmin.username,

              displayName:
                authenticatedAdmin.displayName,

              role:
                authenticatedAdmin.role,

              active:
                true,
            }
          : null,
    });
  } catch (error) {
    console.error(
      "Error al comprobar configuración administrativa:",
      error,
    );

    return NextResponse.json(
      {
        configured:
          false,

        authenticatedAdmin:
          false,

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
 * POST /api/admin/setup-password
 *
 * Configuración inicial:
 * - requiere ADMIN_SETUP_SECRET.
 *
 * Cambio posterior:
 * - requiere sesión ADMIN;
 * - requiere ADMIN_SETUP_SECRET.
 */
export async function POST(
  request: NextRequest,
) {
  try {
    const body =
      (await request.json()) as SetupPasswordBody;

    /*
     * No aplicamos trim a la contraseña,
     * porque un espacio podría formar
     * parte de ella.
     */
    const password =
      typeof body.password ===
      "string"
        ? body.password
        : "";

    const setupSecret =
      normalizeText(
        body.setupSecret,
      );

    const { env } =
      getCloudflareContext();

    const secureEnv =
      env as typeof env & {
        ADMIN_SETUP_SECRET?:
          string;
      };

    const expectedSecret =
      normalizeText(
        secureEnv
          .ADMIN_SETUP_SECRET,
      );

    if (!expectedSecret) {
      return NextResponse.json(
        {
          error:
            "Falta configurar ADMIN_SETUP_SECRET en .dev.vars.",
        },
        {
          status: 500,
        },
      );
    }

    if (
      !setupSecret ||
      setupSecret !==
        expectedSecret
    ) {
      return NextResponse.json(
        {
          error:
            "La clave de configuración no es válida.",
        },
        {
          status: 403,
        },
      );
    }

    const adminUser =
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

    if (!adminUser) {
      return NextResponse.json(
        {
          error:
            "No se encontró el usuario administrador.",
        },
        {
          status: 404,
        },
      );
    }

    if (
      adminUser.active !== 1
    ) {
      return NextResponse.json(
        {
          error:
            "El usuario administrador está desactivado.",
        },
        {
          status: 409,
        },
      );
    }

    const alreadyConfigured =
      adminUser.password_hash !==
        null &&
      adminUser.password_salt !==
        null;

    /*
     * Una vez configurada la contraseña,
     * solamente un administrador conectado
     * puede reemplazarla.
     */
    if (alreadyConfigured) {
      const authenticatedAdmin =
        await getAuthenticatedAdmin(
          request,
        );

      if (!authenticatedAdmin) {
        return NextResponse.json(
          {
            error:
              "Primero debés iniciar sesión como administrador.",
          },
          {
            status: 401,
          },
        );
      }

      if (
        authenticatedAdmin.userId !==
        adminUser.id
      ) {
        return NextResponse.json(
          {
            error:
              "La sesión administrativa no es válida.",
          },
          {
            status: 403,
          },
        );
      }
    }

    const passwordError =
      validatePassword(
        password,
      );

    if (passwordError) {
      return NextResponse.json(
        {
          error:
            passwordError,
        },
        {
          status: 400,
        },
      );
    }

    const {
      hash,
      salt,
    } = await hashPassword(
      password,
    );

    await env.DB.batch([
      env.DB.prepare(`
        UPDATE app_users

        SET
          password_hash = ?,

          password_salt = ?,

          password_updated_at =
            CURRENT_TIMESTAMP,

          updated_at =
            CURRENT_TIMESTAMP

        WHERE
          id = ?
      `).bind(
        hash,
        salt,
        adminUser.id,
      ),

      /*
       * Al cambiar la contraseña se
       * cierran todas las sesiones
       * administrativas anteriores.
       */
      env.DB.prepare(`
        UPDATE app_user_sessions

        SET
          revoked_at =
            CURRENT_TIMESTAMP

        WHERE
          user_id = ?

          AND revoked_at
              IS NULL
      `).bind(
        adminUser.id,
      ),
    ]);

    const response =
      NextResponse.json({
        message:
          alreadyConfigured
            ? "La contraseña administrativa fue cambiada correctamente. Iniciá sesión nuevamente."
            : "La contraseña administrativa fue configurada correctamente.",

        admin: {
          id:
            adminUser.id,

          username:
            adminUser.username,

          displayName:
            adminUser.display_name,

          role:
            adminUser.role,

          hasPassword:
            true,
        },

        requiresLogin:
          true,
      });

    /*
     * La contraseña cambió y todas las
     * sesiones fueron revocadas.
     */
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
      "Error al configurar contraseña administrativa:",
      error,
    );

    return NextResponse.json(
      {
        error:
          "No se pudo configurar la contraseña administrativa.",
      },
      {
        status: 500,
      },
    );
  }
}