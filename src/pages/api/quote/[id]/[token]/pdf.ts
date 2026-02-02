import type { APIRoute } from 'astro';
import { getCalculationByShareToken } from '../../../../../lib/db';
import puppeteer from 'puppeteer';

export const GET: APIRoute = async ({ params }) => {
  const { id, token } = params;

  if (!id || !token) {
    return new Response(JSON.stringify({ error: 'Missing id or token' }), { status: 400 });
  }

  try {
    // Get calculation data
    const result = await getCalculationByShareToken(id, token);

    if (!result) {
      return new Response(JSON.stringify({ error: 'Invalid share token' }), { status: 403 });
    }

    const { calculation, share, organization } = result;
    const calculationData = calculation.calculationData || {};
    const invoicing = (organization as any)?.invoicing || {};
    const vatRate = invoicing.vatRate || 23;

    // Extract data
    const products = calculationData.products || [];
    const services = calculationData.services || [];
    const client = calculationData.selectedClient || {};

    // Calculate totals
    const productTotal = products.reduce((sum: number, p: any) => {
      const price = Number(p.totalSalePrice) || Number(p.salePrice) || Number(p.variant?.salePrice) || 0;
      return sum + price;
    }, 0);

    const serviceTotal = services.reduce((sum: number, s: any) => {
      const price = Number(s.totalSale) || Number(s.calculatedPrice) || Number(s.salePrice) || 0;
      return sum + price;
    }, 0);

    const subtotal = productTotal + serviceTotal;
    const globalTotal = calculationData.globalPricingBreakdown?.finalPrice || subtotal;
    const vatAmount = globalTotal * (vatRate / 100);
    const totalWithVat = globalTotal + vatAmount;

    // Format currency
    const formatCurrency = (n: number) => 
      new Intl.NumberFormat('sk-SK', { style: 'currency', currency: 'EUR' }).format(n || 0);

    // Generate products HTML
    const productsHtml = products.map((p: any, idx: number) => {
      const name = p.name || p.variant?.name || p.product?.name || "Produkt";
      const qty = Number(p.quantity) || 1;
      const price = Number(p.totalSalePrice) || Number(p.salePrice) || Number(p.variant?.salePrice) || 0;
      const specs = p.templateConfigLabels || {};
      const specsHtml = Object.entries(specs)
        .filter(([k, v]) => v && !['id', 'entityId'].includes(k))
        .slice(0, 4)
        .map(([k, v]) => `<span style="font-size:9px;color:#78716c;margin-right:8px;">${v}</span>`)
        .join("");
      
      return `
        <tr style="background:${idx % 2 === 0 ? '#fff' : '#fafaf9'}">
          <td style="padding:10px 12px;border:1px solid #e5e5e5;">
            <strong style="color:#1a1a1a;font-size:11px;">${name}</strong>
            ${specsHtml ? `<div style="margin-top:4px;">${specsHtml}</div>` : ''}
          </td>
          <td style="padding:10px 12px;border:1px solid #e5e5e5;text-align:center;">${qty}</td>
          <td style="padding:10px 12px;border:1px solid #e5e5e5;text-align:right;font-weight:700;">${formatCurrency(price)}</td>
        </tr>
      `;
    }).join("");

    // Generate services HTML (only non-zero)
    const servicesHtml = services
      .filter((s: any) => {
        const price = Number(s.totalSale) || Number(s.calculatedPrice) || Number(s.salePrice) || 0;
        return price > 0;
      })
      .map((s: any, idx: number) => {
        const name = s.service?.name || s.name || s.serviceName || "Služba";
        const price = Number(s.totalSale) || Number(s.calculatedPrice) || Number(s.salePrice) || 0;
        return `
          <tr style="background:${idx % 2 === 0 ? '#fff' : '#fafaf9'}">
            <td style="padding:10px 12px;border:1px solid #e5e5e5;"><strong>${name}</strong></td>
            <td style="padding:10px 12px;border:1px solid #e5e5e5;text-align:right;font-weight:700;">${formatCurrency(price)}</td>
          </tr>
        `;
      }).join("");

    // Client info
    const clientName = client.name || client["Názov"] || client.companyName || "Klient";
    const clientAddress = [
      client.businessAddress || client["Korešpondenčná adresa - ulica"],
      client.businessPostalCode || client["Korešpondenčná adresa - PSČ"],
      client.businessCity || client["Korešpondenčná adresa - mesto"],
    ].filter(Boolean).join(", ");
    const clientIco = client.ico || client["IČO"] || client.businessId || "";
    const clientDic = client.dic || client["DIČ"] || "";
    const clientIcDph = client.icDph || client["IČ DPH"] || client.vatId || "";
    const clientEmail = client.email || client["Hlavný kontakt - email"] || "";
    const clientPhone = client.phone || client["Hlavný kontakt - telefón 1"] || "";

    // Org info
    const orgName = invoicing.companyName || organization?.name || "Spoločnosť";
    const orgAddress = [invoicing.street, invoicing.postalCode, invoicing.city].filter(Boolean).join(", ");

    // Delivery days
    const deliveryDays = calculationData.overallDeliveryDays || 10;

    // Generate HTML
    const html = `
<!DOCTYPE html>
<html lang="sk">
<head>
    <meta charset="UTF-8">
    <title>Cenová ponuka - ${calculation.name}</title>
    <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">
    <style>
        * { box-sizing: border-box; }
        body { font-family: 'Outfit', system-ui, sans-serif; font-size: 12px; line-height: 1.5; color: #1a1a1a; margin: 0; padding: 24px; background: #fff; }
        .header-table { width: 100%; border-collapse: collapse; margin-bottom: 15px; }
        .doc-title { font-size: 26px; font-weight: 800; color: #f59e0b; }
        .doc-badge { font-size: 13px; font-weight: 600; color: #92400e; padding: 6px 14px; background: linear-gradient(135deg, #fef3c7, #fde68a); border-radius: 6px; display: inline-block; border: 1px solid #fcd34d; }
        .gradient-line { height: 4px; background: linear-gradient(90deg, #f59e0b, #fbbf24, #fcd34d); margin-bottom: 18px; border-radius: 2px; }
        .info-card { background: linear-gradient(135deg, #fffbeb, #fef3c7); border: 1px solid #fcd34d; border-radius: 8px; padding: 12px 14px; vertical-align: top; }
        .card-label { font-size: 9px; font-weight: 700; color: #b45309; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 8px; padding-bottom: 4px; border-bottom: 2px solid #f59e0b; }
        .card-title { font-size: 13px; font-weight: 700; color: #1a1a1a; margin-bottom: 6px; }
        .card-text { font-size: 10px; color: #57534e; line-height: 1.5; }
        .section-title { font-size: 12px; font-weight: 800; color: #b45309; text-transform: uppercase; letter-spacing: 1px; margin: 20px 0 10px; padding-bottom: 6px; border-bottom: 3px solid #f59e0b; }
        .table { width: 100%; border-collapse: collapse; font-size: 11px; margin-bottom: 14px; }
        .table th { background: linear-gradient(135deg, #f59e0b, #d97706); color: white; padding: 10px 12px; text-align: left; font-weight: 700; font-size: 10px; text-transform: uppercase; }
        .summary-table { width: 100%; border-collapse: collapse; margin-top: 18px; }
        .summary-table td { padding: 10px 14px; border: 1px solid #e5e5e5; }
        .summary-table .label { background: #fafaf9; font-weight: 500; width: 60%; color: #57534e; }
        .summary-table .value { text-align: right; font-weight: 700; }
        .summary-table .total-row { background: linear-gradient(135deg, #f59e0b, #d97706) !important; color: white; }
        .summary-table .total-row td { border-color: #d97706; font-size: 15px; font-weight: 800; }
        .footer { margin-top: 24px; padding-top: 14px; border-top: 2px solid #fcd34d; font-size: 10px; color: #78716c; text-align: center; }
    </style>
</head>
<body>
    <table class="header-table">
        <tr>
            <td style="width:50%;vertical-align:middle;">
                <div style="font-size:22px;font-weight:700;color:#f59e0b;">${orgName}</div>
            </td>
            <td style="width:50%;vertical-align:middle;text-align:right;">
                <div class="doc-title">CENOVÁ PONUKA</div>
                <div class="doc-badge">${calculation.name}</div>
                <div style="font-size:11px;color:#78716c;margin-top:6px;">${new Date().toLocaleDateString('sk-SK')}</div>
            </td>
        </tr>
    </table>

    <div class="gradient-line"></div>

    <table style="width:100%;border-collapse:separate;border-spacing:12px 0;margin-bottom:14px;">
        <tr>
            <td class="info-card" style="width:48%;">
                <div class="card-label">DODÁVATEĽ</div>
                <div class="card-title">${orgName}</div>
                <div class="card-text">
                    ${orgAddress}<br>
                    IČO: ${invoicing.ico || ""} · DIČ: ${invoicing.dic || ""}<br>
                    IČ DPH: ${invoicing.icDph || ""}<br>
                    ${invoicing.email || ""} · ${invoicing.phone || ""}
                </div>
            </td>
            <td class="info-card" style="width:48%;">
                <div class="card-label">ODBERATEĽ</div>
                <div class="card-title">${clientName}</div>
                <div class="card-text">
                    ${clientAddress}<br>
                    IČO: ${clientIco} · DIČ: ${clientDic}<br>
                    IČ DPH: ${clientIcDph}<br>
                    ${clientEmail} · ${clientPhone}
                </div>
            </td>
        </tr>
    </table>

    ${products.length > 0 ? `
    <div class="section-title">Produkty</div>
    <table class="table">
        <thead><tr><th>Produkt</th><th style="text-align:center;">Množstvo</th><th style="text-align:right;">Cena</th></tr></thead>
        <tbody>${productsHtml}</tbody>
    </table>
    ` : ''}

    ${servicesHtml ? `
    <div class="section-title">Služby</div>
    <table class="table">
        <thead><tr><th>Služba</th><th style="text-align:right;">Cena</th></tr></thead>
        <tbody>${servicesHtml}</tbody>
    </table>
    ` : ''}

    <div class="section-title">Podmienky</div>
    <table class="table">
        <tr><td style="width:50%;padding:10px 12px;border:1px solid #e5e5e5;">Dodacia lehota</td><td style="padding:10px 12px;border:1px solid #e5e5e5;"><strong>${deliveryDays} pracovných dní</strong></td></tr>
        <tr style="background:#fafaf9;"><td style="padding:10px 12px;border:1px solid #e5e5e5;">Platnosť ponuky</td><td style="padding:10px 12px;border:1px solid #e5e5e5;"><strong>14 dní</strong></td></tr>
    </table>

    <div class="section-title">Cenové zhrnutie</div>
    <table class="summary-table">
        <tr><td class="label">Medzisúčet (bez DPH)</td><td class="value">${formatCurrency(globalTotal)}</td></tr>
        <tr><td class="label">DPH ${vatRate}%</td><td class="value">${formatCurrency(vatAmount)}</td></tr>
        <tr class="total-row"><td>CELKOM S DPH</td><td class="value">${formatCurrency(totalWithVat)}</td></tr>
    </table>

    <div class="footer">
        Ďakujeme za Váš záujem. V prípade otázok nás neváhajte kontaktovať.
    </div>
</body>
</html>
    `;

    // Generate PDF with Puppeteer
    const browser = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
    });

    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle0", timeout: 60000 });

    const pdfBuffer = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "10mm", bottom: "10mm", left: "10mm", right: "10mm" },
    });

    await browser.close();

    // Return PDF
    const filename = `cenova-ponuka-${calculation.name?.replace(/[^a-zA-Z0-9]/g, '-') || id}.pdf`;
    
    return new Response(pdfBuffer, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });

  } catch (error) {
    console.error("❌ [Quote PDF] Error:", error);
    return new Response(
      JSON.stringify({ error: "Failed to generate PDF", details: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
};
