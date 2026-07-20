import {
  type NextRequest,
} from "next/server";

import {
  getCloudflareContext,
} from "@opennextjs/cloudflare";

import {
  hashPin,
} from "@/lib/auth";

import {
  getAuthenticatedAdmin,
} from "@/lib/admin-session";

export const dynamic =
  "force-dynamic";

type SetupPinBody = {
  userId?: string;
  pin?: string;
  setupSecret?: string;
};

type UserRow = {
  id: string;
  username: string;
  display_name: string;
  role: string;
  active: number;
  pin_hash: string | null;
  pin_salt: string | null;
  pin_updated_at: string | null;
};

function normalizeText(
  value:
    | string
    | null
    | undefined,
): string {
  return value?.trim() ?? "";
}

function mapUser(
  user: UserRow,
) {
  return {
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
      Boolean(
        user.pin_hash &&
        user.pin_salt,
      ),

    pinUpdatedAt:
      user.pin_updated_at,
  };
}

/*
 * GET /api/auth/setup-pin
 *
 * Devuelve las cajeras y el estado
 * de configuración de sus PIN.
 *
 * Requiere una sesión administrativa.
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
            "Primero debés iniciar sesión como administrador.",
        },
        {
          status: 401,
        },
      );
    }

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
          pin_hash,
          pin_salt,
          pin_updated_at

        FROM app_users

        WHERE
          role = 'CAJERO'

        ORDER BY
          display_name
          COLLATE NOCASE ASC
      `).all<UserRow>();

    return Response.json({
      users:
        result.results.map(
          mapUser,
        ),
    });
  } catch (error) {
    console.error(
      "Error al consultar PIN de cajeras:",
      error,
    );

    return Response.json(
      {
        error:
          "No se pudo cargar la lista de cajeras.",
      },
      {
        status: 500,
      },
    );
  }
}

/*
 * POST /api/auth/setup-pin
 *
 * Configura o reemplaza el PIN
 * de una cajera.
 *
 * Se puede utilizar de dos formas:
 *
 * 1. Desde el panel visual, con una
 *    sesión administrativa activa.
 *
 * 2. Mediante PIN_SETUP_SECRET, para
 *    conservar la configuración inicial
 *    que ya existía en el proyecto.
 */
export async function POST(
  request: NextRequest,
) {
  try {
    let body: SetupPinBody;

    try {
      body =
        (await request.json()) as SetupPinBody;
    } catch {
      return Response.json(
        {
          error:
            "No se pudo leer la información del PIN.",
        },
        {
          status: 400,
        },
      );
    }

    const userId =
      normalizeText(
        body.userId,
      );

    const pin =
      normalizeText(
        body.pin,
      );

    const setupSecret =
      normalizeText(
        body.setupSecret,
      );

    const admin =
      await getAuthenticatedAdmin(
        request,
      );

    const { env } =
      getCloudflareContext();

    /*
     * Cuando no hay una sesión ADMIN,
     * mantiene la validación anterior
     * mediante PIN_SETUP_SECRET.
     */
    if (!admin) {
      const secureEnv =
        env as typeof env & {
          PIN_SETUP_SECRET?:
            string;
        };

      const expectedSecret =
        normalizeText(
          secureEnv
            .PIN_SETUP_SECRET,
        );

      if (!expectedSecret) {
        return Response.json(
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
        !setupSecret ||
        setupSecret !==
          expectedSecret
      ) {
        return Response.json(
          {
            error:
              "La clave administrativa no es válida.",
          },
          {
            status: 403,
          },
        );
      }
    }

    if (!userId) {
      return Response.json(
        {
          error:
            "Falta identificar a la cajera.",
        },
        {
          status: 400,
        },
      );
    }

    /*
     * Permite PIN de 4 a 8 dígitos.
     * Es preferible utilizar 6 dígitos.
     */
    if (
      !/^\d{4,8}$/.test(pin)
    ) {
      return Response.json(
        {
          error:
            "El PIN debe contener entre 4 y 8 números.",
        },
        {
          status: 400,
        },
      );
    }

    const user =
      await env.DB.prepare(`
        SELECT
          id,
          username,
          display_name,
          role,
          active,
          pin_hash,
          pin_salt,
          pin_updated_at

        FROM app_users

        WHERE
          id = ?

          AND role = 'CAJERO'

        LIMIT 1
      `)
        .bind(userId)
        .first<UserRow>();

    if (!user) {
      return Response.json(
        {
          error:
            "La cajera no existe.",
        },
        {
          status: 404,
        },
      );
    }

    if (
      user.active !== 1
    ) {
      return Response.json(
        {
          error:
            "La cajera está desactivada.",
        },
        {
          status: 409,
        },
      );
    }

    const {
      hash,
      salt,
    } = await hashPin(pin);

    await env.DB.prepare(`
      UPDATE app_users

      SET
        pin_hash = ?,
        pin_salt = ?,
        pin_updated_at =
          CURRENT_TIMESTAMP,
        updated_at =
          CURRENT_TIMESTAMP

      WHERE
        id = ?

        AND role = 'CAJERO'
    `)
      .bind(
        hash,
        salt,
        userId,
      )
      .run();

    const updatedUser =
      await env.DB.prepare(`
        SELECT
          id,
          username,
          display_name,
          role,
          active,
          pin_hash,
          pin_salt,
          pin_updated_at

        FROM app_users

        WHERE
          id = ?

        LIMIT 1
      `)
        .bind(userId)
        .first<UserRow>();

    if (!updatedUser) {
      throw new Error(
        "No se pudo volver a leer la cajera actualizada.",
      );
    }

    return Response.json({
      message:
        `PIN configurado correctamente para ${updatedUser.display_name}.`,

      user:
        mapUser(
          updatedUser,
        ),
    });
  } catch (error) {
    console.error(
      "Error al configurar PIN:",
      error,
    );

    return Response.json(
      {
        error:
          "No se pudo configurar el PIN.",
      },
      {
        status: 500,
      },
    );
  }
}
