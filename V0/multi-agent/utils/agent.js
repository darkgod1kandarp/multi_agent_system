const { CallLLM } = require('../component/llm');
const { agentConciusness, detectIndustryPrompt, generateAgentsSystemPrompt, generateAgentsUserPrompt, createNewAgentPrompt, updateAgentPrompt, parseUpdateRequestPrompt } = require('./prompt');

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



async function GenerateAgents(industryInfo, callLLM) {
  try {
    const response = await callLLM(
        generateAgentsSystemPrompt,
        generateAgentsUserPrompt(industryInfo),
        8000
    );
        console.log("LLM Response for Agent Generation:", response);
  
        const cleaned = response.replace(/```json|```/g, "").trim();
        const agents  = JSON.parse(cleaned);
        return agents;
    } catch (e) {
        console.error("Could not parse agents JSON:", e.message);
        return [];
    }
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
