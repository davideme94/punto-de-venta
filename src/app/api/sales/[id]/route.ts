import { getCloudflareContext } from "@opennextjs/cloudflare";

export const dynamic = "force-dynamic";

type SaleDetailRow = {
  id: string;
  sale_number: number;
  operation_type: string;
  payment_method: string;
  subtotal_cents: number;
  total_cents: number;
  status: string;
  created_by: string;
  notes: string | null;
  created_at: string;
  cancelled_at: string | null;
  cancelled_by: string | null;
  cancellation_reason: string | null;
  cost_total_cents: number;
};

type SaleItemRow = {
  id: string;
  product_id: string | null;
  barcode: string | null;
  product_name: string;
  quantity: number;
  unit_cost_cents: number;
  unit_price_cents: number;
  line_total_cents: number;
  is_manual: number;
  created_at: string;
};

type SalePaymentRow = {
  id: string;
  method: string;
  amount_cents: number;
  reference: string | null;
  created_at: string;
};

function centsToMoney(value: number): number {
  return Number(value || 0) / 100;
}

/*
 * GET /api/sales/[id]
 *
 * Devuelve el encabezado, los productos
 * y los pagos de una venta determinada.
 */
export async function GET(
  _request: Request,

  {
    params,
  }: {
    params: Promise<{
      id: string;
    }>;
  },
) {
  try {
    const { id } =
      await params;

    const saleId =
      id.trim();

    if (!saleId) {
      return Response.json(
        {
          error:
            "Falta identificar la venta.",
        },
        {
          status: 400,
        },
      );
    }

    const { env } =
      getCloudflareContext();

    const sale =
      await env.DB.prepare(`
        SELECT
          sales.id,
          sales.sale_number,
          sales.operation_type,
          sales.payment_method,
          sales.subtotal_cents,
          sales.total_cents,
          sales.status,
          sales.created_by,
          sales.notes,
          sales.created_at,
          sales.cancelled_at,
          sales.cancelled_by,
          sales.cancellation_reason,

          COALESCE(
            (
              SELECT
                SUM(
                  sale_items.unit_cost_cents *
                  sale_items.quantity
                )
              FROM sale_items
              WHERE
                sale_items.sale_id =
                sales.id
            ),
            0
          ) AS cost_total_cents

        FROM sales

        WHERE
          sales.id = ?

        LIMIT 1
      `)
        .bind(saleId)
        .first<SaleDetailRow>();

    if (!sale) {
      return Response.json(
        {
          error:
            "La venta no existe.",
        },
        {
          status: 404,
        },
      );
    }

    const [
      itemsResult,
      paymentsResult,
    ] = await Promise.all([
      env.DB.prepare(`
        SELECT
          id,
          product_id,
          barcode,
          product_name,
          quantity,
          unit_cost_cents,
          unit_price_cents,
          line_total_cents,
          is_manual,
          created_at

        FROM sale_items

        WHERE
          sale_id = ?

        ORDER BY
          created_at ASC,
          id ASC
      `)
        .bind(saleId)
        .all<SaleItemRow>(),

      env.DB.prepare(`
        SELECT
          id,
          method,
          amount_cents,
          reference,
          created_at

        FROM sale_payments

        WHERE
          sale_id = ?

        ORDER BY
          created_at ASC,
          id ASC
      `)
        .bind(saleId)
        .all<SalePaymentRow>(),
    ]);

    const costTotal =
      centsToMoney(
        sale.cost_total_cents,
      );

    const total =
      centsToMoney(
        sale.total_cents,
      );

    return Response.json({
      sale: {
        id: sale.id,

        saleNumber:
          sale.sale_number,

        operationType:
          sale.operation_type,

        paymentMethod:
          sale.payment_method,

        subtotal:
          centsToMoney(
            sale.subtotal_cents,
          ),

        total,

        costTotal,

        profit:
          total - costTotal,

        status:
          sale.status,

        createdBy:
          sale.created_by,

        notes:
          sale.notes,

        createdAt:
          sale.created_at,

        cancelledAt:
          sale.cancelled_at,

        cancelledBy:
          sale.cancelled_by,

        cancellationReason:
          sale.cancellation_reason,

        items:
          itemsResult.results.map(
            (item) => ({
              id: item.id,

              productId:
                item.product_id,

              barcode:
                item.barcode,

              productName:
                item.product_name,

              quantity:
                item.quantity,

              unitCost:
                centsToMoney(
                  item.unit_cost_cents,
                ),

              unitPrice:
                centsToMoney(
                  item.unit_price_cents,
                ),

              lineTotal:
                centsToMoney(
                  item.line_total_cents,
                ),

              isManual:
                item.is_manual === 1,

              createdAt:
                item.created_at,
            }),
          ),

        payments:
          paymentsResult.results.map(
            (payment) => ({
              id:
                payment.id,

              method:
                payment.method,

              amount:
                centsToMoney(
                  payment.amount_cents,
                ),

              reference:
                payment.reference,

              createdAt:
                payment.created_at,
            }),
          ),
      },
    });
  } catch (error) {
    console.error(
      "Error al leer detalle de venta:",
      error,
    );

    return Response.json(
      {
        error:
          "No se pudo cargar el detalle de la venta.",
      },
      {
        status: 500,
      },
    );
  }
}