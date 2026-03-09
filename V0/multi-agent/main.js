const axios = require("axios");
const { runFireCrawl } = require('./component/firecrawl');  
const { GenerateEmbedding, CreateCollection, CollectionExists, InsertBulkIntoQdrant} = require('./component/qdrant_db');
const dotenv = require('dotenv');
const uuid = require('uuid');

dotenv.config();

const { SplitIntoChunks } = require('./utils/chunk_creation');


async function main() {
    const url = 'https://en.wikipedia.org/wiki/Artificial_intelligence';
    const crawlResult = await runFireCrawl(url);
    console.log('Crawl Result:', crawlResult);

    const chunks = SplitIntoChunks(crawlResult.content, chunkSize = 1000, overlap = 200);
    console.log('Chunks:', chunks);

    const embeddings = [];

    for (let i = 0; i < chunks.length; i++) {
        process.stdout.write(`\r   Progress: ${i + 1}/${chunks.length}`);
        const embedding = await GenerateEmbedding(chunks[i]);
        embeddings.push(embedding);

        // Small delay to avoid rate limiting
        await new Promise((r) => setTimeout(r, 100));
  }

    let collectionName = 'my_collection_1';

    const exists = await CollectionExists(collectionName);
    if (!exists) {
        console.log(`Collection "${collectionName}" does not exist. Creating...`);
        await CreateCollection(collectionName);
    }


    const points = chunks.map((chunk, index) => ({
        id: uuid.v4(),
        vector: embeddings[index],
        payload: {
                text        : chunk,
                source      : url,
                chunk_index : index,
                total_chunks: chunks.length,
                scraped_at  : new Date().toISOString(),
        },
    }));

    const validPoints = points.filter((point, index) => {

    if (!point.vector || !Array.isArray(point.vector) || point.vector.length === 0) {
        return false;
    }
    return true;
});

    const batchSize = 100;
    for (let i = 0; i < validPoints.length; i += batchSize) {
        const batch = validPoints.slice(i, i + batchSize);
        await InsertBulkIntoQdrant(collectionName, batch);
        console.log(`Inserted points ${i} to ${i + batch.length} into Qdrant`);
    }
}

main()
    .then(() => console.log('Done'))
    .catch(error => console.error('Error in main:', error));

