const { Firecrawl } = require('@mendable/firecrawl-js');
const dotenv = require('dotenv');
dotenv.config();

const FIRECRAWL_API_KEY =  process.env.FIRECRAWL_API_KEY; 

async function runFireCrawl(url) {
    console.log('Running FireCrawl for URL:', url);
    console.log('Using FireCrawl API Key:', FIRECRAWL_API_KEY)
    try {
        const firecrawl = new Firecrawl({ apiKey: FIRECRAWL_API_KEY });
        const crawlResponse = await firecrawl.crawl(url, {
                limit    : 5,
                maxDepth : 3,
                scrapeOptions: {
                    formats: ["markdown", "html"],
                },
            });

        const allContent = crawlResponse.data
            .map(page => page.markdown)
            .filter(Boolean)
            .join("\n\n---\n\n");

        return { success: true, content: allContent };
    } catch (error) {
        console.error('Error running FireCrawl:', error);
        throw error;
    }
}

module.exports = { runFireCrawl };
