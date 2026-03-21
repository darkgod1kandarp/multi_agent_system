const nodemailer = require('nodemailer');
const puppeteer = require('puppeteer');

const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
    },
});

function buildQuotationHTML({ customerName, companyName, agentName, items, totalAmount, validUntil, notes }) {
    const rows = (items || []).map(item => `
        <tr>
            <td style="padding:8px 12px;border-bottom:1px solid #eee">${item.description || 'Item'}</td>
            <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:right">${item.qty || 1}</td>
            <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:right">${item.price || 'To be discussed'}</td>
        </tr>`).join('');

    return `
    <div style="font-family:Arial,sans-serif;max-width:620px;margin:auto;border:1px solid #ddd;border-radius:8px;overflow:hidden">
        <div style="background:#4f46e5;padding:24px 32px">
            <h1 style="color:#fff;margin:0;font-size:22px">${companyName}</h1>
            <p style="color:#c7d2fe;margin:4px 0 0">Quotation</p>
        </div>
        <div style="padding:32px">
            <p>Dear <strong>${customerName}</strong>,</p>
            <p>Thank you for your interest. Here is your quotation as discussed with <strong>${agentName}</strong>:</p>

            <table style="width:100%;border-collapse:collapse;margin:20px 0">
                <thead>
                    <tr style="background:#f8f9ff">
                        <th style="padding:10px 12px;text-align:left;border-bottom:2px solid #4f46e5">Description</th>
                        <th style="padding:10px 12px;text-align:right;border-bottom:2px solid #4f46e5">Qty</th>
                        <th style="padding:10px 12px;text-align:right;border-bottom:2px solid #4f46e5">Price</th>
                    </tr>
                </thead>
                <tbody>${rows}</tbody>
                <tfoot>
                    <tr>
                        <td colspan="2" style="padding:12px;text-align:right;font-weight:bold">Total</td>
                        <td style="padding:12px;text-align:right;font-weight:bold;color:#4f46e5">${totalAmount || 'To be discussed'}</td>
                    </tr>
                </tfoot>
            </table>

            ${validUntil ? `<p style="color:#555">This quotation is valid until <strong>${validUntil}</strong>.</p>` : ''}
            ${notes ? `<p style="color:#555">${notes}</p>` : ''}

            <p>Feel free to reply to this email or call us for any queries.</p>
            <p>Best regards,<br/><strong>${agentName}</strong><br/>${companyName}</p>
        </div>
        <div style="background:#f8f9ff;padding:16px 32px;font-size:12px;color:#888;text-align:center">
            This quotation was generated automatically via Vomyra AI.
        </div>
    </div>`;
}

async function generatePDF(html) {
    const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    try {
        const page = await browser.newPage();
        await page.setContent(`<!DOCTYPE html><html><body>${html}</body></html>`, { waitUntil: 'networkidle0' });
        const pdf = await page.pdf({ format: 'A4', printBackground: true, margin: { top: '20px', bottom: '20px', left: '20px', right: '20px' } });
        return pdf;
    } finally {
        await browser.close();
    }
}

async function sendQuotationEmail({ to, customerName, companyName, agentName, items, totalAmount, validUntil, notes }) {
    const html = buildQuotationHTML({ customerName, companyName, agentName, items, totalAmount, validUntil, notes });
    const pdfBuffer = await generatePDF(html);

    await transporter.sendMail({
        from: `"${companyName}" <${process.env.EMAIL_USER}>`,
        to,
        subject: `Your Quotation from ${companyName}`,
        html,
        attachments: [
            {
                filename: `Quotation-${companyName.replace(/\s+/g, '_')}.pdf`,
                content: pdfBuffer,
                contentType: 'application/pdf',
            },
        ],
    });

    console.log(`[Email] Quotation with PDF sent to ${to}`);}

module.exports = { sendQuotationEmail };
