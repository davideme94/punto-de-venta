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

type AdminAccessGuardProps = {
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

export default function AdminAccessGuard({
  children,
}: AdminAccessGuardProps) {
  const router = useRouter();

  const pathname = usePathname();

  const [
    isChecking,
    setIsChecking,
  ] = useState(true);

  const [
    isAuthorized,
    setIsAuthorized,
  ] = useState(false);

  const [
    message,
    setMessage,
  ] = useState(
    "Verificando la sesión administrativa...",
  );

  useEffect(() => {
    let active = true;

    async function checkAdminSession() {
      setIsChecking(true);
      setIsAuthorized(false);

      try {
        const response = await fetch(
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
          setMessage(
            "Se requiere una sesión administrativa.",
          );

          const returnPath =
            pathname || "/registers/opening";

          router.replace(
            `/admin/login?next=${encodeURIComponent(
              returnPath,
            )}`,
          );

          return;
        }

        setIsAuthorized(true);

        setMessage(
          `Acceso autorizado para ${data.user?.displayName ?? "Administrador"}.`,
        );
      } catch (error) {
        console.error(
          "Error al comprobar el acceso administrativo:",
          error,
        );

        if (!active) {
          return;
        }

        setIsAuthorized(false);

        setMessage(
          "No se pudo comprobar la sesión administrativa.",
        );

        router.replace(
          "/admin/login",
        );
      } finally {
        if (active) {
          setIsChecking(false);
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
            padding: "30px",
            border: "1px solid #dbe3ef",
            borderRadius: "20px",
            background: "#ffffff",
            textAlign: "center",
            boxShadow:
              "0 18px 60px rgba(15, 23, 42, 0.08)",
          }}
        >
          <div
            style={{
              marginBottom: "12px",
              fontSize: "36px",
            }}
          >
            🛡️
          </div>

          <strong
            style={{
              display: "block",
              marginBottom: "8px",
              fontSize: "20px",
            }}
          >
            Comprobando acceso
          </strong>

          <p
            style={{
              margin: 0,
              color: "#64748b",
              lineHeight: 1.5,
            }}
          >
            {message}
          </p>
        </section>
      </main>
    );
  }

  return children;
}