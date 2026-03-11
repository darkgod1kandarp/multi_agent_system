const axios = require("axios");
const { runFireCrawl } = require('./component/firecrawl');  
const { GenerateEmbedding, CreateCollection, CollectionExists, InsertBulkIntoQdrant, SearchQdrant} = require('./component/qdrant_db');
const dotenv = require('dotenv');
const uuid = require('uuid');
const { llm } = require('./component/llm');
dotenv.config();

// Server setup (if needed for future extensions)
const path = require("path");
const express = require("express");
const cors = require("cors");
const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'frontend')));


const { SplitIntoChunks } = require('./utils/chunk_creation');
const { CallLLM } = require('./component/llm');  
const { DetectIndustry, GenerateAgents, ChatLLM, CreateNewAgent, UpdateAgent } = require('./utils/agent');

// In-memory store for finalized agents
const finalizedAgents = {};

// Maps agentId (group ID) → Qdrant collectionName for RAG lookups
const ragCollections = {};

app.post("/agent/new/", async (req, res) => {
    const { message, existingAgents } = req.body;

    if (!message) {
        return res.status(400).json({ error: "Message is required" });
    }

    // Merge frontend's current agents with finalized agents, deduplicated by name
    const allKnownAgents = [
        ...Object.values(finalizedAgents),
        ...(existingAgents || []).filter(ea => !Object.values(finalizedAgents).some(fa => fa.name === ea.name)),
    ];

    try {
        const response = await CreateNewAgent(message, allKnownAgents, CallLLM);
        console.log('CreateNewAgent response:', response);
        res.json({ response });
    }
    catch (error) {
        console.error('Error in CreateNewAgent:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

app.post("/agent/update", async (req, res) => {
    const { agent, existingAgents } = req.body;
    if (!agent || !agent.name || !agent.role) {
        return res.status(400).json({ error: "agent with name and role is required" });
    }
    const otherAgents = (existingAgents || []).filter(a => a.name !== agent.name);
    try {
        const response = await UpdateAgent(agent, otherAgents, CallLLM);
        console.log('UpdateAgent response:', response);
        res.json({ response });
    } catch (error) {
        console.error('Error in UpdateAgent:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

app.post("/agent/finalize", (req, res) => {
    const { agents, groupId } = req.body;
    if (!Array.isArray(agents) || agents.length === 0) {
        return res.status(400).json({ error: "agents array is required" });
    }
    const id = groupId || uuid.v4();
    const records = agents.map(agent => ({ ...agent, finalizedAt: new Date().toISOString() }));
    finalizedAgents[id] = records;
    console.log(`Finalized ${agents.length} agent(s) under group [${id}]:`, agents.map(a => a.name).join(', '));
    res.json({ success: true, id, count: agents.length });
});

app.get("/agents/finalized", (req, res) => {
    res.json({ agents: finalizedAgents });
});

const extractURFromText = (text) => {
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    const urls = text.match(urlRegex);
    return urls ? urls[0] : null;
}

app.post("/creating/agent", (req, res) => {
    const { message } = req.body;      
    const url = extractURFromText(message);
    if (!url) {
        return res.status(400).json({ error: "No URL found in the message" });
    }

    main(url)
        .then(({ id, agents }) => {
            console.log('Generated Agents:', agents);
            res.json({ id, agents });
        })
        .catch(error => {
            console.error('Error in main:', error);
            res.status(500).json({ error: 'Internal Server Error' });
        });

});


app.post("/chat", async (req, res) => {
    const { message } = req.body;
    if (message?.toLowerCase().includes("create your agent")) {   

        //  Check if the message contains any text is present after "create your agent"   
        const afterPhrase = message.toLowerCase().split("create your agent")[1]?.trim();   
        if (!afterPhrase) {
            return res.status(400).json({ error: "Please provide a description or URL after 'create your agent'" });
        }     
         
        const url = extractURFromText(afterPhrase);   
        if (!url) {
            return res.status(400).json({ error: "No URL found in the message after 'create your agent'" });
        }       

        main(url)    
            .then(({ id, agents }) => {
                console.log('Generated Agents:', agents);
                res.json({ id, agents });
            })
            .catch(error => {
                console.error('Error in main:', error);
                res.status(500).json({ error: 'Internal Server Error' });
            });
    }

    try {
        const response = await ChatLLM(message);   
        res.json({ response });
    }
    catch (error) {
        console.error('Error in ChatLLM:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

app.post("/chat/orchestrate", async (req, res) => {
    const { message, agents, groupId } = req.body;
    if (!message) return res.status(400).json({ error: "message is required" });
    if (!Array.isArray(agents) || agents.length === 0) return res.status(400).json({ error: "agents array is required" });

    try {
        // Step 1: Fetch RAG context from Qdrant if we have a collection for this group
        let ragContext = '';
        const collectionName = groupId ? ragCollections[groupId] : null;
        if (collectionName) {
            try {
                const hits = await SearchQdrant(collectionName, message, 5);
                if (hits && hits.length > 0) {
                    ragContext = '\n\nRelevant business context:\n' + hits.join('\n\n').slice(0, 3000);
                }
            } catch (e) {
                console.warn('RAG search failed, continuing without context:', e.message);
            }
        }

        // Try to get the company name form the RAG context to add more information for orchestrator to make better decision
        let companyName = '';  
        if (ragContext) {
            const companyMatch = SearchQdrant(collectionName, "company name", 1);
            if (companyMatch && companyMatch.length > 0) {
                companyName = companyMatch[0].text.split('\n')[0].slice(0, 100); // Take first line as company name, limit to 100 chars
            }

        }

        // Step 2: Orchestrator picks the best agent
        const agentList = agents.map((a, i) => `${i + 1}. Name: "${a.name}" | Role: "${a.role}"`).join('\n');
        const orchestratorSystem = `You are the main orchestrator agent. Your job is to read the user's message and decide which specialist agent is best suited to respond.\n\nAvailable agents:\n${agentList}\n\nReply with ONLY the exact agent name (no explanation, no punctuation) that should handle the user's message.`;

        const chosenName = (await CallLLM(orchestratorSystem, message, 50)).trim().replace(/^["']|["']$/g, '');

        // Fuzzy match on name
        const agent = agents.find(a => a.name.toLowerCase() === chosenName.toLowerCase())
            || agents.find(a => chosenName.toLowerCase().includes(a.name.toLowerCase()))
            || agents[0];

        // Step 3: Chosen agent responds, enriched with RAG context
        const agentSystem =  `You are agent for ${companyName}.  You never need to forgot your company. ${agent.prompt}\n\nYou are ${agent.name}, a ${agent.role}. You are given necessary context: ${ragContext}. Respond helpfully and stay in character. Don't add any markdown formatting. write in concise manner.`;
        const response = await CallLLM(agentSystem, message, 1000);

        res.json({ response, agent: { name: agent.name, role: agent.role } });
    } catch (error) {
        console.error('Error in orchestrate:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

async function main(url) {
    
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

    let collectionName = uuid.v4();
    const agentId = uuid.v4();
    ragCollections[agentId] = collectionName;

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

        const industryInfo = await DetectIndustry(
            async (query, topK) => await SearchQdrant(collectionName, query, topK),
            CallLLM
        );  

        const agents = await GenerateAgents(industryInfo, CallLLM);

       
        finalizedAgents[agentId] = agents;
        return { id: agentId, agents };

}


const server = app.listen(3001, () => {
  console.log(`✓ Server running on http://localhost:3001`);
  console.log("Server started:", new Date().toISOString());
});

server.on("error", (err) => {
  console.error("Server error:", err);
});