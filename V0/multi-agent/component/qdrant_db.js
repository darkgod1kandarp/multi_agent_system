const { QdrantClient } = require('@qdrant/js-client-rest');
const axios = require("axios");

const dotenv = require('dotenv');  
dotenv.config();


const client = new QdrantClient({
    url: process.env.QDRANT_URL,
    apiKey: process.env.QDRANT_API_KEY,
});

const BEDROCK_REGION =
    process.env.BEDROCK_REGION ||
    process.env.AWS_REGION ||
    process.env.AWS_DEFAULT_REGION ||
    "us-east-1";
const BEDROCK_API_KEY =
    process.env.AWS_BEARER_TOKEN_BEDROCK || process.env.BEDROCK_API_KEY || "";
const BEDROCK_EMBEDDING_MODEL =
    process.env.BEDROCK_EMBEDDING_MODEL || "amazon.titan-embed-text-v2:0";
const BEDROCK_EMBEDDING_ENDPOINT =
    process.env.BEDROCK_EMBEDDING_ENDPOINT ||
    `https://bedrock-runtime.${BEDROCK_REGION}.amazonaws.com/model/${BEDROCK_EMBEDDING_MODEL}/invoke`;


async function SearchQdrant(collectionName, query, topK = 5) {
    const queryVector = await GenerateEmbedding(query);
    if (!queryVector) {
        console.error('Failed to generate embedding for query');
        return [];
    }
    const results = await client.search(collectionName, {
        vector      : queryVector,
        limit       : topK,
        with_payload: true,
    });
    return results.map(r => r.payload?.text || "").filter(Boolean);
}

async function CreateCollection(collectionName) {
    try {
        await client.createCollection(collectionName, {
            vectors: {
                size: 1024,
                distance: 'Cosine',
            },
        });
        console.log('Collection created successfully');
    } catch (error) {
        console.error('Error creating collection:', error);
    }
}

async function GenerateEmbedding(text) {
    try {
        if (!BEDROCK_API_KEY) {
            console.error(
                "Missing Bedrock API key. Set AWS_BEARER_TOKEN_BEDROCK or BEDROCK_API_KEY."
            );
            return null;
        }

        const res = await axios.post(
            BEDROCK_EMBEDDING_ENDPOINT,
            { inputText: text },         
            {
                headers: {
                    "Content-Type" : "application/json",
                    "Accept"       : "application/json",  
                    "Authorization": `Bearer ${BEDROCK_API_KEY}`,
                },
                timeout: 15000,
            }
        );

        const vector = res.data?.embedding;  

        if (!vector || vector.length === 0) {
            console.error("Empty embedding returned");
            return null;
        }

        return vector;

    } catch (error) {
        const status = error.response?.status;
        const data = error.response?.data;
        console.error("Embedding error:", status || "", data || error.message);
        return null;
    }
}

async function CollectionExists(collectionName) {
    try {
        const { collections = [] } = await client.getCollections();
        return collections.some(col => col.name === collectionName);
    }
    catch (error) {
        console.error('Error checking collection existence:', error);
        return false;
    }
}

async function InsertBulkIntoQdrant(collectionName, points) {
    try {
        await client.upsert(collectionName, {
            points: points,
        });        
        console.log(`Points inserted successfully`);
    } catch (error) {
        console.error(`Error inserting points:`, error);
    }
}

module.exports = { CreateCollection, GenerateEmbedding, CollectionExists, InsertBulkIntoQdrant, SearchQdrant };
