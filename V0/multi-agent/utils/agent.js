const { CallLLM } = require('../component/llm');
const { agentConciusness, detectIndustryPrompt, generateAgentsSystemPrompt, generateSingleAgentUserPrompt, createNewAgentPrompt, updateAgentPrompt } = require('./prompt');

async function DetectIndustry(searchQdrant, callLLM) {
    console.log("\n Step 1: Detecting industry from Qdrant data...");

    // Fetch a broad sample from Qdrant
    const samples = await searchQdrant("company business products services overview about us", 10);
    const context = samples.join("\n\n").slice(0, 4000);

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

// Generates agents one by one — calls onAgent(agent) immediately after each is ready
async function GenerateAgents(industryInfo, callLLM, onAgent = null) {
    const agents = [];
    for (const entry of industryInfo.suggested_agents) {
        const agentEntry = resolveAgentEntry(entry);
        console.log(`\n Generating agent: "${agentEntry.name}"...`);

        let parsed = null;

        // Attempt 1: normal call with 6000 tokens
        try {
            const response = await callLLM(
                generateAgentsSystemPrompt,
                generateSingleAgentUserPrompt(agentEntry, industryInfo, agents),
                6000
            );
            parsed = tryParseAgent(response);
        } catch (e) {
            console.warn(`[Attempt 1] Could not parse agent "${agentEntry.name}": ${e.message} — retrying with shorter prompt...`);
        }

        // Attempt 2: retry with explicit brevity instruction
        if (!parsed) {
            try {
                const retryUserPrompt = generateSingleAgentUserPrompt(agentEntry, industryInfo, agents)
                    + `\n\nIMPORTANT: Your previous response was too long and got cut off. This time keep ALL text fields (identity, task, prompt, Explanation) SHORT — under 80 words each. The JSON MUST be complete and valid.`;
                const retryResponse = await callLLM(generateAgentsSystemPrompt, retryUserPrompt, 8000);
                parsed = tryParseAgent(retryResponse);
                console.log(`[Attempt 2] Successfully parsed agent "${agentEntry.name}"`);
            } catch (e2) {
                console.error(`[Attempt 2] Still could not parse agent "${agentEntry.name}": ${e2.message} — skipping.`);
            }
        }

        if (parsed) {
            agents.push(parsed);
            if (onAgent) onAgent(parsed);
        }
    }
    return agents;
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
