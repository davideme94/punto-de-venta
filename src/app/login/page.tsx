"use client";

import Link from "next/link";

import {
  type FormEvent,
  useEffect,
  useMemo,
  useState,
} from "react";

import styles from "./login.module.css";

type AvailableUser = {
  id: string;
  username: string;
  displayName: string;
  role: string;
  active: boolean;
  hasPin: boolean;
};

type OpenRegisterSession = {
  id: string;
  registerId: string | null;
  registerCode: string | null;
  registerName: string | null;
  businessDate: string | null;
  openingAmount: number | null;
  confirmationStatus: string | null;
  confirmedAmount: number | null;
  confirmationDifference: number | null;
  confirmedAt: string | null;
  confirmationNotes?: string | null;
  requiresConfirmation: boolean;
};

type AuthenticatedUser = {
  id: string;
  username: string;
  displayName: string;
  role: string;
};

type UsersResponse = {
  users?: AvailableUser[];
  error?: string;
};

type LoginResponse = {
  message?: string;
  user?: AuthenticatedUser;
  openRegisterSession?: OpenRegisterSession | null;
  hasAssignedRegister?: boolean;
  error?: string;
};

type MeResponse = {
  authenticated: boolean;
  user?: AuthenticatedUser;
  openRegisterSession?: OpenRegisterSession | null;
  hasAssignedRegister?: boolean;
  error?: string;
};

type ConfirmationResponse = {
  message?: string;
  openRegisterSession?: OpenRegisterSession;
  error?: string;
};

function formatMoney(
  value: number | null | undefined,
): string {
  if (
    value === null ||
    value === undefined
  ) {
    return "—";
  }

  return new Intl.NumberFormat(
    "es-AR",
    {
      style: "currency",
      currency: "ARS",
      maximumFractionDigits: 2,
    },
  ).format(value);
}

function parseMoney(
  value: string,
): number {
  const trimmedValue =
    value.trim();

  if (!trimmedValue) {
    return Number.NaN;
  }

  const cleanedValue =
    trimmedValue
      .replace(/\$/g, "")
      .replace(/\s/g, "")
      .replace(/\./g, "")
      .replace(",", ".");

  return Number(
    cleanedValue,
  );
}

function formatDate(
  value: string | null | undefined,
): string {
  if (!value) {
    return "—";
  }

  const [
    year,
    month,
    day,
  ] = value
    .split("-")
    .map(Number);

  if (
    !year ||
    !month ||
    !day
  ) {
    return value;
  }

  return new Intl.DateTimeFormat(
    "es-AR",
    {
      timeZone: "UTC",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    },
  ).format(
    new Date(
      Date.UTC(
        year,
        month - 1,
        day,
      ),
    ),
  );
}

export default function LoginPage() {
  const [
    users,
    setUsers,
  ] = useState<AvailableUser[]>([]);

  const [
    selectedUserId,
    setSelectedUserId,
  ] = useState("");

  const [
    pin,
    setPin,
  ] = useState("");

  const [
    currentUser,
    setCurrentUser,
  ] = useState<AuthenticatedUser | null>(
    null,
  );

  const [
    openRegisterSession,
    setOpenRegisterSession,
  ] = useState<OpenRegisterSession | null>(
    null,
  );

  const [
    hasAssignedRegister,
    setHasAssignedRegister,
  ] = useState(false);

  const [
    countedAmount,
    setCountedAmount,
  ] = useState("");

  const [
    confirmationNotes,
    setConfirmationNotes,
  ] = useState("");

  const [
    isLoading,
    setIsLoading,
  ] = useState(true);

  const [
    isSubmitting,
    setIsSubmitting,
  ] = useState(false);

  const [
    isConfirming,
    setIsConfirming,
  ] = useState(false);

  const [
    message,
    setMessage,
  ] = useState(
    "Cargando empleadas...",
  );

  useEffect(() => {
    void initializePage();
  }, []);

  const countedDifference =
    useMemo(() => {
      if (
        !openRegisterSession ||
        openRegisterSession.openingAmount ===
          null
      ) {
        return null;
      }

      const parsedAmount =
        parseMoney(
          countedAmount,
        );

      if (
        !Number.isFinite(
          parsedAmount,
        )
      ) {
        return null;
      }

      return (
        parsedAmount -
        openRegisterSession.openingAmount
      );
    }, [
      countedAmount,
      openRegisterSession,
    ]);

  const receptionCompleted =
    openRegisterSession !== null &&
    !openRegisterSession
      .requiresConfirmation;

  async function initializePage() {
    setIsLoading(true);

    try {
      await Promise.all([
        loadUsers(),
        loadCurrentSession(),
      ]);
    } finally {
      setIsLoading(false);
    }
  }

  async function loadUsers() {
    try {
      const response = await fetch(
        "/api/auth/login",
        {
          method: "GET",
          cache: "no-store",
          credentials: "include",
        },
      );

      const data =
        (await response.json()) as UsersResponse;

      if (!response.ok) {
        throw new Error(
          data.error ||
            "No se pudieron cargar las empleadas.",
        );
      }

      const availableUsers =
        data.users ?? [];

      setUsers(
        availableUsers,
      );

      const firstUserWithPin =
        availableUsers.find(
          (user) =>
            user.hasPin,
        );

      if (firstUserWithPin) {
        setSelectedUserId(
          firstUserWithPin.id,
        );
      }
    } catch (error) {
      console.error(
        "Error al cargar empleadas:",
        error,
      );

      setMessage(
        error instanceof Error
          ? error.message
          : "No se pudieron cargar las empleadas.",
      );
    }
  }

  async function loadCurrentSession() {
    try {
      const response = await fetch(
        "/api/auth/me",
        {
          method: "GET",
          cache: "no-store",
          credentials: "include",
        },
      );

      const data =
        (await response.json()) as MeResponse;

      if (
        !response.ok ||
        !data.authenticated ||
        !data.user
      ) {
        setCurrentUser(
          null,
        );

        setOpenRegisterSession(
          null,
        );

        setHasAssignedRegister(
          false,
        );

        setCountedAmount(
          "",
        );

        setConfirmationNotes(
          "",
        );

        setMessage(
          "Seleccioná tu nombre e ingresá tu PIN.",
        );

        return;
      }

      setCurrentUser(
        data.user,
      );

      setOpenRegisterSession(
        data.openRegisterSession ??
          null,
      );

      setHasAssignedRegister(
        data.hasAssignedRegister ===
          true,
      );

      setMessage(
        `Sesión iniciada como ${data.user.displayName}.`,
      );
    } catch (error) {
      console.error(
        "Error al comprobar sesión:",
        error,
      );

      setCurrentUser(
        null,
      );

      setOpenRegisterSession(
        null,
      );

      setHasAssignedRegister(
        false,
      );

      setMessage(
        "Seleccioná tu nombre e ingresá tu PIN.",
      );
    }
  }

  async function handleLogin(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    if (!selectedUserId) {
      setMessage(
        "Seleccioná una empleada.",
      );

      return;
    }

    if (
      !/^\d{4,8}$/.test(
        pin,
      )
    ) {
      setMessage(
        "El PIN debe contener entre 4 y 8 números.",
      );

      return;
    }

    setIsSubmitting(
      true,
    );

    setMessage(
      "Iniciando sesión...",
    );

    try {
      const response = await fetch(
        "/api/auth/login",
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json",
          },

          credentials: "include",

          body: JSON.stringify({
            userId:
              selectedUserId,

            pin,

            deviceName:
              "Punto de venta web",
          }),
        },
      );

      const data =
        (await response.json()) as LoginResponse;

      if (!response.ok) {
        throw new Error(
          data.error ||
            "No se pudo iniciar sesión.",
        );
      }

      setPin(
        "",
      );

      setCountedAmount(
        "",
      );

      setConfirmationNotes(
        "",
      );

      await loadCurrentSession();

      setMessage(
        data.message ||
          "Sesión iniciada correctamente.",
      );
    } catch (error) {
      console.error(
        "Error al iniciar sesión:",
        error,
      );

      setMessage(
        error instanceof Error
          ? error.message
          : "No se pudo iniciar sesión.",
      );
    } finally {
      setIsSubmitting(
        false,
      );
    }
  }

  async function handleConfirmation(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    const parsedAmount =
      parseMoney(
        countedAmount,
      );

    if (
      !Number.isFinite(
        parsedAmount,
      ) ||
      parsedAmount < 0
    ) {
      setMessage(
        "Ingresá cuánto dinero contaste realmente.",
      );

      return;
    }

    if (
      countedDifference !== null &&
      countedDifference !== 0 &&
      !confirmationNotes.trim()
    ) {
      setMessage(
        "Hay una diferencia. Escribí una observación antes de confirmar.",
      );

      return;
    }

    setIsConfirming(
      true,
    );

    setMessage(
      "Confirmando recepción de caja...",
    );

    try {
      const response = await fetch(
        "/api/registers/confirmation",
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json",
          },

          credentials: "include",

          body: JSON.stringify({
            countedAmount:
              parsedAmount,

            notes:
              confirmationNotes.trim(),
          }),
        },
      );

      const data =
        (await response.json()) as ConfirmationResponse;

      if (!response.ok) {
        throw new Error(
          data.error ||
            "No se pudo confirmar la caja.",
        );
      }

      if (
        data.openRegisterSession
      ) {
        setOpenRegisterSession(
          data.openRegisterSession,
        );
      } else {
        await loadCurrentSession();
      }

      setCountedAmount(
        "",
      );

      setConfirmationNotes(
        "",
      );

      setMessage(
        data.message ||
          "La caja fue confirmada correctamente.",
      );
    } catch (error) {
      console.error(
        "Error al confirmar caja:",
        error,
      );

      setMessage(
        error instanceof Error
          ? error.message
          : "No se pudo confirmar la caja.",
      );
    } finally {
      setIsConfirming(
        false,
      );
    }
  }

  async function handleLogout() {
    setIsSubmitting(
      true,
    );

    setMessage(
      "Cerrando sesión...",
    );

    try {
      const response = await fetch(
        "/api/auth/logout",
        {
          method: "POST",
          credentials: "include",
        },
      );

      const data =
        (await response.json()) as {
          message?: string;
          error?: string;
        };

      if (!response.ok) {
        throw new Error(
          data.error ||
            "No se pudo cerrar la sesión.",
        );
      }

      setCurrentUser(
        null,
      );

      setOpenRegisterSession(
        null,
      );

      setHasAssignedRegister(
        false,
      );

      setPin(
        "",
      );

      setCountedAmount(
        "",
      );

      setConfirmationNotes(
        "",
      );

      setMessage(
        data.message ||
          "Sesión cerrada correctamente.",
      );
    } catch (error) {
      console.error(
        "Error al cerrar sesión:",
        error,
      );

      setMessage(
        error instanceof Error
          ? error.message
          : "No se pudo cerrar la sesión.",
      );
    } finally {
      setIsSubmitting(
        false,
      );
    }
  }

  const selectedUser =
    users.find(
      (user) =>
        user.id ===
        selectedUserId,
    );

  return (
    <main className={styles.page}>
      <section className={styles.shell}>
        <header className={styles.header}>
          <div>
            <p className={styles.eyebrow}>
              PUNTO DE VENTA
            </p>

            <h1>
              Ingreso de cajera
            </h1>

            <p>
              Ingresá con tu nombre y
              tu PIN personal.
            </p>
          </div>

          <Link
            href="/"
            className={styles.backLink}
          >
            Volver
          </Link>
        </header>

        <div className={styles.message}>
          {message}
        </div>

        {isLoading ? (
          <section
            className={styles.loadingCard}
          >
            Cargando...
          </section>
        ) : currentUser ? (
          <section
            className={styles.sessionCard}
          >
            <div
              className={
                styles.userHeader
              }
            >
              <div
                className={styles.avatar}
              >
                {currentUser.displayName
                  .slice(0, 1)
                  .toUpperCase()}
              </div>

              <div>
                <span>
                  SESIÓN INICIADA
                </span>

                <h2>
                  Hola,{" "}
                  {
                    currentUser.displayName
                  }
                </h2>

                <p>
                  Usuario:{" "}
                  {
                    currentUser.username
                  }
                </p>
              </div>
            </div>

            {hasAssignedRegister &&
            openRegisterSession ? (
              <div
                className={
                  styles.registerCard
                }
              >
                <div
                  className={
                    styles.registerHeader
                  }
                >
                  <div>
                    <span>
                      CAJA ASIGNADA
                    </span>

                    <h3>
                      {
                        openRegisterSession
                          .registerName
                      }
                    </h3>
                  </div>

                  <strong
                    className={
                      styles.openBadge
                    }
                  >
                    ABIERTA
                  </strong>
                </div>

                <div
                  className={
                    styles.infoGrid
                  }
                >
                  <div>
                    <span>
                      Día comercial
                    </span>

                    <strong>
                      {formatDate(
                        openRegisterSession
                          .businessDate,
                      )}
                    </strong>
                  </div>

                  <div>
                    <span>
                      Monto informado
                    </span>

                    <strong>
                      {formatMoney(
                        openRegisterSession
                          .openingAmount,
                      )}
                    </strong>
                  </div>
                </div>

                {openRegisterSession
                  .requiresConfirmation ? (
                  <>
                    <div
                      className={
                        styles.pendingNotice
                      }
                    >
                      <strong>
                        Recepción pendiente
                      </strong>

                      <p>
                        Contá el dinero
                        físico antes de
                        comenzar a vender.
                      </p>
                    </div>

                    <form
                      className={
                        styles.confirmationForm
                      }
                      onSubmit={
                        handleConfirmation
                      }
                    >
                      <label
                        className={
                          styles.field
                        }
                      >
                        <span>
                          ¿Cuánto dinero
                          contaste realmente?
                        </span>

                        <input
                          value={
                            countedAmount
                          }
                          onChange={(
                            event,
                          ) =>
                            setCountedAmount(
                              event.target
                                .value,
                            )
                          }
                          inputMode="decimal"
                          placeholder="Ejemplo: 100000"
                          autoFocus
                        />
                      </label>

                      {countedDifference !==
                        null && (
                        <div
                          className={`${styles.differencePreview} ${
                            countedDifference ===
                            0
                              ? styles.differenceNeutral
                              : countedDifference >
                                  0
                                ? styles.differencePositive
                                : styles.differenceNegative
                          }`}
                        >
                          <span>
                            Diferencia
                          </span>

                          <strong>
                            {countedDifference >
                            0
                              ? "+"
                              : ""}

                            {formatMoney(
                              countedDifference,
                            )}
                          </strong>
                        </div>
                      )}

                      {countedDifference !==
                        null &&
                        countedDifference !==
                          0 && (
                          <label
                            className={
                              styles.field
                            }
                          >
                            <span>
                              Explicación de
                              la diferencia
                            </span>

                            <textarea
                              value={
                                confirmationNotes
                              }
                              onChange={(
                                event,
                              ) =>
                                setConfirmationNotes(
                                  event.target
                                    .value,
                                )
                              }
                              placeholder="Ejemplo: faltan billetes, el monto inicial fue informado incorrectamente..."
                            />
                          </label>
                        )}

                      <button
                        type="submit"
                        className={
                          styles.confirmButton
                        }
                        disabled={
                          isConfirming
                        }
                      >
                        {isConfirming
                          ? "Confirmando..."
                          : "Confirmar recepción de caja"}
                      </button>
                    </form>
                  </>
                ) : (
                  <div
                    className={
                      styles.confirmedNotice
                    }
                  >
                    <strong>
                      {openRegisterSession
                        .confirmationStatus ===
                      "OBSERVADA"
                        ? "Caja recibida con diferencia"
                        : "Caja confirmada"}
                    </strong>

                    <p>
                      Monto contado:{" "}
                      {formatMoney(
                        openRegisterSession
                          .confirmedAmount,
                      )}
                    </p>

                    <p>
                      Diferencia:{" "}
                      {openRegisterSession
                        .confirmationDifference !==
                        null &&
                      openRegisterSession
                        .confirmationDifference >
                        0
                        ? "+"
                        : ""}

                      {formatMoney(
                        openRegisterSession
                          .confirmationDifference,
                      )}
                    </p>

                    {openRegisterSession
                      .confirmationNotes && (
                      <p>
                        Observación:{" "}
                        {
                          openRegisterSession
                            .confirmationNotes
                        }
                      </p>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div
                className={
                  styles.noRegisterNotice
                }
              >
                <strong>
                  No tenés una caja
                  asignada
                </strong>

                <p>
                  El administrador debe
                  realizar la apertura y
                  asignarte una caja
                  física.
                </p>
              </div>
            )}

            <div
              className={
                styles.sessionActions
              }
            >
              <button
                type="button"
                className={
                  styles.logoutButton
                }
                onClick={
                  handleLogout
                }
                disabled={
                  isSubmitting ||
                  isConfirming
                }
              >
                Cerrar sesión
              </button>

              {receptionCompleted ? (
                <Link
                  href="/"
                  className={
                    styles.continueLink
                  }
                >
                  Ir al punto de venta
                </Link>
              ) : (
                <span
                  className={
                    styles.lockedContinue
                  }
                >
                  Primero confirmá la caja
                </span>
              )}
            </div>
          </section>
        ) : (
          <form
            className={
              styles.loginCard
            }
            onSubmit={
              handleLogin
            }
          >
            <div
              className={
                styles.formIntroduction
              }
            >
              <div
                className={
                  styles.loginIcon
                }
              >
                🔐
              </div>

              <div>
                <h2>
                  Iniciar sesión
                </h2>

                <p>
                  Cada operación quedará
                  registrada a nombre de
                  la empleada conectada.
                </p>
              </div>
            </div>

            <label
              className={
                styles.field
              }
            >
              <span>
                Empleada
              </span>

              <select
                value={
                  selectedUserId
                }
                onChange={(
                  event,
                ) => {
                  setSelectedUserId(
                    event.target.value,
                  );

                  setPin(
                    "",
                  );
                }}
              >
                <option value="">
                  Seleccionar empleada
                </option>

                {users.map(
                  (user) => (
                    <option
                      key={
                        user.id
                      }
                      value={
                        user.id
                      }
                      disabled={
                        !user.hasPin
                      }
                    >
                      {
                        user.displayName
                      }

                      {!user.hasPin
                        ? " — SIN PIN"
                        : ""}
                    </option>
                  ),
                )}
              </select>
            </label>

            <label
              className={
                styles.field
              }
            >
              <span>
                PIN personal
              </span>

              <input
                type="password"
                value={
                  pin
                }
                onChange={(
                  event,
                ) =>
                  setPin(
                    event.target.value
                      .replace(
                        /\D/g,
                        "",
                      )
                      .slice(
                        0,
                        8,
                      ),
                  )
                }
                inputMode="numeric"
                autoComplete="current-password"
                placeholder="Ingresá tu PIN"
                maxLength={
                  8
                }
              />
            </label>

            {selectedUser &&
              !selectedUser.hasPin && (
                <div
                  className={
                    styles.noPinNotice
                  }
                >
                  Esta empleada todavía
                  no tiene un PIN
                  configurado.
                </div>
              )}

            <button
              type="submit"
              className={
                styles.loginButton
              }
              disabled={
                isSubmitting ||
                !selectedUserId ||
                !selectedUser
                  ?.hasPin
              }
            >
              {isSubmitting
                ? "Ingresando..."
                : "Ingresar"}
            </button>
          </form>
        )}

        <footer
          className={
            styles.footer
          }
        >
          <span>
            Acceso para cajeras
          </span>

          <Link
            href="/registers/opening"
          >
            Apertura administrativa
          </Link>
        </footer>
      </section>
    </main>
  );
}