"use client";

import Link from "next/link";

import {
  usePathname,
  useRouter,
} from "next/navigation";

import {
  useState,
} from "react";

import styles from "./admin-navigation.module.css";

type NavigationItem = {
  href: string;
  label: string;
  icon: string;
};

const navigationItems: NavigationItem[] = [
  {
    href: "/registers/opening",
    label: "Apertura",
    icon: "🔓",
  },
  {
    href: "/registers/closing",
    label: "Cierre",
    icon: "🔒",
  },
  {
    href: "/sales",
    label: "Ventas",
    icon: "📊",
  },
  {
    href: "/products",
    label: "Productos",
    icon: "📦",
  },
  {
    href: "/admin/users",
    label: "Cajeras y PINs",
    icon: "🔢",
  },
];

export default function AdminNavigation() {
  const pathname =
    usePathname();

  const router =
    useRouter();

  const [
    isLoggingOut,
    setIsLoggingOut,
  ] = useState(false);

  const [
    logoutMessage,
    setLogoutMessage,
  ] = useState("");

  function isActive(
    href: string,
  ): boolean {
    if (
      href ===
      "/registers/opening"
    ) {
      return (
        pathname === href ||
        pathname.startsWith(
          "/registers/opening/",
        )
      );
    }

    if (
      href ===
      "/registers/closing"
    ) {
      return (
        pathname === href ||
        pathname.startsWith(
          "/registers/closing/",
        )
      );
    }

    if (
      href === "/sales"
    ) {
      return (
        pathname === href ||
        pathname.startsWith(
          "/sales/",
        )
      );
    }

    if (
      href === "/products"
    ) {
      return (
        pathname === href ||
        pathname.startsWith(
          "/products/",
        )
      );
    }

    if (
      href === "/admin/users"
    ) {
      return (
        pathname === href ||
        pathname.startsWith(
          "/admin/users/",
        )
      );
    }

    return pathname === href;
  }

  async function handleLogout() {
    if (isLoggingOut) {
      return;
    }

    const confirmed =
      window.confirm(
        "¿Querés cerrar la sesión administrativa?",
      );

    if (!confirmed) {
      return;
    }

    setIsLoggingOut(true);

    setLogoutMessage(
      "Cerrando sesión...",
    );

    try {
      const response =
        await fetch(
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

      router.replace(
        "/admin/login",
      );

      router.refresh();
    } catch (error) {
      console.error(
        "Error al cerrar la sesión administrativa:",
        error,
      );

      setLogoutMessage(
        error instanceof Error
          ? error.message
          : "No se pudo cerrar la sesión.",
      );

      setIsLoggingOut(false);
    }
  }

  return (
    <div
      className={
        styles.wrapper
      }
    >
      <div
        className={
          styles.identity
        }
      >
        <div
          className={
            styles.identityIcon
          }
          aria-hidden="true"
        >
          A
        </div>

        <div>
          <span
            className={
              styles.identityLabel
            }
          >
            PANEL
          </span>

          <strong
            className={
              styles.identityTitle
            }
          >
            Administración
          </strong>
        </div>
      </div>

      <nav
        className={
          styles.navigation
        }
        aria-label="Navegación administrativa"
      >
        {navigationItems.map(
          (item) => {
            const active =
              isActive(
                item.href,
              );

            return (
              <Link
                key={
                  item.href
                }
                href={
                  item.href
                }
                className={`${styles.link} ${
                  active
                    ? styles.activeLink
                    : ""
                }`}
                aria-current={
                  active
                    ? "page"
                    : undefined
                }
              >
                <span
                  className={
                    styles.linkIcon
                  }
                  aria-hidden="true"
                >
                  {item.icon}
                </span>

                <span>
                  {item.label}
                </span>
              </Link>
            );
          },
        )}
      </nav>

      <div
        className={
          styles.sessionArea
        }
      >
        {logoutMessage && (
          <span
            className={
              styles.logoutMessage
            }
          >
            {logoutMessage}
          </span>
        )}

        <button
          type="button"
          className={
            styles.logoutButton
          }
          onClick={() =>
            void handleLogout()
          }
          disabled={
            isLoggingOut
          }
        >
          <span
            aria-hidden="true"
          >
            ↪
          </span>

          {isLoggingOut
            ? "Saliendo..."
            : "Cerrar sesión"}
        </button>
      </div>
    </div>
  );
}