"use client";

import Link from "next/link";

import {
  type FormEvent,
  useEffect,
  useState,
} from "react";

import styles from "./login.module.css";

type AdminUser = {
  id: string;
  username: string;
  displayName: string;
  role: string;
};

type AdminLoginStatusResponse = {
  configured?: boolean;

  admin?: {
    id: string;
    username: string;
    displayName: string;
    role: string;
    active: boolean;
    hasPassword: boolean;
  };

  error?: string;
};

type AdminLoginResponse = {
  message?: string;
  authenticated?: boolean;
  user?: AdminUser;
  error?: string;
};

type AdminMeResponse = {
  authenticated: boolean;
  user?: AdminUser;
  error?: string;
};

export default function AdminLoginPage() {
  const [
    password,
    setPassword,
  ] = useState("");

  const [
    showPassword,
    setShowPassword,
  ] = useState(false);

  const [
    currentAdmin,
    setCurrentAdmin,
  ] = useState<AdminUser | null>(
    null,
  );

  const [
    isConfigured,
    setIsConfigured,
  ] = useState(true);

  const [
    isLoading,
    setIsLoading,
  ] = useState(true);

  const [
    isSubmitting,
    setIsSubmitting,
  ] = useState(false);

  const [
    message,
    setMessage,
  ] = useState(
    "Comprobando acceso administrativo...",
  );

  useEffect(() => {
    void initializePage();
  }, []);

  async function initializePage() {
    setIsLoading(
      true,
    );

    try {
      await loadConfiguration();

      await loadCurrentAdmin();
    } finally {
      setIsLoading(
        false,
      );
    }
  }

  async function loadConfiguration() {
    try {
      const response =
        await fetch(
          "/api/admin/login",
          {
            method: "GET",
            cache: "no-store",
            credentials: "include",
          },
        );

      const data =
        (await response.json()) as AdminLoginStatusResponse;

      if (!response.ok) {
        throw new Error(
          data.error ||
            "No se pudo comprobar la configuración.",
        );
      }

      setIsConfigured(
        data.configured ===
          true,
      );

      if (
        data.configured !==
        true
      ) {
        setMessage(
          "La contraseña administrativa todavía no fue configurada.",
        );
      }
    } catch (error) {
      console.error(
        "Error al comprobar configuración administrativa:",
        error,
      );

      setIsConfigured(
        false,
      );

      setMessage(
        error instanceof Error
          ? error.message
          : "No se pudo comprobar la configuración.",
      );
    }
  }

  async function loadCurrentAdmin() {
    try {
      const response =
        await fetch(
          "/api/admin/me",
          {
            method: "GET",
            cache: "no-store",
            credentials: "include",
          },
        );

      const data =
        (await response.json()) as AdminMeResponse;

      if (
        !response.ok ||
        !data.authenticated ||
        !data.user
      ) {
        setCurrentAdmin(
          null,
        );

        setMessage(
          "Ingresá la contraseña administrativa.",
        );

        return;
      }

      setCurrentAdmin(
        data.user,
      );

      setMessage(
        `Sesión administrativa iniciada como ${data.user.displayName}.`,
      );
    } catch (error) {
      console.error(
        "Error al comprobar sesión administrativa:",
        error,
      );

      setCurrentAdmin(
        null,
      );

      setMessage(
        "Ingresá la contraseña administrativa.",
      );
    }
  }

  async function handleLogin(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    if (!password) {
      setMessage(
        "Ingresá la contraseña administrativa.",
      );

      return;
    }

    setIsSubmitting(
      true,
    );

    setMessage(
      "Iniciando sesión administrativa...",
    );

    try {
      const response =
        await fetch(
          "/api/admin/login",
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
                password,

                deviceName:
                  "Panel administrativo web",
              }),
          },
        );

      const data =
        (await response.json()) as AdminLoginResponse;

      if (!response.ok) {
        throw new Error(
          data.error ||
            "No se pudo iniciar la sesión.",
        );
      }

      setPassword(
        "",
      );

      if (data.user) {
        setCurrentAdmin(
          data.user,
        );
      } else {
        await loadCurrentAdmin();
      }

      setMessage(
        data.message ||
          "Ingreso administrativo correcto.",
      );
    } catch (error) {
      console.error(
        "Error al ingresar como administrador:",
        error,
      );

      setMessage(
        error instanceof Error
          ? error.message
          : "No se pudo iniciar la sesión.",
      );
    } finally {
      setIsSubmitting(
        false,
      );
    }
  }

  async function handleLogout() {
    setIsSubmitting(
      true,
    );

    setMessage(
      "Cerrando sesión administrativa...",
    );

    try {
      const response =
        await fetch(
          "/api/auth/logout",
          {
            method: "POST",

            credentials:
              "include",
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

      setCurrentAdmin(
        null,
      );

      setPassword(
        "",
      );

      setMessage(
        "Sesión administrativa cerrada.",
      );
    } catch (error) {
      console.error(
        "Error al cerrar sesión administrativa:",
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

  return (
    <main
      className={
        styles.page
      }
    >
      <section
        className={
          styles.shell
        }
      >
        <header
          className={
            styles.header
          }
        >
          <div
            className={
              styles.adminIcon
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
              ACCESO RESTRINGIDO
            </p>

            <h1>
              Administración
            </h1>

            <p>
              Acceso exclusivo para
              apertura, cierre y control
              de cajas.
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

        {isLoading ? (
          <section
            className={
              styles.card
            }
          >
            <p
              className={
                styles.loadingText
              }
            >
              Comprobando sesión...
            </p>
          </section>
        ) : currentAdmin ? (
          <section
            className={
              styles.card
            }
          >
            <div
              className={
                styles.connectedHeader
              }
            >
              <div
                className={
                  styles.avatar
                }
              >
                A
              </div>

              <div>
                <span>
                  SESIÓN ADMINISTRATIVA
                </span>

                <h2>
                  {
                    currentAdmin.displayName
                  }
                </h2>

                <p>
                  Acceso autorizado
                </p>
              </div>
            </div>

            <div
              className={
                styles.accessNotice
              }
            >
              <strong>
                Panel habilitado
              </strong>

              <p>
                Podés ingresar a la
                apertura administrativa
                de las cajas.
              </p>
            </div>

            <div
              className={
                styles.actions
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
                  isSubmitting
                }
              >
                Cerrar sesión
              </button>

              <Link
                href="/registers/opening"
                className={
                  styles.openingLink
                }
              >
                Ir a apertura de cajas
              </Link>
            </div>
          </section>
        ) : !isConfigured ? (
          <section
            className={
              styles.card
            }
          >
            <div
              className={
                styles.notConfigured
              }
            >
              <strong>
                Falta configurar la
                contraseña
              </strong>

              <p>
                Primero configurá la
                contraseña administrativa.
              </p>

              <Link
                href="/admin/setup"
                className={
                  styles.setupLink
                }
              >
                Configurar contraseña
              </Link>
            </div>
          </section>
        ) : (
          <form
            className={
              styles.card
            }
            onSubmit={
              handleLogin
            }
          >
            <div
              className={
                styles.formTitle
              }
            >
              <h2>
                Iniciar sesión
              </h2>

              <p>
                Ingresá la contraseña
                administrativa.
              </p>
            </div>

            <label
              className={
                styles.field
              }
            >
              <span>
                Usuario
              </span>

              <input
                value="ADMINISTRADOR"
                disabled
              />
            </label>

            <label
              className={
                styles.field
              }
            >
              <span>
                Contraseña
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
                    event.target
                      .value,
                  )
                }
                autoComplete="current-password"
                placeholder="Ingresá la contraseña"
                autoFocus
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
                    event.target
                      .checked,
                  )
                }
              />

              <span>
                Mostrar contraseña
              </span>
            </label>

            <button
              type="submit"
              className={
                styles.loginButton
              }
              disabled={
                isSubmitting
              }
            >
              {isSubmitting
                ? "Ingresando..."
                : "Ingresar como administrador"}
            </button>
          </form>
        )}

        <footer
          className={
            styles.footer
          }
        >
          <Link
            href="/login"
          >
            Ingreso de cajeras
          </Link>

          <Link
            href="/"
          >
            Volver al inicio
          </Link>
        </footer>
      </section>
    </main>
  );
}