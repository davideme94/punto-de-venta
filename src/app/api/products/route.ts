import { getCloudflareContext } from "@opennextjs/cloudflare";

export const dynamic = "force-dynamic";

type ProductRow = {
  id: string;
  barcode: string;
  name: string;
  category: string;
  cost_price_cents: number;
  price_cents: number;
  stock: number;
  active: number;
  created_at: string;
  updated_at: string;
};

type CreateProductBody = {
  barcode?: string;
  name?: string;
  category?: string;
  costPrice?: number;
  price?: number;
  stock?: number;
};

type UpdateProductBody = CreateProductBody & {
  id?: string;
  active?: boolean;
  changedBy?: string;
};

type PatchProductBody = {
  productId?: string;
  price?: number;
  active?: boolean;
  changedBy?: string;
};

function convertProduct(row: ProductRow) {
  return {
    id: row.id,
    barcode: row.barcode,
    name: row.name,
    category: row.category,
    costPrice: row.cost_price_cents / 100,
    price: row.price_cents / 100,
    stock: row.stock,
    active: row.active === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function normalizeText(
  value: string | undefined,
): string {
  return value?.trim() ?? "";
}

function isValidMoney(value: number): boolean {
  return (
    Number.isFinite(value) &&
    value >= 0
  );
}

function isValidStock(value: number): boolean {
  return (
    Number.isFinite(value) &&
    value >= 0
  );
}

async function getProductById(
  database: D1Database,
  productId: string,
) {
  return database
    .prepare(`
      SELECT
        id,
        barcode,
        name,
        category,
        cost_price_cents,
        price_cents,
        stock,
        active,
        created_at,
        updated_at
      FROM products
      WHERE id = ?
      LIMIT 1
    `)
    .bind(productId)
    .first<ProductRow>();
}

/*
 * GET /api/products
 *
 * Sin parámetros:
 * devuelve solamente los productos activos.
 *
 * Con ?includeInactive=true:
 * devuelve activos e inactivos.
 */
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);

    const includeInactive =
      url.searchParams.get(
        "includeInactive",
      ) === "true";

    const { env } =
      getCloudflareContext();

    const query = includeInactive
      ? `
        SELECT
          id,
          barcode,
          name,
          category,
          cost_price_cents,
          price_cents,
          stock,
          active,
          created_at,
          updated_at
        FROM products
        ORDER BY
          active DESC,
          name COLLATE NOCASE ASC
      `
      : `
        SELECT
          id,
          barcode,
          name,
          category,
          cost_price_cents,
          price_cents,
          stock,
          active,
          created_at,
          updated_at
        FROM products
        WHERE active = 1
        ORDER BY name COLLATE NOCASE ASC
      `;

    const result =
      await env.DB.prepare(query)
        .all<ProductRow>();

    return Response.json({
      products:
        result.results.map(
          convertProduct,
        ),
    });
  } catch (error) {
    console.error(
      "Error al leer productos:",
      error,
    );

    return Response.json(
      {
        error:
          "No se pudieron cargar los productos.",
      },
      {
        status: 500,
      },
    );
  }
}

/*
 * POST /api/products
 *
 * Crea un producto nuevo.
 */
export async function POST(
  request: Request,
) {
  try {
    const body =
      (await request.json()) as CreateProductBody;

    const barcode = normalizeText(
      body.barcode,
    );

    const name = normalizeText(
      body.name,
    );

    const category =
      normalizeText(body.category) ||
      "General";

    const costPrice = Number(
      body.costPrice,
    );

    const price = Number(body.price);
    const stock = Number(body.stock);

    if (!barcode) {
      return Response.json(
        {
          error:
            "Ingresá el código de barras.",
        },
        {
          status: 400,
        },
      );
    }

    if (!name) {
      return Response.json(
        {
          error:
            "Ingresá el nombre del producto.",
        },
        {
          status: 400,
        },
      );
    }

    if (!isValidMoney(costPrice)) {
      return Response.json(
        {
          error:
            "El precio de costo no es válido.",
        },
        {
          status: 400,
        },
      );
    }

    if (
      !isValidMoney(price) ||
      price <= 0
    ) {
      return Response.json(
        {
          error:
            "El precio de venta debe ser mayor que cero.",
        },
        {
          status: 400,
        },
      );
    }

    if (!isValidStock(stock)) {
      return Response.json(
        {
          error:
            "El stock no es válido.",
        },
        {
          status: 400,
        },
      );
    }

    const { env } =
      getCloudflareContext();

    const repeatedProduct =
      await env.DB.prepare(`
        SELECT id
        FROM products
        WHERE barcode = ?
        LIMIT 1
      `)
        .bind(barcode)
        .first<{ id: string }>();

    if (repeatedProduct) {
      return Response.json(
        {
          error:
            "Ya existe un producto con ese código de barras.",
        },
        {
          status: 409,
        },
      );
    }

    const productId =
      crypto.randomUUID();

    await env.DB.prepare(`
      INSERT INTO products (
        id,
        barcode,
        name,
        category,
        cost_price_cents,
        price_cents,
        stock,
        active
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, 1)
    `)
      .bind(
        productId,
        barcode,
        name,
        category,
        Math.round(costPrice * 100),
        Math.round(price * 100),
        stock,
      )
      .run();

    const createdProduct =
      await getProductById(
        env.DB,
        productId,
      );

    if (!createdProduct) {
      return Response.json(
        {
          error:
            "El producto fue creado, pero no se pudo recuperar.",
        },
        {
          status: 500,
        },
      );
    }

    return Response.json(
      {
        product:
          convertProduct(
            createdProduct,
          ),
      },
      {
        status: 201,
      },
    );
  } catch (error) {
    console.error(
      "Error al crear producto:",
      error,
    );

    return Response.json(
      {
        error:
          "No se pudo crear el producto.",
      },
      {
        status: 500,
      },
    );
  }
}

/*
 * PUT /api/products
 *
 * Edita todos los datos de un producto.
 */
export async function PUT(
  request: Request,
) {
  try {
    const body =
      (await request.json()) as UpdateProductBody;

    const productId =
      normalizeText(body.id);

    const barcode =
      normalizeText(body.barcode);

    const name =
      normalizeText(body.name);

    const category =
      normalizeText(body.category) ||
      "General";

    const costPrice = Number(
      body.costPrice,
    );

    const price = Number(body.price);
    const stock = Number(body.stock);

    const active =
      body.active !== false;

    const changedBy =
      normalizeText(body.changedBy) ||
      "Administrador";

    if (!productId) {
      return Response.json(
        {
          error:
            "Falta identificar el producto.",
        },
        {
          status: 400,
        },
      );
    }

    if (!barcode) {
      return Response.json(
        {
          error:
            "Ingresá el código de barras.",
        },
        {
          status: 400,
        },
      );
    }

    if (!name) {
      return Response.json(
        {
          error:
            "Ingresá el nombre del producto.",
        },
        {
          status: 400,
        },
      );
    }

    if (!isValidMoney(costPrice)) {
      return Response.json(
        {
          error:
            "El precio de costo no es válido.",
        },
        {
          status: 400,
        },
      );
    }

    if (
      !isValidMoney(price) ||
      price <= 0
    ) {
      return Response.json(
        {
          error:
            "El precio de venta debe ser mayor que cero.",
        },
        {
          status: 400,
        },
      );
    }

    if (!isValidStock(stock)) {
      return Response.json(
        {
          error:
            "El stock no es válido.",
        },
        {
          status: 400,
        },
      );
    }

    const { env } =
      getCloudflareContext();

    const existingProduct =
      await getProductById(
        env.DB,
        productId,
      );

    if (!existingProduct) {
      return Response.json(
        {
          error:
            "El producto no existe.",
        },
        {
          status: 404,
        },
      );
    }

    const repeatedBarcode =
      await env.DB.prepare(`
        SELECT id
        FROM products
        WHERE barcode = ?
          AND id <> ?
        LIMIT 1
      `)
        .bind(
          barcode,
          productId,
        )
        .first<{ id: string }>();

    if (repeatedBarcode) {
      return Response.json(
        {
          error:
            "Otro producto ya utiliza ese código de barras.",
        },
        {
          status: 409,
        },
      );
    }

    const newCostPriceCents =
      Math.round(costPrice * 100);

    const newPriceCents =
      Math.round(price * 100);

    const updateStatement =
      env.DB.prepare(`
        UPDATE products
        SET
          barcode = ?,
          name = ?,
          category = ?,
          cost_price_cents = ?,
          price_cents = ?,
          stock = ?,
          active = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).bind(
        barcode,
        name,
        category,
        newCostPriceCents,
        newPriceCents,
        stock,
        active ? 1 : 0,
        productId,
      );

    if (
      existingProduct.price_cents !==
      newPriceCents
    ) {
      await env.DB.batch([
        updateStatement,

        env.DB.prepare(`
          INSERT INTO product_price_history (
            product_id,
            old_price_cents,
            new_price_cents,
            changed_by
          )
          VALUES (?, ?, ?, ?)
        `).bind(
          productId,
          existingProduct.price_cents,
          newPriceCents,
          changedBy,
        ),
      ]);
    } else {
      await updateStatement.run();
    }

    const updatedProduct =
      await getProductById(
        env.DB,
        productId,
      );

    if (!updatedProduct) {
      return Response.json(
        {
          error:
            "No se pudo recuperar el producto actualizado.",
        },
        {
          status: 500,
        },
      );
    }

    return Response.json({
      product:
        convertProduct(
          updatedProduct,
        ),
    });
  } catch (error) {
    console.error(
      "Error al editar producto:",
      error,
    );

    return Response.json(
      {
        error:
          "No se pudo editar el producto.",
      },
      {
        status: 500,
      },
    );
  }
}

/*
 * PATCH /api/products
 *
 * Permite:
 * - cambiar solamente el precio;
 * - activar o desactivar un producto.
 *
 * Conserva compatibilidad con la pantalla
 * principal de la caja.
 */
export async function PATCH(
  request: Request,
) {
  try {
    const body =
      (await request.json()) as PatchProductBody;

    const productId =
      normalizeText(body.productId);

    const changedBy =
      normalizeText(body.changedBy) ||
      "Administrador";

    if (!productId) {
      return Response.json(
        {
          error:
            "Falta identificar el producto.",
        },
        {
          status: 400,
        },
      );
    }

    const { env } =
      getCloudflareContext();

    const existingProduct =
      await getProductById(
        env.DB,
        productId,
      );

    if (!existingProduct) {
      return Response.json(
        {
          error:
            "El producto no existe.",
        },
        {
          status: 404,
        },
      );
    }

    /*
     * Activar o desactivar.
     */
    if (
      typeof body.active ===
        "boolean" &&
      body.price === undefined
    ) {
      await env.DB.prepare(`
        UPDATE products
        SET
          active = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `)
        .bind(
          body.active ? 1 : 0,
          productId,
        )
        .run();

      const statusProduct =
        await getProductById(
          env.DB,
          productId,
        );

      if (!statusProduct) {
        return Response.json(
          {
            error:
              "No se pudo recuperar el producto.",
          },
          {
            status: 500,
          },
        );
      }

      return Response.json({
        product:
          convertProduct(
            statusProduct,
          ),
      });
    }

    /*
     * Cambiar solamente el precio.
     */
    const newPrice = Number(
      body.price,
    );

    if (
      !isValidMoney(newPrice) ||
      newPrice <= 0
    ) {
      return Response.json(
        {
          error:
            "El nuevo precio debe ser mayor que cero.",
        },
        {
          status: 400,
        },
      );
    }

    const newPriceCents =
      Math.round(newPrice * 100);

    if (
      existingProduct.price_cents !==
      newPriceCents
    ) {
      await env.DB.batch([
        env.DB.prepare(`
          UPDATE products
          SET
            price_cents = ?,
            updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).bind(
          newPriceCents,
          productId,
        ),

        env.DB.prepare(`
          INSERT INTO product_price_history (
            product_id,
            old_price_cents,
            new_price_cents,
            changed_by
          )
          VALUES (?, ?, ?, ?)
        `).bind(
          productId,
          existingProduct.price_cents,
          newPriceCents,
          changedBy,
        ),
      ]);
    }

    const updatedProduct =
      await getProductById(
        env.DB,
        productId,
      );

    if (!updatedProduct) {
      return Response.json(
        {
          error:
            "No se pudo recuperar el producto actualizado.",
        },
        {
          status: 500,
        },
      );
    }

    return Response.json({
      product:
        convertProduct(
          updatedProduct,
        ),
    });
  } catch (error) {
    console.error(
      "Error al actualizar producto:",
      error,
    );

    return Response.json(
      {
        error:
          "No se pudo actualizar el producto.",
      },
      {
        status: 500,
      },
    );
  }
}