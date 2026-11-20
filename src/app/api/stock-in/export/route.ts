import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { corePrisma, isDatabaseConfigured } from "@/lib/prisma";
import { getAuthSession } from "@/lib/auth/session";
import { canViewCosts } from "@/lib/constants";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Stock-In "Export Excel (Backup)" endpoint.
 *
 * Streams a clean `.xlsx` snapshot of every variant in the signed-in shop:
 * `variantId`, SKU, product/model name, colour, buying + selling prices and the
 * current stock quantity — so the operator can eyeball stock in Excel, edit the
 * quantity column, then re-import through the Stock-In restore action.
 *
 * Guarded exactly like the stock-in server actions: an authenticated member with
 * the `inventory` permission, scoped to their own `shopId` (IDOR-safe). The
 * buying-cost column is only emitted for members allowed to see costs.
 */
export async function GET() {
  if (!isDatabaseConfigured) {
    return NextResponse.json(
      { ok: false, message: "Stock backup requires a database connection." },
      { status: 503 },
    );
  }

  const session = await getAuthSession();
  if (!session) {
    return NextResponse.json({ ok: false, message: "Sign in with an active team account." }, { status: 401 });
  }
  if (!session.permissions.inventory) {
    return NextResponse.json(
      { ok: false, message: "You do not have permission to export stock." },
      { status: 403 },
    );
  }

  const showCosts = canViewCosts(session.role, session.permissions);

  try {
    const products = await corePrisma.product.findMany({
      where: { shopId: session.shopId },
      include: { variants: { orderBy: { createdAt: "asc" } } },
      orderBy: { createdAt: "asc" },
    });

    const rows = products.flatMap((product) =>
      product.variants.map((variant) => ({
        variantId: variant.id,
        SKU: variant.sku,
        "Product / Model Name": product.name,
        "Color / Variant": variant.color,
        ...(showCosts ? { "Buying Price": Number(variant.costPrice) } : {}),
        "Selling Price": Number(variant.sellingPrice),
        "Current Stock Qty": variant.stockQty,
      })),
    );

    const headers = [
      "variantId",
      "SKU",
      "Product / Model Name",
      "Color / Variant",
      ...(showCosts ? ["Buying Price"] : []),
      "Selling Price",
      "Current Stock Qty",
    ];

    const worksheet = XLSX.utils.json_to_sheet(rows, { header: headers });
    worksheet["!cols"] = headers.map((header) => ({ wch: Math.max(14, header.length + 2) }));
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Stock");

    const buffer = XLSX.write(workbook, { bookType: "xlsx", type: "buffer" }) as Buffer;
    const stamp = new Date().toISOString().slice(0, 10);

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="itech-stock-backup-${stamp}.xlsx"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    // Log the real cause server-side; never leak internals to the client.
    console.error("[stock-in:export]", error);
    return NextResponse.json({ ok: false, message: "Could not generate the stock backup." }, { status: 500 });
  }
}
