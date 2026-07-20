"use client";

import {
  type FormEvent,
  useEffect,
  useMemo,
  useState,
} from "react";

import AdminNavigation from "@/components/admin-navigation/AdminNavigation";

import styles from "./products.module.css";

type Product = {
  id: string;
  barcode: string;
  name: string;
  category: string;
  costPrice: number;
  price: number;
  stock: number;
  active: boolean;
};

type ProductResponse = {
  product?: Product;
  error?: string;
};

type ProductsResponse = {
  products?: Product[];
  error?: string;
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

function formatStock(
  value: number,
): string {
  return new Intl.NumberFormat(
    "es-AR",
    {
      maximumFractionDigits: 2,
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

function parseStock(
  value: string,
): number {
  return Number(
    value.replace(",", "."),
  );
}

export default function ProductsPage() {
  const [products, setProducts] =
    useState<Product[]>([]);

  const [search, setSearch] =
    useState("");

  const [editingId, setEditingId] =
    useState<string | null>(null);

  const [barcode, setBarcode] =
    useState("");

  const [name, setName] =
    useState("");

  const [category, setCategory] =
    useState("General");

  const [costPrice, setCostPrice] =
    useState("");

  const [salePrice, setSalePrice] =
    useState("");

  const [stock, setStock] =
    useState("0");

  const [editingActive, setEditingActive] =
    useState(true);

  const [message, setMessage] =
    useState(
      "Cargando productos...",
    );

  const [isLoading, setIsLoading] =
    useState(false);

  const filteredProducts =
    useMemo(() => {
      const normalizedSearch =
        search.trim().toLowerCase();

      if (!normalizedSearch) {
        return products;
      }

      return products.filter(
        (product) =>
          product.name
            .toLowerCase()
            .includes(
              normalizedSearch,
            ) ||
          product.barcode
            .toLowerCase()
            .includes(
              normalizedSearch,
            ) ||
          product.category
            .toLowerCase()
            .includes(
              normalizedSearch,
            ),
      );
    }, [products, search]);

  const activeProducts =
    useMemo(() => {
      return products.filter(
        (product) => product.active,
      ).length;
    }, [products]);

  useEffect(() => {
    void loadProducts();
  }, []);

  async function loadProducts() {
    setMessage(
      "Cargando productos...",
    );

    try {
      const response = await fetch(
        "/api/products?includeInactive=true",
        {
          cache: "no-store",
        },
      );

      const data =
        (await response.json()) as ProductsResponse;

      if (!response.ok) {
        throw new Error(
          data.error ||
            "No se pudieron cargar los productos.",
        );
      }

      const loadedProducts =
        data.products ?? [];

      setProducts(loadedProducts);

      setMessage(
        `${loadedProducts.length} productos encontrados.`,
      );
    } catch (error) {
      console.error(error);

      setMessage(
        error instanceof Error
          ? error.message
          : "No se pudieron cargar los productos.",
      );
    }
  }

  function clearForm() {
    setEditingId(null);
    setBarcode("");
    setName("");
    setCategory("General");
    setCostPrice("");
    setSalePrice("");
    setStock("0");
    setEditingActive(true);
  }

  function editProduct(
    product: Product,
  ) {
    setEditingId(product.id);
    setBarcode(product.barcode);
    setName(product.name);
    setCategory(product.category);
    setCostPrice(
      String(product.costPrice),
    );
    setSalePrice(
      String(product.price),
    );
    setStock(String(product.stock));
    setEditingActive(
      product.active,
    );

    setMessage(
      `Editando ${product.name}.`,
    );

    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  }

  async function handleSubmit(
    event: FormEvent,
  ) {
    event.preventDefault();

    const normalizedBarcode =
      barcode.trim();

    const normalizedName =
      name.trim();

    const normalizedCategory =
      category.trim() || "General";

    const parsedCostPrice =
      parseMoney(costPrice);

    const parsedSalePrice =
      parseMoney(salePrice);

    const parsedStock =
      parseStock(stock);

    if (!normalizedBarcode) {
      setMessage(
        "Ingresá el código de barras.",
      );
      return;
    }

    if (!normalizedName) {
      setMessage(
        "Ingresá el nombre del producto.",
      );
      return;
    }

    if (
      !Number.isFinite(
        parsedCostPrice,
      ) ||
      parsedCostPrice < 0
    ) {
      setMessage(
        "Ingresá un precio de costo válido.",
      );
      return;
    }

    if (
      !Number.isFinite(
        parsedSalePrice,
      ) ||
      parsedSalePrice <= 0
    ) {
      setMessage(
        "El precio de venta debe ser mayor que cero.",
      );
      return;
    }

    if (
      !Number.isFinite(parsedStock) ||
      parsedStock < 0
    ) {
      setMessage(
        "Ingresá un stock válido.",
      );
      return;
    }

    setIsLoading(true);

    setMessage(
      editingId
        ? "Guardando cambios..."
        : "Creando producto...",
    );

    try {
      const response = await fetch(
        "/api/products",
        {
          method: editingId
            ? "PUT"
            : "POST",

          headers: {
            "Content-Type":
              "application/json",
          },

          body: JSON.stringify({
            id: editingId,
            barcode:
              normalizedBarcode,
            name: normalizedName,
            category:
              normalizedCategory,
            costPrice:
              parsedCostPrice,
            price:
              parsedSalePrice,
            stock: parsedStock,
            active:
              editingActive,
            changedBy:
              "Administrador",
          }),
        },
      );

      const data =
        (await response.json()) as ProductResponse;

      if (
        !response.ok ||
        !data.product
      ) {
        throw new Error(
          data.error ||
            "No se pudo guardar el producto.",
        );
      }

      setMessage(
        editingId
          ? `${data.product.name} fue actualizado.`
          : `${data.product.name} fue creado.`,
      );

      clearForm();
      await loadProducts();
    } catch (error) {
      console.error(error);

      setMessage(
        error instanceof Error
          ? error.message
          : "No se pudo guardar el producto.",
      );
    } finally {
      setIsLoading(false);
    }
  }

  async function toggleProductStatus(
    product: Product,
  ) {
    const action = product.active
      ? "desactivar"
      : "reactivar";

    const confirmed =
      window.confirm(
        `¿Querés ${action} ${product.name}?`,
      );

    if (!confirmed) {
      return;
    }

    setMessage(
      `${action} producto...`,
    );

    try {
      const response = await fetch(
        "/api/products",
        {
          method: "PATCH",

          headers: {
            "Content-Type":
              "application/json",
          },

          body: JSON.stringify({
            productId: product.id,
            active: !product.active,
            changedBy:
              "Administrador",
          }),
        },
      );

      const data =
        (await response.json()) as ProductResponse;

      if (
        !response.ok ||
        !data.product
      ) {
        throw new Error(
          data.error ||
            "No se pudo cambiar el estado.",
        );
      }

      setProducts(
        (currentProducts) =>
          currentProducts.map(
            (currentProduct) =>
              currentProduct.id ===
              data.product?.id
                ? data.product
                : currentProduct,
          ),
      );

      setMessage(
        data.product.active
          ? `${data.product.name} fue reactivado.`
          : `${data.product.name} fue desactivado.`,
      );

      if (
        editingId ===
        data.product.id
      ) {
        clearForm();
      }
    } catch (error) {
      console.error(error);

      setMessage(
        error instanceof Error
          ? error.message
          : "No se pudo cambiar el estado.",
      );
    }
  }

  return (
    <main className={styles.page}>
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
            Productos
          </h1>

          <p
            className={
              styles.subtitle
            }
          >
            Cargá y actualizá la
            mercadería del negocio.
          </p>
        </div>

      </header>

      <section
        className={styles.stats}
      >
        <article
          className={styles.statCard}
        >
          <span>
            Total registrado
          </span>

          <strong>
            {products.length}
          </strong>
        </article>

        <article
          className={styles.statCard}
        >
          <span>
            Productos activos
          </span>

          <strong>
            {activeProducts}
          </strong>
        </article>

        <article
          className={styles.statCard}
        >
          <span>
            Desactivados
          </span>

          <strong>
            {products.length -
              activeProducts}
          </strong>
        </article>
      </section>

      <section
        className={styles.layout}
      >
        <form
          className={styles.formPanel}
          onSubmit={handleSubmit}
        >
          <div
            className={
              styles.formHeader
            }
          >
            <div>
              <p
                className={
                  styles.eyebrow
                }
              >
                {editingId
                  ? "EDITAR"
                  : "NUEVO"}
              </p>

              <h2>
                {editingId
                  ? "Editar producto"
                  : "Agregar producto"}
              </h2>
            </div>

            {editingId && (
              <button
                type="button"
                className={
                  styles.cancelButton
                }
                onClick={() => {
                  clearForm();

                  setMessage(
                    "Edición cancelada.",
                  );
                }}
              >
                Cancelar
              </button>
            )}
          </div>

          <label
            className={styles.field}
          >
            <span>
              Código de barras
            </span>

            <input
              value={barcode}
              onChange={(event) =>
                setBarcode(
                  event.target.value,
                )
              }
              placeholder="Escaneá o escribí el código"
              autoComplete="off"
            />
          </label>

          <label
            className={styles.field}
          >
            <span>
              Nombre del producto
            </span>

            <input
              value={name}
              onChange={(event) =>
                setName(
                  event.target.value,
                )
              }
              placeholder="Ejemplo: Leche entera 1 L"
            />
          </label>

          <label
            className={styles.field}
          >
            <span>Categoría</span>

            <input
              value={category}
              onChange={(event) =>
                setCategory(
                  event.target.value,
                )
              }
              placeholder="Ejemplo: Lácteos"
            />
          </label>

          <div
            className={
              styles.twoColumns
            }
          >
            <label
              className={
                styles.field
              }
            >
              <span>
                Precio de costo
              </span>

              <input
                value={costPrice}
                onChange={(event) =>
                  setCostPrice(
                    event.target.value,
                  )
                }
                placeholder="Ejemplo: 1200"
                inputMode="decimal"
              />
            </label>

            <label
              className={
                styles.field
              }
            >
              <span>
                Precio de venta
              </span>

              <input
                value={salePrice}
                onChange={(event) =>
                  setSalePrice(
                    event.target.value,
                  )
                }
                placeholder="Ejemplo: 1750"
                inputMode="decimal"
              />
            </label>
          </div>

          <label
            className={styles.field}
          >
            <span>Stock inicial</span>

            <input
              value={stock}
              onChange={(event) =>
                setStock(
                  event.target.value,
                )
              }
              placeholder="Ejemplo: 24"
              inputMode="decimal"
            />
          </label>

          {editingId && (
            <label
              className={
                styles.checkboxField
              }
            >
              <input
                type="checkbox"
                checked={
                  editingActive
                }
                onChange={(event) =>
                  setEditingActive(
                    event.target
                      .checked,
                  )
                }
              />

              <span>
                Producto activo
              </span>
            </label>
          )}

          <button
            type="submit"
            className={
              styles.saveButton
            }
            disabled={isLoading}
          >
            {isLoading
              ? "Guardando..."
              : editingId
                ? "Guardar cambios"
                : "Crear producto"}
          </button>
        </form>

        <section
          className={styles.listPanel}
        >
          <div
            className={
              styles.listHeader
            }
          >
            <div>
              <p
                className={
                  styles.eyebrow
                }
              >
                INVENTARIO
              </p>

              <h2>
                Productos cargados
              </h2>
            </div>

            <input
              className={
                styles.searchInput
              }
              value={search}
              onChange={(event) =>
                setSearch(
                  event.target.value,
                )
              }
              placeholder="Buscar producto, código o categoría"
            />
          </div>

          <div
            className={
              styles.message
            }
          >
            {message}
          </div>

          <div
            className={
              styles.tableWrapper
            }
          >
            <table
              className={styles.table}
            >
              <thead>
                <tr>
                  <th>Estado</th>
                  <th>Código</th>
                  <th>Producto</th>
                  <th>Categoría</th>
                  <th>Costo</th>
                  <th>Venta</th>
                  <th>Stock</th>
                  <th>Acciones</th>
                </tr>
              </thead>

              <tbody>
                {filteredProducts.length ===
                0 ? (
                  <tr>
                    <td
                      colSpan={8}
                      className={
                        styles.emptyTable
                      }
                    >
                      No hay productos que
                      coincidan con la
                      búsqueda.
                    </td>
                  </tr>
                ) : (
                  filteredProducts.map(
                    (product) => (
                      <tr
                        key={product.id}
                        className={
                          product.active
                            ? ""
                            : styles.inactiveRow
                        }
                      >
                        <td>
                          <span
                            className={`${styles.statusBadge} ${
                              product.active
                                ? styles.activeBadge
                                : styles.inactiveBadge
                            }`}
                          >
                            {product.active
                              ? "Activo"
                              : "Inactivo"}
                          </span>
                        </td>

                        <td>
                          <code>
                            {
                              product.barcode
                            }
                          </code>
                        </td>

                        <td>
                          <strong>
                            {product.name}
                          </strong>
                        </td>

                        <td>
                          {
                            product.category
                          }
                        </td>

                        <td>
                          {formatMoney(
                            product.costPrice,
                          )}
                        </td>

                        <td>
                          <strong>
                            {formatMoney(
                              product.price,
                            )}
                          </strong>
                        </td>

                        <td>
                          {formatStock(
                            product.stock,
                          )}
                        </td>

                        <td>
                          <div
                            className={
                              styles.rowActions
                            }
                          >
                            <button
                              type="button"
                              className={
                                styles.editButton
                              }
                              onClick={() =>
                                editProduct(
                                  product,
                                )
                              }
                            >
                              Editar
                            </button>

                            <button
                              type="button"
                              className={
                                product.active
                                  ? styles.disableButton
                                  : styles.enableButton
                              }
                              onClick={() =>
                                void toggleProductStatus(
                                  product,
                                )
                              }
                            >
                              {product.active
                                ? "Desactivar"
                                : "Reactivar"}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ),
                  )
                )}
              </tbody>
            </table>
          </div>
        </section>
      </section>
    </main>
  );
}