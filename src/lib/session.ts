export const SESSION_COOKIE_NAME =
  "punto_de_venta_session";

/*
 * La sesión durará 12 horas.
 * Después deberá iniciar sesión nuevamente.
 */
export const SESSION_DURATION_SECONDS =
  60 * 60 * 12;

/*
 * Convierte una fecha al formato utilizado
 * por SQLite/D1:
 *
 * 2026-07-16 23:30:00
 */
export function dateToSqliteUtc(
  date: Date,
): string {
  return date
    .toISOString()
    .slice(0, 19)
    .replace("T", " ");
}

export function createSessionExpiration(): {
  expirationDate: Date;
  expirationSql: string;
} {
  const expirationDate =
    new Date(
      Date.now() +
        SESSION_DURATION_SECONDS *
          1000,
    );

  return {
    expirationDate,

    expirationSql:
      dateToSqliteUtc(
        expirationDate,
      ),
  };
}