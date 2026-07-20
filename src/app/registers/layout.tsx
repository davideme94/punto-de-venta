"use client";

import {
  type ReactNode,
  useEffect,
  useState,
} from "react";

import {
  usePathname,
  useRouter,
} from "next/navigation";

type RegistersLayoutProps = {
  children: ReactNode;
};

type AdminSessionResponse = {
  authenticated?: boolean;

  user?: {
    id: string;
    username: string;
    displayName: string;
    role: string;
  };

  error?: string;
};

export default function RegistersLayout({
  children,
}: RegistersLayoutProps) {
  const router =
    useRouter();

  const pathname =
    usePathname();

  const [
    isChecking,
    setIsChecking,
  ] = useState(true);

  const [
    isAuthorized,
    setIsAuthorized,
  ] = useState(false);

  useEffect(() => {
    let active = true;

    async function checkAdminSession() {
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
          (await response.json()) as AdminSessionResponse;

        const validAdmin =
          response.ok &&
          data.authenticated === true &&
          data.user?.role === "ADMIN";

        if (!active) {
          return;
        }

        if (!validAdmin) {
          setIsAuthorized(
            false,
          );

          const returnPath =
            pathname ||
            "/registers/opening";

          router.replace(
            `/admin/login?next=${encodeURIComponent(
              returnPath,
            )}`,
          );

          return;
        }

        setIsAuthorized(
          true,
        );
      } catch (error) {
        console.error(
          "Error al comprobar acceso administrativo:",
          error,
        );

        if (!active) {
          return;
        }

        setIsAuthorized(
          false,
        );

        router.replace(
          "/admin/login",
        );
      } finally {
        if (active) {
          setIsChecking(
            false,
          );
        }
      }
    }

    void checkAdminSession();

    return () => {
      active = false;
    };
  }, [
    pathname,
    router,
  ]);

  if (
    isChecking ||
    !isAuthorized
  ) {
    return (
      <main
        style={{
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          padding: "24px",
          background: "#f2f5fa",
          color: "#172033",
        }}
      >
        <section
          style={{
            width: "100%",
            maxWidth: "480px",
            padding: "28px",
            border:
              "1px solid #dbe3ef",
            borderRadius:
              "18px",
            background:
              "white",
            textAlign:
              "center",
            boxShadow:
              "0 18px 60px rgba(15, 23, 42, 0.08)",
          }}
        >
          <div
            style={{
              fontSize:
                "34px",
              marginBottom:
                "12px",
            }}
          >
            🛡️
          </div>

          <strong
            style={{
              display:
                "block",
              fontSize:
                "19px",
              marginBottom:
                "7px",
            }}
          >
            Comprobando acceso
          </strong>

          <p
            style={{
              margin: 0,
              color:
                "#64748b",
            }}
          >
            Verificando la sesión
            administrativa...
          </p>
        </section>
      </main>
    );
  }

  return children;
}