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

export type CashierConfirmationStatus =
  | "PENDIENTE"
  | "CONFIRMADA"
  | "OBSERVADA";

export type AuthenticatedCashier = {
  loginSessionId: string;

  userId: string;
  username: string;
  displayName: string;
  role: "CAJERO";

  physicalSessionId: string | null;

  registerId: string | null;
  registerCode: string | null;
  registerName: string | null;

  businessDate: string | null;

  openingAmountCents: number | null;

  confirmationStatus:
    | CashierConfirmationStatus
    | null;

  confirmedAmountCents:
    | number
    | null;

  confirmationDifferenceCents:
    | number
    | null;
};

type AuthenticatedCashierRow = {
  login_session_id: string;

  user_id: string;
  username: string;
  display_name: string;
  role: string;

  physical_session_id:
    | string
    | null;

  register_id:
    | string
    | null;

  register_code:
    | string
    | null;

  register_name:
    | string
    | null;

  business_date:
    | string
    | null;

  opening_amount_cents:
    | number
    | null;

  confirmation_status:
    | CashierConfirmationStatus
    | null;

  confirmed_amount_cents:
    | number
    | null;

  confirmation_difference_cents:
    | number
    | null;
};

/*
 * Busca la cajera conectada y su caja
 * física actualmente abierta.
 *
 * La caja puede estar:
 *
 * - PENDIENTE;
 * - CONFIRMADA;
 * - OBSERVADA.
 *
 * La API que utilice este ayudante
 * decidirá qué estados están permitidos.
 */
export async function getAuthenticatedCashier(
  request: NextRequest,
): Promise<AuthenticatedCashier | null> {
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

  const cashier =
    await env.DB.prepare(`
      SELECT
        login_sessions.id
          AS login_session_id,

        users.id
          AS user_id,

        users.username,
        users.display_name,
        users.role,

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
          AS confirmation_difference_cents

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

        AND registers.active = 1

      WHERE
        login_sessions.token_hash = ?

        AND login_sessions.revoked_at
            IS NULL

        AND login_sessions.expires_at >
            CURRENT_TIMESTAMP

        AND users.active = 1

        AND users.role = 'CAJERO'

      LIMIT 1
    `)
      .bind(
        tokenHash,
      )
      .first<AuthenticatedCashierRow>();

  if (
    !cashier ||
    cashier.role !== "CAJERO"
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
      cashier.login_session_id,
    )
    .run();

  return {
    loginSessionId:
      cashier.login_session_id,

    userId:
      cashier.user_id,

    username:
      cashier.username,

    displayName:
      cashier.display_name,

    role:
      "CAJERO",

    physicalSessionId:
      cashier.physical_session_id,

    registerId:
      cashier.register_id,

    registerCode:
      cashier.register_code,

    registerName:
      cashier.register_name,

    businessDate:
      cashier.business_date,

    openingAmountCents:
      cashier.opening_amount_cents,

    confirmationStatus:
      cashier.confirmation_status,

    confirmedAmountCents:
      cashier.confirmed_amount_cents,

    confirmationDifferenceCents:
      cashier
        .confirmation_difference_cents,
  };
}