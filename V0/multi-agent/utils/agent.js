const { CallLLM } = require('../component/llm');
const { agentConciusness, detectIndustryPrompt, generateAgentsSystemPrompt, generateSingleAgentUserPrompt, createNewAgentPrompt, updateAgentPrompt } = require('./prompt');
const { uniqueNamesGenerator, adjectives, colors, animals } = require('unique-names-generator');

async function DetectIndustry(searchQdrantOrChunks, callLLM) {
    console.log("\n Step 1: Detecting industry...");

    // Accept either raw chunks array (faster, no Qdrant round-trip)
    // or a searchQdrant function (legacy path)
    let context;
    if (Array.isArray(searchQdrantOrChunks)) {
        context = searchQdrantOrChunks.join("\n\n").slice(0, 4000);
    } else {
        const samples = await searchQdrantOrChunks("company business products services overview about us", 10);
        context = samples.join("\n\n").slice(0, 4000);
    }

    const response = await callLLM(detectIndustryPrompt(context));
    try {
        const cleaned = response.replace(/```json|```/g, "").trim();
        const parsed  = JSON.parse(cleaned);
        console.log(`Company name: ${parsed.company_name}`);
        console.log(`Industry detected: ${parsed.industry}`);
        console.log(`Business type: ${parsed.business_type}`);
        console.log(`Suggested agents: ${parsed.suggested_agents.join(", ")}`);
        return parsed;
    } catch (e) {
        console.error("Could not parse industry JSON, using defaults");
        return {
            company_name    : "",
            industry        : "General Business",
            business_type   : "General business",
            key_topics      : ["sales", "support", "feedback"],
            suggested_agents: ["Manager Agent", "Sales Agent", "Support Agent", "Feedback Agent"],
        };
    }
}



async function ChatLLM(user_prompt, maxTokens = 4000) { 

    const response = await CallLLM(agentConciusness, user_prompt, maxTokens);
    return response;
 }


async function CreateNewAgent(agentInfo, finalisedAgents, callLLM) {

    //User is providing its thought to create new agent first we need to think if it is
    //  possible to create new agent with the given information and if it is possible then we 
    // will create new agent with its prompt and add it to the finalised list of agents othewise send 
    // response to user that we can not create new agent with the given information and also provide reason for it.
    
    const response = await callLLM(createNewAgentPrompt(agentInfo, finalisedAgents, "Master User"), ".", 8000);
    console.log("LLM Response for CreateNewAgent:", response);
    try {
        const cleaned = response.replace(/```json|```/g, "").trim();
        const parsed  = JSON.parse(cleaned);
        return parsed;
    }
    catch (e) {
        console.error("Could not parse CreateNewAgent JSON:", e.message);
        return { can_create: false, reason: "Error parsing LLM response" };
    }
}



// Normalise a suggested_agents entry — can be a plain string or an object
function resolveAgentEntry(entry) {
    if (typeof entry === 'string') return { name: entry, focus: null, tone: null };
    return {
        name: entry.agent_name || entry.name || 'Agent',
        focus: entry.focus || null,
        tone: entry.tone || null,
    };
}

// Try to parse agent JSON from LLM response
function tryParseAgent(response) {
    const cleaned = response.replace(/```json|```/g, "").trim();
    let parsed = JSON.parse(cleaned);
    if (Array.isArray(parsed)) parsed = parsed[0];
    return parsed;
}

// Pre-generate N guaranteed-unique names using the library
function preAssignUniqueNames(count) {
    const used = new Set();
    const names = [];
    while (names.length < count) {
        const candidate = uniqueNamesGenerator({
            dictionaries: [adjectives, colors, animals],
            separator: ' ',
            style: 'capital',
            length: 2,
        });
        if (!used.has(candidate)) {
            used.add(candidate);
            names.push(candidate);
        }
    }
    return names;
}

// Generates all agents in parallel — calls onAgent(agent) as each one finishes
async function GenerateAgents(industryInfo, callLLM, onAgent = null) {
    // Pre-assign one unique name per agent — guaranteed no collisions, zero extra API calls
    const preAssignedNames = preAssignUniqueNames(industryInfo.suggested_agents.length);

    // Build full planned roster upfront so every agent knows its siblings
    const plannedRoster = industryInfo.suggested_agents.map((entry, idx) => {
        const r = resolveAgentEntry(entry);
        return { name: preAssignedNames[idx], role: r.focus || r.name };
    });

    // Launch all agent generations in parallel
    const promises = industryInfo.suggested_agents.map(async (entry, idx) => {
        const agentEntry = resolveAgentEntry(entry);
        const assignedName = preAssignedNames[idx];
        console.log(`\n[Parallel] Generating agent: "${agentEntry.name}" → pre-assigned name "${assignedName}"...`);

        // Each agent sees all OTHER planned agents for scope deconfliction
        const otherAgents = plannedRoster.filter((_, i) => i !== idx);

        const nameInstruction = `\nYou MUST use this exact name for the agent: "${assignedName}". Do NOT choose a different name.`;

        let parsed = null;

        // Attempt 1: 6000 tokens
        try {
            const response = await callLLM(
                generateAgentsSystemPrompt,
                generateSingleAgentUserPrompt(agentEntry, industryInfo, otherAgents) + nameInstruction,
                6000
            );
            parsed = tryParseAgent(response);
        } catch (e) {
            console.warn(`[Attempt 1] "${assignedName}": ${e.message} — retrying...`);
        }

        // Attempt 2: retry with explicit brevity instruction + more tokens
        if (!parsed) {
            try {
                const retryPrompt = generateSingleAgentUserPrompt(agentEntry, industryInfo, otherAgents)
                    + nameInstruction
                    + `\n\nIMPORTANT: Previous response was too long and got cut off. Keep ALL text fields under 80 words each. JSON MUST be complete and valid.`;
                const retryResponse = await callLLM(generateAgentsSystemPrompt, retryPrompt, 8000);
                parsed = tryParseAgent(retryResponse);
                console.log(`[Attempt 2] Parsed "${assignedName}" successfully`);
            } catch (e2) {
                console.error(`[Attempt 2] Failed for "${assignedName}": ${e2.message} — skipping.`);
            }
        }

        // Enforce the pre-assigned name even if the LLM ignored the instruction
        if (parsed && parsed.name !== assignedName) {
            console.warn(`[Name] LLM used "${parsed.name}" instead of "${assignedName}" — overriding.`);
            parsed.name = assignedName;
        }

        return { idx, parsed };
    });

    // Wait for all to complete, preserve original order
    const results = await Promise.all(promises);
    const finalAgents = results
        .sort((a, b) => a.idx - b.idx)
        .map(r => r.parsed)
        .filter(Boolean);

    // Stream to frontend in order
    for (const agent of finalAgents) {
        if (onAgent) onAgent(agent);
    }

    return finalAgents;
}

async function UpdateAgent(agentInfo, otherAgents, callLLM) {
    
    console.log(agentInfo)
    const response = await callLLM(updateAgentPrompt(agentInfo, otherAgents, "Master User"), ".", 4000);
    console.log("LLM Response for UpdateAgent:", response);
    try {
        const cleaned = response.replace(/```json|```/g, "").trim();
        const parsed = JSON.parse(cleaned);
        return parsed;
    } catch (e) {
        console.error("Could not parse UpdateAgent JSON:", e.message);
        return { can_update: false, reason: 'Could not parse LLM response. Please try again.', prompt: null, Explanation: null };
    }
}

module.exports = { DetectIndustry, GenerateAgents, ChatLLM, CreateNewAgent, UpdateAgent };
