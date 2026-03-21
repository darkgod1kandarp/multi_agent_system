const nodemailer = require('nodemailer');
const { Firecrawl } = require('@mendable/firecrawl-js');
const { CallLLM } = require('./llm');

const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
    },
});

function getFirecrawl() {
    return new Firecrawl({ apiKey: process.env.FIRECRAWL_API_KEY });
}

/**
 * Step 1: Google search → return list of { url, snippet }
 */
async function searchForLeads(query, limit = 5) {
    console.log(`[LeadMailer] Searching: "${query}"`);
    const fc = getFirecrawl();
    const result = await fc.search(query, {
        limit,
        scrapeOptions: { formats: ['markdown'] },
    });
    const hits = result?.web || [];
    return hits.map(h => ({ url: h.url, content: h.markdown || '' })).filter(h => h.url);
}

/**
 * Step 2: Crawl a single URL deeply to get full page content.
 */
async function crawlSite(url) {
    console.log(`[LeadMailer] Crawling: ${url}`);
    try {
        const fc = getFirecrawl();
        const crawlResponse = await fc.crawl(url, {
            limit: 3,
            maxDepth: 2,
            scrapeOptions: { formats: ['markdown'] },
        });
        return (crawlResponse.data || [])
            .map(p => p.markdown)
            .filter(Boolean)
            .join('\n\n---\n\n');
    } catch (e) {
        console.warn(`[LeadMailer] Crawl failed for ${url}: ${e.message}`);
        return '';
    }
}

/**
 * Step 3: Use LLM to extract leads from scraped content.
 */
async function extractLeads(url, content) {
    if (!content || content.trim().length < 50) return [];

    const prompt = `You are a lead extraction assistant. Extract all contact information from this website content.

Look for: email addresses, person names, job titles, company name, phone numbers.

Website: ${url}
Content:
---
${content.slice(0, 8000)}
---

Return ONLY a valid JSON array (no markdown). Each item:
[
  {
    "email": "contact@example.com",
    "name": "Person name or empty string",
    "company": "Company name or empty string",
    "role": "Job title or empty string",
    "context": "One sentence about what this person/company does"
  }
]

If no emails found, return: []`;

    const raw = await CallLLM(prompt, '.', 1000);
    try {
        const leads = JSON.parse(raw.replace(/```json|```/g, '').trim());
        return Array.isArray(leads) ? leads.filter(l => l.email && l.email.includes('@')) : [];
    } catch {
        return [];
    }
}

/**
 * Step 4: Personalise an email body for a lead using LLM.
 */
async function personaliseEmail(lead, intent, senderName, senderCompany) {
    const prompt = `Write a short, friendly, professional outreach email.

Sender: ${senderName} from ${senderCompany}
Recipient: ${lead.name || 'the recipient'}${lead.role ? ` (${lead.role})` : ''} at ${lead.company || 'their company'}
About recipient: ${lead.context || 'No extra context'}
Purpose: ${intent}

Rules:
- Under 150 words
- Sound human, not templated
- Reference recipient's name and company naturally if available
- End with a soft call to action
- Plain text only, no markdown, no subject line

Return only the email body.`;

    const body = await CallLLM(prompt, '.', 600);
    return body.trim();
}

/**
 * Main export: search → crawl → extract → personalise → send
 */
async function sendLeadEmails({ query, url, intent, subject, senderName, senderCompany }) {
    let sites = [];

    if (query) {
        // Search-first flow: Google search → discover websites
        const searchHits = await searchForLeads(query, 5);
        for (const hit of searchHits) {
            // Use search snippet as a starting point, then crawl for more depth
            const deepContent = await crawlSite(hit.url);
            sites.push({ url: hit.url, content: deepContent || hit.content });
        }
    } else if (url) {
        // Direct URL flow
        const content = await crawlSite(url);
        sites.push({ url, content });
    } else {
        throw new Error('Either query or url is required.');
    }

    // Extract leads from all sites
    const allLeads = [];
    const seenEmails = new Set();
    for (const site of sites) {
        const leads = await extractLeads(site.url, site.content);
        for (const lead of leads) {
            if (!seenEmails.has(lead.email)) {
                seenEmails.add(lead.email);
                allLeads.push(lead);
            }
        }
    }

    console.log(`[LeadMailer] Found ${allLeads.length} unique lead(s) across ${sites.length} site(s).`);

    if (allLeads.length === 0) {
        return { success: false, message: 'No email addresses found.', sent: [] };
    }

    // Personalise and send
    const results = [];
    for (const lead of allLeads) {
        try {
            const body = await personaliseEmail(lead, intent, senderName, senderCompany);
            await transporter.sendMail({
                from: `"${senderName} — ${senderCompany}" <${process.env.EMAIL_USER}>`,
                to: lead.email,
                subject: subject || `A message from ${senderName} at ${senderCompany}`,
                text: body,
            });
            console.log(`[LeadMailer] Sent to ${lead.email}`);
            results.push({ email: lead.email, name: lead.name, company: lead.company, status: 'sent' });
        } catch (e) {
            console.error(`[LeadMailer] Failed for ${lead.email}:`, e.message);
            results.push({ email: lead.email, name: lead.name, company: lead.company, status: 'failed', error: e.message });
        }
    }

    const sentCount = results.filter(r => r.status === 'sent').length;
    return {
        success: true,
        message: `Found ${allLeads.length} lead(s) across ${sites.length} website(s). Sent ${sentCount} email(s).`,
        sent: results,
    };
}

module.exports = { sendLeadEmails };
