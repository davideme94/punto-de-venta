"use client";

import {
  type FormEvent,
  useEffect,
  useMemo,
  useState,
} from "react";

import AdminNavigation from "@/components/admin-navigation/AdminNavigation";

import styles from "./users.module.css";

type Cashier = {
  id: string;
  username: string;
  displayName: string;
  role: string;
  active: boolean;
  hasPin: boolean;
  pinUpdatedAt: string | null;
};

type CashiersResponse = {
  users?: Cashier[];
  error?: string;
};

type SetupPinResponse = {
  message?: string;
  user?: Cashier;
  error?: string;
};

function formatDateTime(
  value: string | null,
): string {
  if (!value) {
    return "Nunca";
  }

  const normalizedValue =
    value.includes("T")
      ? value
      : `${value.replace(" ", "T")}Z`;

  const date =
    new Date(
      normalizedValue,
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
      dateStyle: "short",
      timeStyle: "short",
      timeZone:
        "America/Argentina/Buenos_Aires",
    },
  ).format(date);
}

export default function AdminUsersPage() {
  const [cashiers, setCashiers] =
    useState<Cashier[]>([]);

  const [selectedUserId, setSelectedUserId] =
    useState("");

  const [search, setSearch] =
    useState("");

  const [pin, setPin] =
    useState("");

  const [repeatPin, setRepeatPin] =
    useState("");

  const [showPin, setShowPin] =
    useState(false);

  const [message, setMessage] =
    useState(
      "Cargando cajeras...",
    );

  const [messageType, setMessageType] =
    useState<
      | "info"
      | "success"
      | "error"
    >("info");

  const [isLoading, setIsLoading] =
    useState(true);

  const [isSaving, setIsSaving] =
    useState(false);

  const selectedCashier =
    useMemo(() => {
      return (
        cashiers.find(
          (cashier) =>
            cashier.id ===
            selectedUserId,
        ) ?? null
      );
    }, [
      cashiers,
      selectedUserId,
    ]);

  const filteredCashiers =
    useMemo(() => {
      const normalizedSearch =
        search
          .trim()
          .toLowerCase();

      if (!normalizedSearch) {
        return cashiers;
      }

      return cashiers.filter(
        (cashier) =>
          cashier.displayName
            .toLowerCase()
            .includes(
              normalizedSearch,
            ) ||
          cashier.username
            .toLowerCase()
            .includes(
              normalizedSearch,
            ),
      );
    }, [cashiers, search]);

  const configuredCount =
    useMemo(() => {
      return cashiers.filter(
        (cashier) =>
          cashier.hasPin,
      ).length;
    }, [cashiers]);

  useEffect(() => {
    void loadCashiers();
  }, []);

  async function loadCashiers() {
    setIsLoading(true);
    setMessageType("info");
    setMessage(
      "Cargando cajeras...",
    );

    try {
      const response =
        await fetch(
          "/api/auth/setup-pin",
          {
            cache: "no-store",
            credentials:
              "include",
          },
        );

      const data =
        (await response.json()) as CashiersResponse;

      if (
        response.status === 401
      ) {
        window.location.href =
          "/admin/login";

        return;
      }

      if (!response.ok) {
        throw new Error(
          data.error ||
            "No se pudieron cargar las cajeras.",
        );
      }

      const loadedCashiers =
        data.users ?? [];

      setCashiers(
        loadedCashiers,
      );

      setSelectedUserId(
        (currentSelectedId) => {
          const currentStillExists =
            loadedCashiers.some(
              (cashier) =>
                cashier.id ===
                currentSelectedId,
            );

          if (
            currentSelectedId &&
            currentStillExists
          ) {
            return currentSelectedId;
          }

          return (
            loadedCashiers.find(
              (cashier) =>
                !cashier.hasPin &&
                cashier.active,
            )?.id ??
            loadedCashiers[0]?.id ??
            ""
          );
        },
      );

      setMessageType("info");
      setMessage(
        `${loadedCashiers.length} cajeras encontradas.`,
      );
    } catch (error) {
      console.error(error);

      setMessageType("error");
      setMessage(
        error instanceof Error
          ? error.message
          : "No se pudieron cargar las cajeras.",
      );
    } finally {
      setIsLoading(false);
    }
  }

  function selectCashier(
    cashier: Cashier,
  ) {
    setSelectedUserId(
      cashier.id,
    );

    setPin("");
    setRepeatPin("");
    setShowPin(false);
    setMessageType("info");
    setMessage(
      cashier.hasPin
        ? `Podés cambiar el PIN de ${cashier.displayName}.`
        : `Asigná el primer PIN de ${cashier.displayName}.`,
    );
  }

  function updatePinValue(
    value: string,
    setter: (
      nextValue: string,
    ) => void,
  ) {
    setter(
      value
        .replace(/\D/g, "")
        .slice(0, 8),
    );
  }

  async function handleSubmit(
    event: FormEvent,
  ) {
    event.preventDefault();

    if (!selectedCashier) {
      setMessageType("error");
      setMessage(
        "Seleccioná una cajera.",
      );

      return;
    }

    if (
      !/^\d{4,8}$/.test(pin)
    ) {
      setMessageType("error");
      setMessage(
        "El PIN debe contener entre 4 y 8 números.",
      );

      return;
    }

    if (pin !== repeatPin) {
      setMessageType("error");
      setMessage(
        "Los dos PIN no coinciden.",
      );

      return;
    }

    const action =
      selectedCashier.hasPin
        ? "cambiar"
        : "asignar";

    const confirmed =
      window.confirm(
        `¿Querés ${action} el PIN de ${selectedCashier.displayName}?`,
      );

    if (!confirmed) {
      return;
    }

    setIsSaving(true);
    setMessageType("info");
    setMessage(
      selectedCashier.hasPin
        ? "Cambiando PIN..."
        : "Asignando PIN...",
    );

    try {
      const response =
        await fetch(
          "/api/auth/setup-pin",
          {
            method: "POST",
            credentials:
              "include",
            headers: {
              "Content-Type":
                "application/json",
            },
            body: JSON.stringify({
              userId:
                selectedCashier.id,
              pin,
            }),
          },
        );

      const data =
        (await response.json()) as SetupPinResponse;

      if (
        response.status === 401
      ) {
        window.location.href =
          "/admin/login";

        return;
      }

      if (
        !response.ok ||
        !data.user
      ) {
        throw new Error(
          data.error ||
            "No se pudo guardar el PIN.",
        );
      }

      setCashiers(
        (currentCashiers) =>
          currentCashiers.map(
            (cashier) =>
              cashier.id ===
              data.user?.id
                ? data.user
                : cashier,
          ),
      );

      setPin("");
      setRepeatPin("");
      setShowPin(false);
      setMessageType("success");
      setMessage(
        data.message ||
          "El PIN fue guardado correctamente.",
      );
    } catch (error) {
      console.error(error);

      setMessageType("error");
      setMessage(
        error instanceof Error
          ? error.message
          : "No se pudo guardar el PIN.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <main
      className={styles.page}
    >
      <AdminNavigation />

      <header
        className={styles.header}
      >
        <div>
          <p
            className={styles.eyebrow}
          >
            ADMINISTRACIÓN
          </p>

          <h1
            className={styles.title}
          >
            Cajeras y PINs
          </h1>

          <p
            className={styles.subtitle}
          >
            Asigná o cambiá el PIN que
            cada cajera utiliza para
            ingresar al sistema.
          </p>
        </div>

        <button
          type="button"
          className={
            styles.refreshButton
          }
          onClick={() =>
            void loadCashiers()
          }
          disabled={
            isLoading ||
            isSaving
          }
        >
          ↻ Actualizar
        </button>
      </header>

      <section
        className={styles.stats}
      >
        <article
          className={styles.statCard}
        >
          <span>
            Total de cajeras
          </span>

          <strong>
            {cashiers.length}
          </strong>
        </article>

        <article
          className={styles.statCard}
        >
          <span>
            Con PIN
          </span>

          <strong>
            {configuredCount}
          </strong>
        </article>

        <article
          className={styles.statCard}
        >
          <span>
            Sin PIN
          </span>

          <strong>
            {cashiers.length -
              configuredCount}
          </strong>
        </article>
      </section>

      <section
        className={styles.layout}
      >
        <section
          className={styles.listPanel}
        >
          <div
            className={styles.listHeader}
          >
            <div>
              <p
                className={styles.eyebrow}
              >
                PERSONAL
              </p>

              <h2>
                Seleccioná una cajera
              </h2>
            </div>

            <input
              className={styles.searchInput}
              value={search}
              onChange={(event) =>
                setSearch(
                  event.target.value,
                )
              }
              placeholder="Buscar cajera"
              aria-label="Buscar cajera"
            />
          </div>

          <div
            className={styles.cashierList}
          >
            {filteredCashiers.map(
              (cashier) => {
                const selected =
                  cashier.id ===
                  selectedUserId;

                return (
                  <button
                    key={cashier.id}
                    type="button"
                    className={`${styles.cashierCard} ${
                      selected
                        ? styles.selectedCashier
                        : ""
                    }`}
                    onClick={() =>
                      selectCashier(
                        cashier,
                      )
                    }
                  >
                    <span
                      className={
                        styles.avatar
                      }
                      aria-hidden="true"
                    >
                      {cashier.displayName
                        .charAt(0)
                        .toUpperCase()}
                    </span>

                    <span
                      className={
                        styles.cashierIdentity
                      }
                    >
                      <strong>
                        {cashier.displayName}
                      </strong>

                      <small>
                        Usuario: {cashier.username}
                      </small>
                    </span>

                    <span
                      className={`${styles.statusBadge} ${
                        cashier.hasPin
                          ? styles.configuredBadge
                          : styles.pendingBadge
                      }`}
                    >
                      {cashier.hasPin
                        ? "PIN configurado"
                        : "Sin PIN"}
                    </span>
                  </button>
                );
              },
            )}

            {!isLoading &&
              filteredCashiers.length ===
                0 && (
                <p
                  className={styles.empty}
                >
                  No se encontraron
                  cajeras.
                </p>
              )}
          </div>
        </section>

        <form
          className={styles.formPanel}
          onSubmit={handleSubmit}
        >
          <div
            className={styles.formHeader}
          >
            <div>
              <p
                className={styles.eyebrow}
              >
                {selectedCashier?.hasPin
                  ? "CAMBIAR PIN"
                  : "ASIGNAR PIN"}
              </p>

              <h2>
                {selectedCashier
                  ? selectedCashier.displayName
                  : "Seleccioná una cajera"}
              </h2>
            </div>

            {selectedCashier && (
              <span
                className={`${styles.statusBadge} ${
                  selectedCashier.hasPin
                    ? styles.configuredBadge
                    : styles.pendingBadge
                }`}
              >
                {selectedCashier.hasPin
                  ? "Configurado"
                  : "Pendiente"}
              </span>
            )}
          </div>

          {selectedCashier ? (
            <>
              <div
                className={styles.userSummary}
              >
                <div>
                  <span>
                    Usuario
                  </span>

                  <strong>
                    {selectedCashier.username}
                  </strong>
                </div>

                <div>
                  <span>
                    Último cambio
                  </span>

                  <strong>
                    {formatDateTime(
                      selectedCashier.pinUpdatedAt,
                    )}
                  </strong>
                </div>
              </div>

              {!selectedCashier.active && (
                <p
                  className={styles.warning}
                >
                  Esta cajera está
                  desactivada. No se puede
                  modificar su PIN.
                </p>
              )}

              <label
                className={styles.field}
              >
                <span>
                  PIN nuevo
                </span>

                <input
                  type={
                    showPin
                      ? "text"
                      : "password"
                  }
                  value={pin}
                  onChange={(event) =>
                    updatePinValue(
                      event.target.value,
                      setPin,
                    )
                  }
                  placeholder="Entre 4 y 8 números"
                  inputMode="numeric"
                  autoComplete="new-password"
                  maxLength={8}
                  disabled={
                    isSaving ||
                    !selectedCashier.active
                  }
                />
              </label>

              <label
                className={styles.field}
              >
                <span>
                  Repetir PIN
                </span>

                <input
                  type={
                    showPin
                      ? "text"
                      : "password"
                  }
                  value={repeatPin}
                  onChange={(event) =>
                    updatePinValue(
                      event.target.value,
                      setRepeatPin,
                    )
                  }
                  placeholder="Volvé a escribir el PIN"
                  inputMode="numeric"
                  autoComplete="new-password"
                  maxLength={8}
                  disabled={
                    isSaving ||
                    !selectedCashier.active
                  }
                />
              </label>

              <label
                className={styles.showPinField}
              >
                <input
                  type="checkbox"
                  checked={showPin}
                  onChange={(event) =>
                    setShowPin(
                      event.target.checked,
                    )
                  }
                  disabled={isSaving}
                />

                <span>
                  Mostrar los números
                </span>
              </label>

              <div
                className={styles.pinAdvice}
              >
                <strong>
                  Recomendación
                </strong>

                <p>
                  Usá un PIN de 6 números
                  que la cajera pueda
                  recordar, pero evitá
                  fechas de nacimiento o
                  secuencias como 1234.
                </p>
              </div>

              <button
                type="submit"
                className={styles.saveButton}
                disabled={
                  isSaving ||
                  !selectedCashier.active
                }
              >
                {isSaving
                  ? "Guardando..."
                  : selectedCashier.hasPin
                    ? "Cambiar PIN"
                    : "Asignar PIN"}
              </button>
            </>
          ) : (
            <p
              className={styles.empty}
            >
              Seleccioná una cajera para
              configurar su PIN.
            </p>
          )}
        </form>
      </section>

      <p
        className={`${styles.message} ${
          messageType === "success"
            ? styles.successMessage
            : messageType === "error"
              ? styles.errorMessage
              : styles.infoMessage
        }`}
        role={
          messageType === "error"
            ? "alert"
            : "status"
        }
      >
        {message}
      </p>
    </main>
  );
}
