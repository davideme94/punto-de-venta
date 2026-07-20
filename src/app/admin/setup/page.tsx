"use client";

import Link from "next/link";

import {
  type FormEvent,
  useEffect,
  useState,
} from "react";

import {
  useRouter,
} from "next/navigation";

import styles from "./setup.module.css";

type SetupStatusResponse = {
  configured?: boolean;
  authenticatedAdmin?: boolean;

  admin?: {
    id: string;
    username: string;
    displayName: string;
    role: string;
    active: boolean;
  } | null;

  error?: string;
};

type SetupResponse = {
  message?: string;
  requiresLogin?: boolean;
  error?: string;
};

export default function AdminSetupPage() {
  const router =
    useRouter();

  const [
    setupSecret,
    setSetupSecret,
  ] = useState("");

  const [
    password,
    setPassword,
  ] = useState("");

  const [
    repeatedPassword,
    setRepeatedPassword,
  ] = useState("");

  const [
    showPassword,
    setShowPassword,
  ] = useState(false);

  const [
    isConfigured,
    setIsConfigured,
  ] = useState(false);

  const [
    isCheckingAccess,
    setIsCheckingAccess,
  ] = useState(true);

  const [
    isSaving,
    setIsSaving,
  ] = useState(false);

  const [
    success,
    setSuccess,
  ] = useState(false);

  const [
    message,
    setMessage,
  ] = useState(
    "Comprobando acceso administrativo...",
  );

  useEffect(() => {
    void checkAccess();
  }, []);

  async function checkAccess() {
    setIsCheckingAccess(
      true,
    );

    try {
      const response =
        await fetch(
          "/api/admin/setup-password",
          {
            method: "GET",
            cache: "no-store",
            credentials: "include",
          },
        );

      const data =
        (await response.json()) as SetupStatusResponse;

      if (!response.ok) {
        throw new Error(
          data.error ||
            "No se pudo comprobar el acceso.",
        );
      }

      const configured =
        data.configured ===
        true;

      setIsConfigured(
        configured,
      );

      /*
       * Si ya existe una contraseña,
       * se exige una sesión administrativa.
       */
      if (
        configured &&
        data.authenticatedAdmin !==
          true
      ) {
        setMessage(
          "Redirigiendo al ingreso administrativo...",
        );

        router.replace(
          "/admin/login",
        );

        return;
      }

      setMessage(
        configured
          ? "Ingresá la nueva contraseña administrativa."
          : "Configurá la contraseña inicial del administrador.",
      );
    } catch (error) {
      console.error(
        "Error al comprobar acceso:",
        error,
      );

      setMessage(
        error instanceof Error
          ? error.message
          : "No se pudo comprobar el acceso.",
      );
    } finally {
      setIsCheckingAccess(
        false,
      );
    }
  }

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    if (
      !setupSecret.trim()
    ) {
      setMessage(
        "Ingresá la clave ADMIN_SETUP_SECRET.",
      );

      return;
    }

    if (
      password !==
      repeatedPassword
    ) {
      setMessage(
        "Las contraseñas no coinciden.",
      );

      return;
    }

    if (
      password.length < 10
    ) {
      setMessage(
        "La contraseña debe tener al menos 10 caracteres.",
      );

      return;
    }

    if (
      !/[a-z]/.test(
        password,
      )
    ) {
      setMessage(
        "La contraseña debe incluir una letra minúscula.",
      );

      return;
    }

    if (
      !/[A-Z]/.test(
        password,
      )
    ) {
      setMessage(
        "La contraseña debe incluir una letra mayúscula.",
      );

      return;
    }

    if (
      !/\d/.test(
        password,
      )
    ) {
      setMessage(
        "La contraseña debe incluir un número.",
      );

      return;
    }

    setIsSaving(
      true,
    );

    setSuccess(
      false,
    );

    setMessage(
      isConfigured
        ? "Cambiando contraseña administrativa..."
        : "Guardando contraseña administrativa...",
    );

    try {
      const response =
        await fetch(
          "/api/admin/setup-password",
          {
            method: "POST",

            headers: {
              "Content-Type":
                "application/json",
            },

            credentials:
              "include",

            body:
              JSON.stringify({
                setupSecret:
                  setupSecret.trim(),

                password,
              }),
          },
        );

      const data =
        (await response.json()) as SetupResponse;

      if (!response.ok) {
        if (
          response.status ===
          401
        ) {
          router.replace(
            "/admin/login",
          );
        }

        throw new Error(
          data.error ||
            "No se pudo guardar la contraseña.",
        );
      }

      setSetupSecret(
        "",
      );

      setPassword(
        "",
      );

      setRepeatedPassword(
        "",
      );

      setSuccess(
        true,
      );

      setMessage(
        data.message ||
          "Contraseña guardada correctamente.",
      );
    } catch (error) {
      console.error(
        "Error al configurar administrador:",
        error,
      );

      setSuccess(
        false,
      );

      setMessage(
        error instanceof Error
          ? error.message
          : "No se pudo guardar la contraseña.",
      );
    } finally {
      setIsSaving(
        false,
      );
    }
  }

  if (isCheckingAccess) {
    return (
      <main
        className={
          styles.page
        }
      >
        <section
          className={
            styles.card
          }
        >
          <header
            className={
              styles.header
            }
          >
            <div
              className={
                styles.icon
              }
            >
              🛡️
            </div>

            <div>
              <p
                className={
                  styles.eyebrow
                }
              >
                SEGURIDAD
              </p>

              <h1>
                Comprobando acceso
              </h1>

              <p>
                Verificando la sesión
                administrativa...
              </p>
            </div>
          </header>

          <div
            className={
              styles.message
            }
          >
            {message}
          </div>
        </section>
      </main>
    );
  }

  return (
    <main
      className={
        styles.page
      }
    >
      <section
        className={
          styles.card
        }
      >
        <header
          className={
            styles.header
          }
        >
          <div
            className={
              styles.icon
            }
          >
            🛡️
          </div>

          <div>
            <p
              className={
                styles.eyebrow
              }
            >
              SEGURIDAD
            </p>

            <h1>
              {isConfigured
                ? "Cambiar contraseña administrativa"
                : "Contraseña administrativa"}
            </h1>

            <p>
              {isConfigured
                ? "La contraseña nueva cerrará todas las sesiones administrativas abiertas."
                : "Esta contraseña permitirá ingresar al panel de administración."}
            </p>
          </div>
        </header>

        <div
          className={`${styles.message} ${
            success
              ? styles.successMessage
              : ""
          }`}
        >
          {message}
        </div>

        {success ? (
          <section
            className={
              styles.successCard
            }
          >
            <strong>
              Contraseña guardada
            </strong>

            <p>
              Por seguridad, la sesión
              anterior fue cerrada.
              Ingresá nuevamente usando
              la contraseña nueva.
            </p>

            <Link
              href="/admin/login"
              className={
                styles.backLink
              }
            >
              Ir al ingreso administrativo
            </Link>
          </section>
        ) : (
          <form
            className={
              styles.form
            }
            onSubmit={
              handleSubmit
            }
          >
            <label
              className={
                styles.field
              }
            >
              <span>
                Clave de configuración
              </span>

              <input
                type="password"
                value={
                  setupSecret
                }
                onChange={(
                  event,
                ) =>
                  setSetupSecret(
                    event.target.value,
                  )
                }
                autoComplete="off"
                placeholder="ADMIN_SETUP_SECRET"
              />

              <small>
                Es la clave privada que
                está configurada en
                .dev.vars.
              </small>
            </label>

            <label
              className={
                styles.field
              }
            >
              <span>
                {isConfigured
                  ? "Nueva contraseña"
                  : "Contraseña administrativa"}
              </span>

              <input
                type={
                  showPassword
                    ? "text"
                    : "password"
                }
                value={
                  password
                }
                onChange={(
                  event,
                ) =>
                  setPassword(
                    event.target.value,
                  )
                }
                autoComplete="new-password"
                placeholder="Mínimo 10 caracteres"
              />
            </label>

            <label
              className={
                styles.field
              }
            >
              <span>
                Repetir contraseña
              </span>

              <input
                type={
                  showPassword
                    ? "text"
                    : "password"
                }
                value={
                  repeatedPassword
                }
                onChange={(
                  event,
                ) =>
                  setRepeatedPassword(
                    event.target.value,
                  )
                }
                autoComplete="new-password"
                placeholder="Repetí la contraseña"
              />
            </label>

            <label
              className={
                styles.showPassword
              }
            >
              <input
                type="checkbox"
                checked={
                  showPassword
                }
                onChange={(
                  event,
                ) =>
                  setShowPassword(
                    event.target.checked,
                  )
                }
              />

              <span>
                Mostrar contraseña
              </span>
            </label>

            <div
              className={
                styles.requirements
              }
            >
              <strong>
                La contraseña debe tener:
              </strong>

              <p>
                Al menos 10 caracteres,
                una mayúscula, una
                minúscula y un número.
              </p>
            </div>

            <button
              type="submit"
              className={
                styles.saveButton
              }
              disabled={
                isSaving
              }
            >
              {isSaving
                ? "Guardando..."
                : isConfigured
                  ? "Cambiar contraseña administrativa"
                  : "Guardar contraseña administrativa"}
            </button>
          </form>
        )}
      </section>
    </main>
  );
}