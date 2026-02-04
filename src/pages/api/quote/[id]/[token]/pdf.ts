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
    // New translations
    items: "Položky",
    name: "Názov",
    count: "Počet",
    unit: "MJ",
    unitPrice: "J.cena",
    total: "Celkom",
    vatBase: "Základ DPH",
    vatAmount: "Výška DPH",
    totalToPay: "Suma na úhradu",
    date: "Dátum",
    validity: "Platnosť",
    deliveryAddress: "Dodacia adresa",
    pcs: "ks",
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
    // New translations
    items: "Items",
    name: "Name",
    count: "Qty",
    unit: "Unit",
    unitPrice: "Unit Price",
    total: "Total",
    vatBase: "VAT Base",
    vatAmount: "VAT Amount",
    totalToPay: "Total to Pay",
    date: "Date",
    validity: "Validity",
    deliveryAddress: "Delivery Address",
    pcs: "pcs",
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
    // New translations
    items: "Positionen",
    name: "Bezeichnung",
    count: "Menge",
    unit: "Einheit",
    unitPrice: "Einzelpreis",
    total: "Gesamt",
    vatBase: "Nettobetrag",
    vatAmount: "MwSt. Betrag",
    totalToPay: "Zahlbetrag",
    date: "Datum",
    validity: "Gültigkeit",
    deliveryAddress: "Lieferadresse",
    pcs: "Stk.",
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

    // Translate product/service/material names AND calculation name if not Slovak
    const translationMap = new Map<string, string>();
    if (isForeign) {
      const textsToTranslate: string[] = [];
      
      // Add calculation name for translation
      if (calculation.name) {
        textsToTranslate.push(calculation.name);
      }
      
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

    // Generate HTML - Invoice-style layout
    const dateLocale = lang === 'de-AT' ? 'de-AT' : lang === 'en' ? 'en-GB' : 'sk-SK';
    const currentDate = new Date().toLocaleDateString(dateLocale);
    
    // Calculate per-item details for invoice-style display
    const allItems: Array<{name: string; description: string; qty: number; unit: string; unitPrice: number; total: number; vatRate: number; vatAmount: number; totalWithVat: number}> = [];
    
    // Add products
    products.forEach((p: any) => {
      const rawName = p.name || p.variant?.name || p.product?.name || t.product;
      const name = tr(rawName);
      const qty = Number(p.quantity) || 1;
      const total = computeProductTotal(p);
      const unitPrice = qty > 0 ? total / qty : total;
      const specs = p.templateConfigLabels || {};
      const description = Object.entries(specs)
        .filter(([k, v]) => v && !['id', 'entityId'].includes(k))
        .slice(0, 4)
        .map(([k, v]) => v)
        .join(', ');
      
      allItems.push({
        name,
        description,
        qty,
        unit: t.pcs,
        unitPrice,
        total,
        vatRate: effectiveVatRate,
        vatAmount: total * (effectiveVatRate / 100),
        totalWithVat: total * (1 + effectiveVatRate / 100)
      });
    });
    
    // Add services
    services.filter((s: any) => computeServiceTotal(s) > 0).forEach((s: any) => {
      const rawName = s.service?.name || s.name || s.serviceName || t.service;
      const name = tr(rawName);
      const total = computeServiceTotal(s);
      
      allItems.push({
        name,
        description: '',
        qty: 1,
        unit: t.pcs,
        unitPrice: total,
        total,
        vatRate: effectiveVatRate,
        vatAmount: total * (effectiveVatRate / 100),
        totalWithVat: total * (1 + effectiveVatRate / 100)
      });
    });
    
    // Add materials
    materials.forEach((m: any) => {
      const rawName = m.material?.name || m.name || m.materialName || t.material;
      const name = tr(rawName);
      const qty = Number(m.quantity) || 1;
      const unit = m.unit === 'ks' ? t.pcs : (m.unit || t.pcs);
      const total = (Number(m.totalSale) || Number(m.totalCost) || (Number(m.salePrice || 0) * qty) || 0) * combinedMultiplier * markupRatio;
      const unitPrice = qty > 0 ? total / qty : total;
      
      allItems.push({
        name,
        description: '',
        qty,
        unit,
        unitPrice,
        total,
        vatRate: effectiveVatRate,
        vatAmount: total * (effectiveVatRate / 100),
        totalWithVat: total * (1 + effectiveVatRate / 100)
      });
    });

    // Calculate validity date (14 days from now)
    const validityDate = new Date();
    validityDate.setDate(validityDate.getDate() + 14);
    const validityDateStr = validityDate.toLocaleDateString(dateLocale);

    const html = `
<!DOCTYPE html>
<html lang="${lang}">
<head>
    <meta charset="UTF-8">
    <title>${t.docTitle} - ${calculation.name}</title>
    <style>
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 10px; line-height: 1.4; color: #333; background: #fff; }
        .page { padding: 30px 40px; }
        
        /* Header row */
        .header-row { display: table; width: 100%; margin-bottom: 15px; }
        .header-left { display: table-cell; width: 50%; vertical-align: top; }
        .header-right { display: table-cell; width: 50%; vertical-align: top; }
        
        /* Supplier box */
        .supplier-box { border: 1px solid #e5e5e5; padding: 12px 15px; margin-right: 10px; }
        .box-label { font-size: 9px; font-weight: 600; color: #d4740c; text-transform: uppercase; margin-bottom: 8px; }
        .company-name { font-size: 13px; font-weight: 700; color: #1a365d; margin-bottom: 6px; }
        .company-details { font-size: 9px; color: #4a5568; line-height: 1.6; }
        
        /* Document title box */
        .doc-box { text-align: right; padding: 0 0 0 10px; }
        .doc-title { font-size: 10px; color: #d4740c; margin-bottom: 3px; }
        .doc-number { font-size: 22px; font-weight: 700; color: #d4740c; margin-bottom: 8px; }
        
        /* Customer row */
        .customer-row { display: table; width: 100%; margin-bottom: 15px; }
        .customer-box { display: table-cell; width: 50%; vertical-align: top; border: 1px solid #e5e5e5; padding: 12px 15px; }
        .customer-box:first-child { border-right: none; }
        .customer-name { font-size: 12px; font-weight: 600; color: #1a365d; margin-bottom: 4px; }
        .customer-details { font-size: 9px; color: #4a5568; line-height: 1.6; }
        
        /* Dates box */
        .dates-box { border: 1px solid #e5e5e5; padding: 10px 15px; margin-bottom: 15px; background: #fafafa; }
        .dates-row { display: table; width: 100%; }
        .date-item { display: table-cell; width: 25%; }
        .date-label { font-size: 8px; color: #d4740c; font-weight: 600; margin-bottom: 2px; }
        .date-value { font-size: 10px; font-weight: 500; color: #1a365d; }
        
        /* Items section */
        .section-title { font-size: 10px; font-weight: 600; color: #d4740c; text-transform: uppercase; letter-spacing: 0.5px; margin: 15px 0 8px; padding-bottom: 5px; border-bottom: 2px solid #d4740c; }
        
        /* Items table */
        .items-table { width: 100%; border-collapse: collapse; margin-bottom: 15px; }
        .items-table th { background: #d4740c; color: #fff; font-size: 8px; font-weight: 600; text-transform: uppercase; padding: 8px 6px; text-align: left; }
        .items-table th.r { text-align: right; }
        .items-table th.c { text-align: center; }
        .items-table td { padding: 8px 6px; border-bottom: 1px solid #e5e5e5; font-size: 9px; vertical-align: top; color: #1a365d; }
        .items-table td.r { text-align: right; }
        .items-table td.c { text-align: center; }
        .item-name { font-weight: 500; color: #1a365d; font-size: 10px; }
        .item-desc { font-size: 8px; color: #4a5568; margin-top: 3px; line-height: 1.4; }
        
        /* Summary section */
        .summary-row { display: table; width: 100%; margin-bottom: 15px; }
        .summary-left { display: table-cell; width: 50%; vertical-align: top; }
        .summary-right { display: table-cell; width: 50%; vertical-align: top; }
        
        /* VAT table */
        .vat-table { border: 1px solid #e5e5e5; margin-left: auto; width: 100%; }
        .vat-header { display: table; width: 100%; background: #f7f7f7; border-bottom: 1px solid #e5e5e5; }
        .vat-header-cell { display: table-cell; padding: 8px 10px; font-size: 8px; font-weight: 600; color: #666; text-transform: uppercase; }
        .vat-row { display: table; width: 100%; }
        .vat-cell { display: table-cell; padding: 8px 10px; font-size: 10px; color: #1a365d; }
        .vat-total-row { display: table; width: 100%; background: #d4740c; color: #fff; }
        .vat-total-label { display: table-cell; padding: 12px 15px; font-size: 11px; font-weight: 600; width: 60%; }
        .vat-total-value { display: table-cell; padding: 12px 15px; font-size: 18px; font-weight: 700; text-align: right; color: #fff; }
        
        /* Conditions */
        .conditions-box { border: 1px solid #e5e5e5; padding: 12px 15px; margin-bottom: 15px; background: #fafafa; }
        .conditions-title { font-size: 9px; font-weight: 600; color: #d4740c; text-transform: uppercase; margin-bottom: 8px; }
        .conditions-item { display: table; width: 100%; margin-bottom: 4px; }
        .conditions-label { display: table-cell; width: 40%; font-size: 9px; color: #666; }
        .conditions-value { display: table-cell; font-size: 9px; font-weight: 600; color: #1a365d; }
        
        /* Footer bar */
        .footer-bar { margin-top: 20px; background: #d4740c; padding: 12px 15px; display: table; width: 100%; }
        .footer-bar-item { display: table-cell; color: #fff; }
        .footer-bar-label { font-size: 8px; font-weight: 400; opacity: 0.9; margin-bottom: 2px; }
        .footer-bar-value { font-size: 10px; font-weight: 600; }
        
        /* Footer */
        .footer { margin-top: 15px; padding-top: 12px; border-top: 1px solid #e5e5e5; }
        .footer-center { text-align: center; font-size: 8px; color: #666; }
    </style>
</head>
<body>
<div class="page">
    <!-- Header -->
    <div class="header-row">
        <div class="header-left">
            <div class="supplier-box">
                <div class="box-label">${t.supplier}</div>
                ${logoBase64 
                  ? `<img src="${logoBase64}" alt="${orgName}" style="max-height:40px;max-width:150px;margin-bottom:6px;" />`
                  : `<div class="company-name">${orgName}</div>`
                }
                ${logoBase64 ? `<div class="company-name">${orgName}</div>` : ''}
                <div class="company-details">
                    ${orgAddress}<br>
                    IČO: ${invoicing.ico || ""} · DIČ: ${invoicing.dic || ""}<br>
                    IČ DPH: ${invoicing.icDph || ""}<br>
                    ${invoicing.email || ""} · ${invoicing.phone || ""}
                </div>
            </div>
        </div>
        <div class="header-right">
            <div class="doc-box">
                <div class="doc-title">${t.docTitle}</div>
                <div class="doc-number">${tr(calculation.name) || calculation.calculationNumber}</div>
                <div style="font-size:10px;color:#666;margin-top:5px;">${currentDate}</div>
            </div>
        </div>
    </div>

    <!-- Customer info -->
    <div class="customer-row">
        <div class="customer-box">
            <div class="box-label">${t.customer}</div>
            <div class="customer-name">${clientName}</div>
            <div class="customer-details">
                ${clientAddress ? `${clientAddress}<br>` : ''}
                ${clientIco ? `IČO: ${clientIco}` : ''} ${clientDic ? `· DIČ: ${clientDic}` : ''}<br>
                ${clientIcDph ? `IČ DPH: ${clientIcDph}<br>` : ''}
                ${clientEmail}${clientPhone ? ` · ${clientPhone}` : ''}
            </div>
        </div>
        <div class="customer-box">
            <div class="box-label">${t.deliveryAddress}</div>
            <div class="customer-details" style="margin-top:8px;">
                ${clientAddress || (lang === 'de-AT' ? 'Österreich' : lang === 'en' ? 'Slovakia' : 'Slovenská republika')}
            </div>
        </div>
    </div>

    <!-- Dates -->
    <div class="dates-box">
        <div class="dates-row">
            <div class="date-item">
                <div class="date-label">${t.date}</div>
                <div class="date-value">${currentDate}</div>
            </div>
            <div class="date-item">
                <div class="date-label">${t.validity}</div>
                <div class="date-value">${validityDateStr}</div>
            </div>
            <div class="date-item">
                <div class="date-label">${t.deliveryTime}</div>
                <div class="date-value">${deliveryDays} ${t.workingDays}</div>
            </div>
        </div>
                </div>

    <!-- Items Table -->
    <div class="section-title">${t.items}</div>
    <table class="items-table">
        <thead>
            <tr>
                <th style="width:35%;">${t.name}</th>
                <th class="c" style="width:8%;">${t.count}</th>
                <th class="c" style="width:6%;">${t.unit}</th>
                <th class="r" style="width:12%;">${t.unitPrice}</th>
                <th class="r" style="width:12%;">${t.price}</th>
                <th class="c" style="width:7%;">${t.vat}%</th>
                <th class="r" style="width:10%;">${t.vat}</th>
                <th class="r" style="width:10%;">${t.total}</th>
            </tr>
        </thead>
        <tbody>
            ${allItems.map((item) => `
            <tr>
                <td>
                    <div class="item-name">${item.name}</div>
                    ${item.description ? `<div class="item-desc">${item.description}</div>` : ''}
            </td>
                <td class="c">${item.qty.toFixed(2)}</td>
                <td class="c">${item.unit}</td>
                <td class="r">${formatCurrency(item.unitPrice)}</td>
                <td class="r">${formatCurrency(item.total)}</td>
                <td class="c">${item.vatRate}%</td>
                <td class="r">${formatCurrency(item.vatAmount)}</td>
                <td class="r" style="font-weight:600;">${formatCurrency(item.totalWithVat)}</td>
            </tr>
            `).join('')}
        </tbody>
    </table>

    <!-- Summary -->
    <div class="summary-row">
        <div class="summary-left"></div>
        <div class="summary-right">
            <div class="vat-table">
                <div class="vat-header">
                    <div class="vat-header-cell" style="width:40%;">${t.vat} ${effectiveVatRate}%</div>
                    <div class="vat-header-cell" style="width:30%;">${t.vatBase}</div>
                    <div class="vat-header-cell" style="width:30%;text-align:right;">${t.total}</div>
                </div>
                <div class="vat-row">
                    <div class="vat-cell" style="width:40%;">${isForeign ? t.reverseCharge : `${t.vat} ${effectiveVatRate}%`}</div>
                    <div class="vat-cell" style="width:30%;">${formatCurrency(globalTotal)}</div>
                    <div class="vat-cell" style="width:30%;text-align:right;">${formatCurrency(totalWithVat)}</div>
                </div>
                <div class="vat-total-row">
                    <div class="vat-total-label">${isForeign ? t.totalNet : t.totalToPay}</div>
                    <div class="vat-total-value">${formatCurrency(totalWithVat)}</div>
                </div>
            </div>
        </div>
    </div>

    <!-- Conditions -->
    <div class="conditions-box">
        <div class="conditions-title">${t.conditions}</div>
        <div class="conditions-item">
            <div class="conditions-label">${t.deliveryTime}:</div>
            <div class="conditions-value">${deliveryDays} ${t.workingDays}</div>
        </div>
        <div class="conditions-item">
            <div class="conditions-label">${t.offerValidity}:</div>
            <div class="conditions-value">14 ${t.days}</div>
        </div>
        ${isForeign ? `
        <div class="conditions-item">
            <div class="conditions-label">${t.vat}:</div>
            <div class="conditions-value">${t.reverseCharge}</div>
        </div>
    ` : ''}
    </div>

    <!-- Footer bar -->
    <div class="footer-bar">
        <div class="footer-bar-item" style="width:50%;">
            <div class="footer-bar-label">Telefónne číslo:</div>
            <div class="footer-bar-value">${invoicing.phone || ""}</div>
        </div>
        <div class="footer-bar-item" style="width:50%; text-align:right;">
            <div class="footer-bar-label">Email:</div>
            <div class="footer-bar-value">${invoicing.email || ""}</div>
        </div>
    </div>

    <!-- Footer -->
    <div class="footer">
        <div class="footer-center">${t.footer}</div>
    </div>
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
