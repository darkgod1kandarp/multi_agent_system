const { QdrantClient } = require('@qdrant/js-client-rest');
const axios = require("axios");

const dotenv = require('dotenv');  
dotenv.config();


const client = new QdrantClient({
    url: process.env.QDRANT_URL,
    apiKey: process.env.QDRANT_API_KEY,
});


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
    const EMBEDDING_ENDPOINT = `https://bedrock-runtime.us-east-1.amazonaws.com/model/amazon.titan-embed-text-v2:0/invoke`;

    try {
        const res = await axios.post(
            EMBEDDING_ENDPOINT,
            { inputText: text },         
            {
                headers: {
                    "Content-Type" : "application/json",
                    "Accept"       : "application/json",  
                    "Authorization": `Bearer ${process.env.BEDROCK_API_KEY}`,
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

module.exports = { CreateCollection, GenerateEmbedding, CollectionExists, InsertBulkIntoQdrant };