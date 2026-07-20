"use client";

import Link from "next/link";

import AdminNavigation from "@/components/admin-navigation/AdminNavigation";

import {
  type FormEvent,
  useEffect,
  useMemo,
  useState,
} from "react";

import styles from "./opening.module.css";

type Cashier = {
  id: string;
  username: string;
  displayName: string;
  role: string;
  active: boolean;
};

type PhysicalRegister = {
  id: string;
  code: string;
  name: string;
  active: boolean;
};

type VirtualAccount = {
  id: string;
  code: string;
  name: string;
  active: boolean;
};

type PhysicalSession = {
  id: string;
  registerId: string;
  registerCode: string;
  registerName: string;
  responsibleUserId: string;
  responsibleUsername: string;
  responsibleName: string;
  businessDate: string;
  openingAmount: number;
  status: string;
  openedAt: string;
  openedByUserId: string;
  openedByName: string;
  openingNotes: string | null;
};

type VirtualSession = {
  id: string;
  virtualAccountId: string;
  virtualAccountCode: string;
  virtualAccountName: string;
  businessDate: string;
  openingBalance: number;
  status: string;
  openedAt: string;
  openedByUserId: string;
  openedByName: string;
  openingNotes: string | null;
};

type OpeningData = {
  businessDate: string;
  cashiers: Cashier[];
  physicalRegisters: PhysicalRegister[];
  virtualAccounts: VirtualAccount[];
  openPhysicalSessions: PhysicalSession[];
  openVirtualSession: VirtualSession | null;
  error?: string;
};

type OpeningResponse = {
  message?: string;
  businessDate?: string;
  physicalSessions?: PhysicalSession[];
  virtualSession?: VirtualSession | null;
  error?: string;
};

type RegisterForm = {
  registerId: string;
  responsibleUserId: string;
  openingAmount: string;
  openingNotes: string;
};

function formatMoney(
  value: number,
): string {
  return new Intl.NumberFormat(
    "es-AR",
    {
      style: "currency",
      currency: "ARS",
      maximumFractionDigits: 0,
    },
  ).format(value);
}

function parseMoney(
  value: string,
): number {
  const cleanedValue = value
    .replace(/\$/g, "")
    .replace(/\s/g, "")
    .replace(/\./g, "")
    .replace(",", ".");

  return Number(cleanedValue);
}

function formatDate(
  value: string,
): string {
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

function formatDateTime(
  value: string,
): string {
  const normalizedValue =
    value.includes("T")
      ? value
      : value.replace(" ", "T");

  const date = new Date(
    `${normalizedValue}Z`,
  );

  if (
    Number.isNaN(
      date.getTime(),
    )
  ) {
    return value;
  }

  return new Intl.DateTimeFormat(
    "es-AR",
    {
      timeZone:
        "America/Argentina/Buenos_Aires",

      day: "2-digit",
      month: "2-digit",
      year: "numeric",

      hour: "2-digit",
      minute: "2-digit",
    },
  ).format(date);
}

export default function OpeningPage() {
  const [
    openingData,
    setOpeningData,
  ] = useState<OpeningData | null>(
    null,
  );

  const [
    businessDate,
    setBusinessDate,
  ] = useState("");

  const [
    registerForms,
    setRegisterForms,
  ] = useState<RegisterForm[]>([]);

  const [
    virtualOpeningBalance,
    setVirtualOpeningBalance,
  ] = useState("");

  const [
    virtualOpeningNotes,
    setVirtualOpeningNotes,
  ] = useState("");

  const [
    isLoading,
    setIsLoading,
  ] = useState(true);

  const [
    isSaving,
    setIsSaving,
  ] = useState(false);

  const [
    message,
    setMessage,
  ] = useState(
    "Cargando información de las cajas...",
  );

  useEffect(() => {
    void loadOpeningData();
  }, []);

  const hasOpenSessions =
    useMemo(() => {
      if (!openingData) {
        return false;
      }

      return (
        openingData
          .openPhysicalSessions
          .length > 0 ||
        openingData
          .openVirtualSession !== null
      );
    }, [openingData]);

  async function loadOpeningData() {
    setIsLoading(true);

    try {
      const response = await fetch(
        "/api/registers/opening",
        {
          cache: "no-store",
        },
      );

      const data =
        (await response.json()) as OpeningData;

      if (!response.ok) {
        throw new Error(
          data.error ||
            "No se pudo cargar la apertura.",
        );
      }

      setOpeningData(data);
      setBusinessDate(
        data.businessDate,
      );

      setRegisterForms(
        data.physicalRegisters.map(
          (register) => ({
            registerId:
              register.id,

            responsibleUserId:
              "",

            openingAmount:
              "",

            openingNotes:
              "",
          }),
        ),
      );

      if (
        data.openPhysicalSessions
          .length > 0 ||
        data.openVirtualSession
      ) {
        setMessage(
          "Las cajas ya tienen una apertura activa.",
        );
      } else {
        setMessage(
          "Seleccioná las dos cajeras e ingresá los saldos iniciales.",
        );
      }
    } catch (error) {
      console.error(
        "Error al cargar apertura:",
        error,
      );

      setMessage(
        error instanceof Error
          ? error.message
          : "No se pudo cargar la apertura.",
      );
    } finally {
      setIsLoading(false);
    }
  }

  function updateRegisterForm(
    registerId: string,
    field: keyof RegisterForm,
    value: string,
  ) {
    setRegisterForms(
      (currentForms) =>
        currentForms.map(
          (form) =>
            form.registerId ===
            registerId
              ? {
                  ...form,
                  [field]: value,
                }
              : form,
        ),
    );
  }

  function getAvailableCashiers(
    currentRegisterId: string,
  ): Cashier[] {
    if (!openingData) {
      return [];
    }

    const selectedByOtherRegisters =
      registerForms
        .filter(
          (form) =>
            form.registerId !==
            currentRegisterId,
        )
        .map(
          (form) =>
            form.responsibleUserId,
        )
        .filter(Boolean);

    return openingData.cashiers.filter(
      (cashier) =>
        !selectedByOtherRegisters.includes(
          cashier.id,
        ),
    );
  }

  async function submitOpening(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    if (!openingData) {
      return;
    }

    if (
      registerForms.length !== 2
    ) {
      setMessage(
        "Deben existir exactamente dos cajas físicas.",
      );
      return;
    }

    const selectedCashiers =
      registerForms.map(
        (form) =>
          form.responsibleUserId,
      );

    if (
      selectedCashiers.some(
        (userId) => !userId,
      )
    ) {
      setMessage(
        "Seleccioná una cajera para cada caja.",
      );
      return;
    }

    if (
      new Set(selectedCashiers)
        .size !== 2
    ) {
      setMessage(
        "La misma cajera no puede estar asignada a las dos cajas.",
      );
      return;
    }

    const preparedAssignments =
      registerForms.map(
        (form) => ({
          registerId:
            form.registerId,

          responsibleUserId:
            form.responsibleUserId,

          openingAmount:
            parseMoney(
              form.openingAmount,
            ),

          openingNotes:
            form.openingNotes.trim(),
        }),
      );

    const hasInvalidAmount =
      preparedAssignments.some(
        (assignment) =>
          !Number.isFinite(
            assignment.openingAmount,
          ) ||
          assignment.openingAmount < 0,
      );

    if (hasInvalidAmount) {
      setMessage(
        "Ingresá un importe inicial válido para cada caja física.",
      );
      return;
    }

    const parsedVirtualBalance =
      parseMoney(
        virtualOpeningBalance,
      );

    if (
      !Number.isFinite(
        parsedVirtualBalance,
      ) ||
      parsedVirtualBalance < 0
    ) {
      setMessage(
        "Ingresá un saldo inicial válido para la caja virtual.",
      );
      return;
    }

    const virtualAccount =
      openingData
        .virtualAccounts[0];

    if (!virtualAccount) {
      setMessage(
        "No se encontró la caja virtual.",
      );
      return;
    }

    setIsSaving(true);

    setMessage(
      "Abriendo las cajas...",
    );

    try {
      const response = await fetch(
        "/api/registers/opening",
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json",
          },

          body: JSON.stringify({
            businessDate,

            assignments:
              preparedAssignments,

            virtualAccountId:
              virtualAccount.id,

            virtualOpeningBalance:
              parsedVirtualBalance,

            virtualOpeningNotes:
              virtualOpeningNotes.trim(),

            openedByUserId:
              "user-admin",
          }),
        },
      );

      const data =
        (await response.json()) as OpeningResponse;

      if (!response.ok) {
        throw new Error(
          data.error ||
            "No se pudieron abrir las cajas.",
        );
      }

      setMessage(
        data.message ||
          "Las cajas fueron abiertas correctamente.",
      );

      await loadOpeningData();
    } catch (error) {
      console.error(
        "Error al abrir cajas:",
        error,
      );

      setMessage(
        error instanceof Error
          ? error.message
          : "No se pudieron abrir las cajas.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <main className={styles.page}>
      <AdminNavigation />

      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>
            CONTROL DE CAJAS
          </p>

          <h1 className={styles.title}>
            Apertura diaria
          </h1>

          <p className={styles.subtitle}>
            Asigná las cajeras y registrá
            los saldos iniciales.
          </p>
        </div>

      </header>

      <section
        className={styles.datePanel}
      >
        <div>
          <span>
            Día comercial
          </span>

          <strong>
            {businessDate
              ? formatDate(
                  businessDate,
                )
              : "—"}
          </strong>
        </div>

        {!hasOpenSessions && (
          <label
            className={
              styles.dateField
            }
          >
            <span>Fecha</span>

            <input
              type="date"
              value={businessDate}
              onChange={(event) =>
                setBusinessDate(
                  event.target.value,
                )
              }
            />
          </label>
        )}
      </section>

      <div
        className={
          styles.message
        }
      >
        {message}
      </div>

      {isLoading ? (
        <section
          className={
            styles.loadingPanel
          }
        >
          Cargando cajas...
        </section>
      ) : hasOpenSessions &&
        openingData ? (
        <section
          className={
            styles.openSessionsSection
          }
        >
          <div
            className={
              styles.sectionHeader
            }
          >
            <div>
              <p
                className={
                  styles.sectionEyebrow
                }
              >
                APERTURA ACTIVA
              </p>

              <h2>
                Cajas actualmente abiertas
              </h2>
            </div>

            <span
              className={
                styles.openBadge
              }
            >
              ABIERTAS
            </span>
          </div>

          <div
            className={
              styles.registerGrid
            }
          >
            {openingData
              .openPhysicalSessions
              .map((session) => (
                <article
                  key={session.id}
                  className={
                    styles.openRegisterCard
                  }
                >
                  <div
                    className={
                      styles.cardHeader
                    }
                  >
                    <div>
                      <span>
                        CAJA FÍSICA
                      </span>

                      <h3>
                        {
                          session.registerName
                        }
                      </h3>
                    </div>

                    <span
                      className={
                        styles.sessionStatus
                      }
                    >
                      {
                        session.status
                      }
                    </span>
                  </div>

                  <div
                    className={
                      styles.cashierInfo
                    }
                  >
                    <span>
                      Responsable
                    </span>

                    <strong>
                      {
                        session.responsibleName
                      }
                    </strong>
                  </div>

                  <div
                    className={
                      styles.amountInfo
                    }
                  >
                    <span>
                      Efectivo inicial
                    </span>

                    <strong>
                      {formatMoney(
                        session.openingAmount,
                      )}
                    </strong>
                  </div>

                  <div
                    className={
                      styles.sessionMeta
                    }
                  >
                    <span>
                      Apertura:{" "}
                      {formatDateTime(
                        session.openedAt,
                      )}
                    </span>

                    <span>
                      Abierta por:{" "}
                      {
                        session.openedByName
                      }
                    </span>
                  </div>

                  {session.openingNotes && (
                    <p
                      className={
                        styles.notes
                      }
                    >
                      {
                        session.openingNotes
                      }
                    </p>
                  )}
                </article>
              ))}

            {openingData
              .openVirtualSession && (
              <article
                className={`${styles.openRegisterCard} ${styles.virtualCard}`}
              >
                <div
                  className={
                    styles.cardHeader
                  }
                >
                  <div>
                    <span>
                      SALDO COMPARTIDO
                    </span>

                    <h3>
                      {
                        openingData
                          .openVirtualSession
                          .virtualAccountName
                      }
                    </h3>
                  </div>

                  <span
                    className={
                      styles.sessionStatus
                    }
                  >
                    {
                      openingData
                        .openVirtualSession
                        .status
                    }
                  </span>
                </div>

                <div
                  className={
                    styles.amountInfo
                  }
                >
                  <span>
                    Saldo virtual inicial
                  </span>

                  <strong>
                    {formatMoney(
                      openingData
                        .openVirtualSession
                        .openingBalance,
                    )}
                  </strong>
                </div>

                <div
                  className={
                    styles.sessionMeta
                  }
                >
                  <span>
                    Apertura:{" "}
                    {formatDateTime(
                      openingData
                        .openVirtualSession
                        .openedAt,
                    )}
                  </span>

                  <span>
                    Abierta por:{" "}
                    {
                      openingData
                        .openVirtualSession
                        .openedByName
                    }
                  </span>
                </div>

                {openingData
                  .openVirtualSession
                  .openingNotes && (
                  <p
                    className={
                      styles.notes
                    }
                  >
                    {
                      openingData
                        .openVirtualSession
                        .openingNotes
                    }
                  </p>
                )}
              </article>
            )}
          </div>

          <p
            className={
              styles.activeNotice
            }
          >
            Para realizar una nueva
            apertura primero deberán
            cerrarse estas sesiones.
          </p>
        </section>
      ) : (
        <form
          className={
            styles.openingForm
          }
          onSubmit={submitOpening}
        >
          <section
            className={
              styles.formSection
            }
          >
            <div
              className={
                styles.sectionHeader
              }
            >
              <div>
                <p
                  className={
                    styles.sectionEyebrow
                  }
                >
                  CAJAS FÍSICAS
                </p>

                <h2>
                  Asignación de cajeras
                </h2>
              </div>
            </div>

            <div
              className={
                styles.registerGrid
              }
            >
              {openingData
                ?.physicalRegisters
                .map((register) => {
                  const form =
                    registerForms.find(
                      (item) =>
                        item.registerId ===
                        register.id,
                    );

                  if (!form) {
                    return null;
                  }

                  return (
                    <article
                      key={register.id}
                      className={
                        styles.registerCard
                      }
                    >
                      <div
                        className={
                          styles.cardHeader
                        }
                      >
                        <div>
                          <span>
                            CAJA FÍSICA
                          </span>

                          <h3>
                            {
                              register.name
                            }
                          </h3>
                        </div>

                        <span
                          className={
                            styles.registerCode
                          }
                        >
                          {
                            register.code
                          }
                        </span>
                      </div>

                      <label
                        className={
                          styles.field
                        }
                      >
                        <span>
                          Cajera responsable
                        </span>

                        <select
                          value={
                            form.responsibleUserId
                          }
                          onChange={(
                            event,
                          ) =>
                            updateRegisterForm(
                              register.id,
                              "responsibleUserId",
                              event.target
                                .value,
                            )
                          }
                        >
                          <option value="">
                            Seleccionar
                            empleada
                          </option>

                          {getAvailableCashiers(
                            register.id,
                          ).map(
                            (cashier) => (
                              <option
                                key={
                                  cashier.id
                                }
                                value={
                                  cashier.id
                                }
                              >
                                {
                                  cashier.displayName
                                }
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
                          Efectivo inicial
                        </span>

                        <input
                          value={
                            form.openingAmount
                          }
                          onChange={(
                            event,
                          ) =>
                            updateRegisterForm(
                              register.id,
                              "openingAmount",
                              event.target
                                .value,
                            )
                          }
                          inputMode="decimal"
                          placeholder="Ejemplo: 100000"
                        />
                      </label>

                      <label
                        className={
                          styles.field
                        }
                      >
                        <span>
                          Observación
                          opcional
                        </span>

                        <textarea
                          value={
                            form.openingNotes
                          }
                          onChange={(
                            event,
                          ) =>
                            updateRegisterForm(
                              register.id,
                              "openingNotes",
                              event.target
                                .value,
                            )
                          }
                          placeholder="Detalle de la apertura"
                        />
                      </label>
                    </article>
                  );
                })}
            </div>
          </section>

          <section
            className={
              styles.formSection
            }
          >
            <div
              className={
                styles.sectionHeader
              }
            >
              <div>
                <p
                  className={
                    styles.sectionEyebrow
                  }
                >
                  CAJA COMPARTIDA
                </p>

                <h2>
                  Apertura virtual
                </h2>
              </div>
            </div>

            <article
              className={
                styles.virtualOpeningCard
              }
            >
              <div>
                <span
                  className={
                    styles.virtualLabel
                  }
                >
                  SALDO DIGITAL
                </span>

                <h3>
                  {openingData
                    ?.virtualAccounts[0]
                    ?.name ??
                    "Caja Virtual"}
                </h3>

                <p>
                  Este saldo es único y
                  será compartido por las
                  dos cajeras.
                </p>
              </div>

              <div
                className={
                  styles.virtualFields
                }
              >
                <label
                  className={
                    styles.field
                  }
                >
                  <span>
                    Saldo virtual inicial
                  </span>

                  <input
                    value={
                      virtualOpeningBalance
                    }
                    onChange={(event) =>
                      setVirtualOpeningBalance(
                        event.target.value,
                      )
                    }
                    inputMode="decimal"
                    placeholder="Ejemplo: 500000"
                  />
                </label>

                <label
                  className={
                    styles.field
                  }
                >
                  <span>
                    Observación opcional
                  </span>

                  <textarea
                    value={
                      virtualOpeningNotes
                    }
                    onChange={(event) =>
                      setVirtualOpeningNotes(
                        event.target.value,
                      )
                    }
                    placeholder="Detalle del saldo informado"
                  />
                </label>
              </div>
            </article>
          </section>

          <div
            className={
              styles.formActions
            }
          >
            <Link
              href="/"
              className={
                styles.cancelLink
              }
            >
              Cancelar
            </Link>

            <button
              type="submit"
              className={
                styles.openButton
              }
              disabled={
                isSaving
              }
            >
              {isSaving
                ? "Abriendo cajas..."
                : "Confirmar apertura"}
            </button>
          </div>
        </form>
      )}
    </main>
  );
}