const { Firecrawl } = require('@mendable/firecrawl-js');
const dotenv = require('dotenv');
dotenv.config();

const FIRECRAWL_API_KEY =  process.env.FIRECRAWL_API_KEY; 

async function runFireCrawl(url) {
    console.log('Running FireCrawl for URL:', url);
    console.log('Using FireCrawl API Key:', FIRECRAWL_API_KEY)
    try {
        const firecrawl = new Firecrawl({ apiKey: FIRECRAWL_API_KEY });
        const scrapeResponse = await firecrawl.scrape(url, {
                    formats: ['markdown', 'html'],
            });

        return { success: true, content: scrapeResponse.markdown };
    } catch (error) {
        console.error('Error running FireCrawl:', error);
        throw error;
    }
}

module.exports = { runFireCrawl };
