import type { APIRoute } from 'astro';
import { getCalculationByShareToken, getCustomerById } from '../../../../../lib/db';
import { translateBatch } from '../../../../../lib/translate';
import puppeteer from 'puppeteer';
import * as fs from 'fs';
import * as path from 'path';

// Cache for logo base64
let logoBase64Cache: string | null = null;

async function getLogoBase64(): Promise<string> {
  if (logoBase64Cache) return logoBase64Cache;
  
  try {
    const logoPath = path.join(process.cwd(), 'public', 'images', 'adsun logo.jpg');
    const logoBuffer = await fs.promises.readFile(logoPath);
    logoBase64Cache = `data:image/jpeg;base64,${logoBuffer.toString('base64')}`;
    return logoBase64Cache;
  } catch (error) {
    console.warn('Could not load logo:', error);
    return '';
  }
}

// Translations for PDF
const PDF_TRANSLATIONS = {
  sk: {
    docTitle: "CENOVÁ PONUKA",
    supplier: "DODÁVATEĽ",
    customer: "ODBERATEĽ",
    products: "Produkty",
    product: "Produkt",
    services: "Služby",
    service: "Služba",
    materials: "Materiály",
    material: "Materiál",
    quantity: "Množstvo",
    price: "Cena",
    conditions: "Podmienky",
    deliveryTime: "Dodacia lehota",
    workingDays: "pracovných dní",
    offerValidity: "Platnosť ponuky",
    days: "dní",
    priceSummary: "Cenové zhrnutie",
    subtotal: "Medzisúčet (bez DPH)",
    vat: "DPH",
    reverseCharge: "Reverse Charge - DPH",
    totalWithVat: "CELKOM S DPH",
    totalNet: "CELKOM",
    footer: "Ďakujeme za Váš záujem. V prípade otázok nás neváhajte kontaktovať.",
  },
  en: {
    docTitle: "QUOTATION",
    supplier: "SUPPLIER",
    customer: "CUSTOMER",
    products: "Products",
    product: "Product",
    services: "Services",
    service: "Service",
    materials: "Materials",
    material: "Material",
    quantity: "Quantity",
    price: "Price",
    conditions: "Terms & Conditions",
    deliveryTime: "Delivery time",
    workingDays: "working days",
    offerValidity: "Offer validity",
    days: "days",
    priceSummary: "Price Summary",
    subtotal: "Subtotal (excl. VAT)",
    vat: "VAT",
    reverseCharge: "Reverse Charge - VAT",
    totalWithVat: "TOTAL INCL. VAT",
    totalNet: "TOTAL NET",
    footer: "Thank you for your interest. Please do not hesitate to contact us if you have any questions.",
  },
  "de-AT": {
    docTitle: "ANGEBOT",
    supplier: "LIEFERANT",
    customer: "KUNDE",
    products: "Produkte",
    product: "Produkt",
    services: "Dienstleistungen",
    service: "Dienstleistung",
    materials: "Materialien",
    material: "Material",
    quantity: "Menge",
    price: "Preis",
    conditions: "Bedingungen",
    deliveryTime: "Lieferzeit",
    workingDays: "Werktage",
    offerValidity: "Angebotsgültigkeit",
    days: "Tage",
    priceSummary: "Preisübersicht",
    subtotal: "Zwischensumme (netto)",
    vat: "MwSt.",
    reverseCharge: "Reverse Charge - MwSt.",
    totalWithVat: "GESAMT INKL. MWST.",
    totalNet: "GESAMT NETTO",
    footer: "Vielen Dank für Ihr Interesse. Bei Fragen stehen wir Ihnen gerne zur Verfügung.",
  },
};

type PDFLanguage = keyof typeof PDF_TRANSLATIONS;

export const GET: APIRoute = async ({ params, url }) => {
  const { id, token } = params;
  const lang = (url.searchParams.get('lang') || 'sk') as PDFLanguage;
  const t = PDF_TRANSLATIONS[lang] || PDF_TRANSLATIONS.sk;
  const isGerman = lang === 'de-AT';
  const isForeign = lang !== 'sk';

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
    const materials = calculationData.materials || [];
    
    // Load client from database for complete data (including address)
    const clientFromCalc = calculationData.selectedClient || {};
    const clientEntityId = clientFromCalc.entityId || clientFromCalc.id || calculation.clientEntityId;
    
    let client: any = clientFromCalc;
    if (clientEntityId) {
      const dbClient = await getCustomerById(clientEntityId);
      if (dbClient) {
        console.log('📋 [PDF] Loaded client from DB:', dbClient.name, 'Address:', dbClient.billingStreet, dbClient.billingCity);
        client = { ...clientFromCalc, ...dbClient };
      } else {
        console.log('📋 [PDF] Client not found in DB, using calculation data');
      }
    }
    
    // Debug: log client data
    console.log('📋 [PDF] Final client data:', JSON.stringify(client).substring(0, 500));

    // Get global pricing multipliers (client rating + delivery term) - same as main quote page
    const globalPricing = calculationData.globalPricingBreakdown || {};
    const clientMultiplier = Number(globalPricing.clientMultiplier) || 1;
    const deliveryMultiplier = Number(globalPricing.deliveryMultiplier) || 1;
    const combinedMultiplier = clientMultiplier * deliveryMultiplier;

    // Get the final total amount (with all markups including referrer commission)
    const totalAmount = Number(calculation.totalPrice) || Number(calculationData.actualTotalPrice) || 0;

    // Compute base product total - same logic as main quote page
    const computeBaseProductTotal = (p: any): number => {
      const salePrice = Number(p?.totalSale) || Number(p?.originalSalePrice) || 0;
      if (salePrice > 0) return salePrice * combinedMultiplier;
      const productPrice = Number(p?.finalPrice) || Number(p?.price) || 0;
      if (productPrice > 0) return productPrice * combinedMultiplier;
      const qty = Number(p?.quantity) || 1;
      const unitPrice = Number(p?.variant?.unitSalePrice) || Number(p?.unitPrice) || 0;
      if (unitPrice > 0) return unitPrice * qty * combinedMultiplier;
      const basePrice = Number(p?.variant?.basePrice) || 0;
      return basePrice * combinedMultiplier;
    };

    // Calculate base totals
    const baseProductTotal = products.reduce((sum: number, p: any) => sum + computeBaseProductTotal(p), 0);
    const serviceTotal = services.reduce((sum: number, s: any) => {
      const salePrice = Number(s.totalSale) || Number(s.calculatedPrice) || Number(s.salePrice) || Number(s.calculatedCost) || 0;
      return sum + salePrice * combinedMultiplier;
    }, 0);
    const materialTotal = materials.reduce((sum: number, m: any) => sum + (Number(m.totalSale) || Number(m.totalCost) || 0) * combinedMultiplier, 0);
    const baseTotal = baseProductTotal + serviceTotal + materialTotal;

    // Calculate markup ratio (includes referrer commission)
    const markupRatio = (totalAmount > 0 && baseTotal > 0) ? totalAmount / baseTotal : 1;

    // Final product total function - applies proportional markup
    const computeProductTotal = (p: any): number => {
      const basePrice = computeBaseProductTotal(p);
      return basePrice * markupRatio;
    };

    // Final service total function - applies proportional markup
    const computeServiceTotal = (s: any): number => {
      const salePrice = Number(s.totalSale) || Number(s.calculatedPrice) || Number(s.salePrice) || Number(s.calculatedCost) || 0;
      const basePrice = salePrice * combinedMultiplier;
      return basePrice * markupRatio;
    };

    const productTotal = products.reduce((sum: number, p: any) => sum + computeProductTotal(p), 0);
    const serviceTotalFinal = services.reduce((sum: number, s: any) => sum + computeServiceTotal(s), 0);

    // Use the actual total amount from calculation (which includes all markups)
    const globalTotal = totalAmount > 0 ? totalAmount : (productTotal + serviceTotalFinal);
    
    // For foreign clients, VAT = 0 (Reverse Charge)
    const effectiveVatRate = isForeign ? 0 : vatRate;
    const vatAmount = globalTotal * (effectiveVatRate / 100);
    const totalWithVat = globalTotal + vatAmount;

    // Format currency
    const formatCurrency = (n: number) => 
      new Intl.NumberFormat(lang === 'de-AT' ? 'de-AT' : 'sk-SK', { style: 'currency', currency: 'EUR' }).format(n || 0);

    // Translate product/service/material names if not Slovak
    const translationMap = new Map<string, string>();
    if (isForeign) {
      const textsToTranslate: string[] = [];
      
      products.forEach((p: any) => {
        const name = p.name || p.variant?.name || p.product?.name || "";
        if (name) textsToTranslate.push(name);
      });
      
      services.forEach((s: any) => {
        const name = s.service?.name || s.name || s.serviceName || "";
        if (name) textsToTranslate.push(name);
      });
      
      materials.forEach((m: any) => {
        const name = m.material?.name || m.name || m.materialName || "";
        if (name) textsToTranslate.push(name);
      });
      
      const uniqueTexts = [...new Set(textsToTranslate.filter(t => t.trim()))];
      
      if (uniqueTexts.length > 0) {
        try {
          const translated = await translateBatch(uniqueTexts, lang, 'sk');
          uniqueTexts.forEach((original, i) => {
            translationMap.set(original, translated[i]);
          });
        } catch (e) {
          console.error('Translation failed:', e);
        }
      }
    }
    
    // Helper to translate text
    const tr = (text: string): string => {
      if (!isForeign || !text) return text;
      return translationMap.get(text) || text;
    };

    // Generate products HTML with correct prices
    const productsHtml = products.map((p: any, idx: number) => {
      const rawName = p.name || p.variant?.name || p.product?.name || t.product;
      const name = tr(rawName);
      const qty = Number(p.quantity) || 1;
      const price = computeProductTotal(p); // Use the computed price with multipliers
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

    // Generate services HTML with correct prices (only non-zero)
    const servicesHtml = services
      .filter((s: any) => {
        const price = computeServiceTotal(s);
        return price > 0;
      })
      .map((s: any, idx: number) => {
        const rawName = s.service?.name || s.name || s.serviceName || t.service;
        const name = tr(rawName);
        const price = computeServiceTotal(s); // Use the computed price with multipliers
        return `
          <tr style="background:${idx % 2 === 0 ? '#fff' : '#fafaf9'}">
            <td style="padding:10px 12px;border:1px solid #e5e5e5;"><strong>${name}</strong></td>
            <td style="padding:10px 12px;border:1px solid #e5e5e5;text-align:right;font-weight:700;">${formatCurrency(price)}</td>
          </tr>
        `;
      }).join("");

    // Client info - support multiple field name formats
    const clientName = client.name || client["Názov"] || client["Obchodné meno"] || client.companyName || client.company || "Klient";
    
    // Build address from various possible field names (support Flowii CRM, normalized, and invoicing fields)
    // Also check camelCase versions from direct DB fields
    const street = client.businessAddress || client.invoicingAddress || client.street || 
      client["Fakturačná adresa - ulica"] || client["Korešpondenčná adresa - ulica"] || 
      client["Adresa - ulica"] || client["Ulica"] || 
      client.billingStreet || client.billing_street || client.corrStreet || client.corr_street ||
      client.address || "";
    const postalCode = client.businessPostalCode || client.invoicingPostalCode || client.postalCode || 
      client["Fakturačná adresa - PSČ"] || client["Korešpondenčná adresa - PSČ"] || 
      client["Adresa - PSČ"] || client["PSČ"] || 
      client.billingPostalCode || client.billing_postal_code || client.corrPostalCode || client.corr_postal_code ||
      client.zip || "";
    const city = client.businessCity || client.invoicingCity || client.city || 
      client["Fakturačná adresa - mesto"] || client["Korešpondenčná adresa - mesto"] || 
      client["Adresa - mesto"] || client["Mesto"] || 
      client.billingCity || client.billing_city || client.corrCity || client.corr_city || "";
    const country = client.businessCountry || client.invoicingCountry || client.country || 
      client["Fakturačná adresa - krajina"] || client["Korešpondenčná adresa - krajina"] ||
      client["Adresa - krajina"] || client["Krajina"] || 
      client.billingCountry || client.billing_country || client.corrCountry || client.corr_country || "";
    
    const clientAddress = [street, postalCode, city, country].filter(Boolean).join(", ");
    const clientIco = client.ico || client["IČO"] || client.businessId || client.companyId || "";
    const clientDic = client.dic || client["DIČ"] || client.taxId || "";
    const clientIcDph = client.icDph || client["IČ DPH"] || client.vatId || client.vatNumber || "";
    const clientEmail = client.email || client["Hlavný kontakt - email"] || client["Email"] || client.contactEmail || "";
    const clientPhone = client.phone || client["Hlavný kontakt - telefón 1"] || client["Telefón"] || client.contactPhone1 || client.tel || "";

    // Org info
    const orgName = invoicing.companyName || organization?.name || "Spoločnosť";
    const orgAddress = [invoicing.street, invoicing.postalCode, invoicing.city].filter(Boolean).join(", ");

    // Delivery days
    const deliveryDays = calculationData.overallDeliveryDays || 10;

    // Load logo
    const logoBase64 = await getLogoBase64();

    // Generate HTML
    const dateLocale = lang === 'de-AT' ? 'de-AT' : lang === 'en' ? 'en-GB' : 'sk-SK';
    const html = `
<!DOCTYPE html>
<html lang="${lang}">
<head>
    <meta charset="UTF-8">
    <title>${t.docTitle} - ${calculation.name}</title>
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
                ${logoBase64 
                  ? `<img src="${logoBase64}" alt="${orgName}" style="max-height:60px;max-width:200px;" />`
                  : `<div style="font-size:22px;font-weight:700;color:#f59e0b;">${orgName}</div>`
                }
            </td>
            <td style="width:50%;vertical-align:middle;text-align:right;">
                <div class="doc-title">${t.docTitle}</div>
                <div class="doc-badge">${calculation.name}</div>
                <div style="font-size:11px;color:#78716c;margin-top:6px;">${new Date().toLocaleDateString(dateLocale)}</div>
            </td>
        </tr>
    </table>

    <div class="gradient-line"></div>

    <table style="width:100%;border-collapse:separate;border-spacing:12px 0;margin-bottom:14px;">
        <tr>
            <td class="info-card" style="width:48%;">
                <div class="card-label">${t.supplier}</div>
                <div class="card-title">${orgName}</div>
                <div class="card-text">
                    ${orgAddress}<br>
                    IČO: ${invoicing.ico || ""} · DIČ: ${invoicing.dic || ""}<br>
                    IČ DPH: ${invoicing.icDph || ""}<br>
                    ${invoicing.email || ""} · ${invoicing.phone || ""}
                </div>
            </td>
            <td class="info-card" style="width:48%;">
                <div class="card-label">${t.customer}</div>
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

    ${materials.length > 0 ? `
    <div class="section-title">${t.materials}</div>
    <table class="table">
        <thead><tr><th>${t.material}</th><th style="text-align:center;">${t.quantity}</th><th style="text-align:right;">${t.price}</th></tr></thead>
        <tbody>${materials.map((m: any, idx: number) => {
          const rawName = m.material?.name || m.name || m.materialName || t.material;
          const name = tr(rawName);
          const qty = Number(m.quantity) || 1;
          const unit = m.unit || 'ks';
          // Use totalSale first (main field), then fallbacks
          const price = (Number(m.totalSale) || Number(m.totalCost) || (Number(m.salePrice || 0) * qty) || 0) * combinedMultiplier * markupRatio;
          return `
            <tr style="background:${idx % 2 === 0 ? '#fff' : '#fafaf9'}">
              <td style="padding:10px 12px;border:1px solid #e5e5e5;"><strong>${name}</strong></td>
              <td style="padding:10px 12px;border:1px solid #e5e5e5;text-align:center;">${qty} ${unit}</td>
              <td style="padding:10px 12px;border:1px solid #e5e5e5;text-align:right;font-weight:700;">${formatCurrency(price)}</td>
            </tr>
          `;
        }).join('')}</tbody>
    </table>
    ` : ''}

    ${products.length > 0 ? `
    <div class="section-title">${t.products}</div>
    <table class="table">
        <thead><tr><th>${t.product}</th><th style="text-align:center;">${t.quantity}</th><th style="text-align:right;">${t.price}</th></tr></thead>
        <tbody>${productsHtml}</tbody>
    </table>
    ` : ''}

    ${servicesHtml ? `
    <div class="section-title">${t.services}</div>
    <table class="table">
        <thead><tr><th>${t.service}</th><th style="text-align:right;">${t.price}</th></tr></thead>
        <tbody>${servicesHtml}</tbody>
    </table>
    ` : ''}

    <div class="section-title">${t.conditions}</div>
    <table class="table">
        <tr><td style="width:50%;padding:10px 12px;border:1px solid #e5e5e5;">${t.deliveryTime}</td><td style="padding:10px 12px;border:1px solid #e5e5e5;"><strong>${deliveryDays} ${t.workingDays}</strong></td></tr>
        <tr style="background:#fafaf9;"><td style="padding:10px 12px;border:1px solid #e5e5e5;">${t.offerValidity}</td><td style="padding:10px 12px;border:1px solid #e5e5e5;"><strong>14 ${t.days}</strong></td></tr>
    </table>

    <div class="section-title">${t.priceSummary}</div>
    <table class="summary-table">
        <tr><td class="label">${t.subtotal}</td><td class="value">${formatCurrency(globalTotal)}</td></tr>
        <tr><td class="label">${isForeign ? t.reverseCharge : t.vat} ${effectiveVatRate}%</td><td class="value">${formatCurrency(vatAmount)}</td></tr>
        <tr class="total-row"><td>${isForeign ? t.totalNet : t.totalWithVat}</td><td class="value">${formatCurrency(totalWithVat)}</td></tr>
    </table>

    <div class="footer">
        ${t.footer}
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
    const filePrefix = lang === 'de-AT' ? 'angebot' : lang === 'en' ? 'quotation' : 'cenova-ponuka';
    const filename = `${filePrefix}-${calculation.name?.replace(/[^a-zA-Z0-9]/g, '-') || id}.pdf`;
    
    return new Response(Buffer.from(pdfBuffer), {
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
