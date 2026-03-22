const axios = require('axios');
const { Firecrawl } = require('@mendable/firecrawl-js');
const { CallLLM } = require('./llm');

const VOMYRA_CALL_URL = 'https://vomyra.com/api/crm-call';

function getFirecrawl() {
    return new Firecrawl({ apiKey: process.env.FIRECRAWL_API_KEY });
}

/**
 * Make a single call to one customer via Vomyra API.
 */
async function makeCall({ customerNumber, assignedNumber, name, apiKey, ...extraData }) {
    if (!customerNumber || !assignedNumber || !name) {
        throw new Error('customerNumber, assignedNumber and name are required.');
    }
    const payload = {
        customerNumber: String(customerNumber).replace(/\D/g, ''),
        assisgnedNumber: String(assignedNumber).replace(/\D/g, ''),
        customerCountryCode: String(extraData.customerCountryCode || process.env.VOMYRA_COUNTRY_CODE || '91'),
        name,
        ...extraData,
    };
    console.log('[Caller] Sending payload:', JSON.stringify(payload));
    try {
        const res = await axios.post(VOMYRA_CALL_URL, payload, {
            headers: {
                Authorization: `Bearer ${apiKey || process.env.VOMYRA_API_KEY}`,
                'Content-Type': 'application/json',
            },
            timeout: 15000,
        });
        return res.data;
    } catch (e) {
        console.error('[Caller] API error:', e.response?.status, JSON.stringify(e.response?.data));
        throw e;
    }
}

/**
 * Search Google (via Firecrawl) for potential customers, extract phone numbers
 * and call each one.
 */
async function bulkCallLeads({ query, url, assignedNumber, intent, apiKey, agentName, companyName }) {
    const apiKeyToUse = apiKey || process.env.VOMYRA_API_KEY;
    if (!apiKeyToUse) throw new Error('VOMYRA_API_KEY is not configured.');

    // ── 1. Gather sites ───────────────────────────────────────────────────────
    let sites = [];
    if (query) {
        console.log(`[Caller] Searching leads: "${query}"`);
        const fc = getFirecrawl();
        const result = await fc.search(query, { limit: 5, scrapeOptions: { formats: ['markdown'] } });
        const hits = result?.web || [];
        for (const hit of hits) {
            let content = hit.markdown || '';
            try {
                const crawl = await fc.crawl(hit.url, { limit: 2, maxDepth: 1, scrapeOptions: { formats: ['markdown'] } });
                content = (crawl.data || []).map(p => p.markdown).filter(Boolean).join('\n\n') || content;
            } catch { /* use snippet */ }
            sites.push({ url: hit.url, content });
        }
    } else if (url) {
        console.log(`[Caller] Crawling: ${url}`);
        const fc = getFirecrawl();
        const crawl = await fc.crawl(url, { limit: 3, maxDepth: 2, scrapeOptions: { formats: ['markdown'] } });
        const content = (crawl.data || []).map(p => p.markdown).filter(Boolean).join('\n\n');
        sites.push({ url, content });
    } else {
        throw new Error('Either query or url is required.');
    }

    // ── 2. Extract phone numbers via LLM ────────────────────────────────────
    const allLeads = [];
    const seenNumbers = new Set();

    for (const site of sites) {
        if (!site.content || site.content.trim().length < 30) continue;
        const prompt = `Extract all contact information including phone numbers from this website content.

Website: ${site.url}
Content:
---
${site.content.slice(0, 6000)}
---

Return ONLY a valid JSON array. Each item must have at least a phone number:
[
  {
    "phone": "10-digit phone number digits only, e.g. 9898989898",
    "name": "Person or company name, or empty string",
    "company": "Company name or empty string"
  }
]

Rules:
- Only include entries with valid phone numbers (10 digits minimum)
- Strip all non-digit characters from phone numbers
- If no phone numbers found, return: []`;

        const raw = await CallLLM(prompt, '.', 800);
        try {
            const jsonMatch = raw.match(/\[[\s\S]*\]/);
            const leads = JSON.parse(jsonMatch ? jsonMatch[0] : raw.replace(/```json|```/g, '').trim());
            if (Array.isArray(leads)) {
                for (const lead of leads) {
                    const digits = String(lead.phone || '').replace(/\D/g, '');
                    if (digits.length >= 10 && !seenNumbers.has(digits)) {
                        seenNumbers.add(digits);
                        allLeads.push({ phone: digits, name: lead.name || 'Valued Customer', company: lead.company || '' });
                    }
                }
            }
        } catch { /* skip */ }
    }

    console.log(`[Caller] Found ${allLeads.length} phone number(s) across ${sites.length} site(s).`);

    if (allLeads.length === 0) {
        return { success: false, message: 'No phone numbers found on the provided source.', calls: [] };
    }

    // ── 3. Call each lead ───────────────────────────────────────────────────
    const results = [];
    for (const lead of allLeads) {
        try {
            const data = await makeCall({
                customerNumber: lead.phone,
                assignedNumber,
                name: lead.name,
                apiKey: apiKeyToUse,
                company: lead.company || undefined,
                purpose: intent || undefined,
            });
            console.log(`[Caller] Called ${lead.phone} — ${data.success ? 'success' : 'failed'}`);
            results.push({ phone: lead.phone, name: lead.name, company: lead.company, status: data.success ? 'called' : 'failed', response: data });
        } catch (e) {
            const errMsg = e.response?.data?.message || e.message;
            console.error(`[Caller] Failed for ${lead.phone}:`, errMsg);
            results.push({ phone: lead.phone, name: lead.name, company: lead.company, status: 'failed', error: errMsg });
        }
    }

    const calledCount = results.filter(r => r.status === 'called').length;
    return {
        success: true,
        message: `Found ${allLeads.length} lead(s). Successfully initiated ${calledCount} call(s).`,
        calls: results,
    };
}

module.exports = { makeCall, bulkCallLeads };
