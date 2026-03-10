

async function DetectIndustry(searchQdrant, callLLM) {
    console.log("\n🔍 Step 1: Detecting industry from Qdrant data...");

    // Fetch a broad sample from Qdrant
    const samples = await searchQdrant("company business products services overview about us", 10);
    const context = samples.join("\n\n").slice(0, 4000);

    const response = await callLLM(
        `You are an expert business analyst and AI automation architect.

Analyze the provided business content and detect the industry and business type.

Then design AI agents that can be built using a voice AI platform like Vomyra.

The suggested agents must focus on capabilities such as:
- handling inbound and outbound phone calls
- answering customer questions
- capturing leads
- scheduling appointments
- processing orders or bookings
- providing customer support
- collecting feedback
- sending follow-ups

Return ONLY a JSON object (no extra text) in this format:

{
  "industry": "E-commerce",
  "business_type": "Online retail store selling fashion products",
  "key_topics": ["products", "shipping", "returns", "discounts"],
  "suggested_agents": [
    "Sales Inquiry Agent",
    "Customer Support Agent",
    "Order Tracking Agent",
    "Returns and Refund Agent",
    "Marketing and Follow-up Agent"
  ]
}

Analyze this content and detect the industry:

${context}`
    );

    try {
        console.log("LLM Response for Industry Detection:", response);
        const cleaned = response.replace(/```json|```/g, "").trim();
        console.log("LLM Response for Industry Detection:", cleaned);
        const parsed  = JSON.parse(cleaned);
        console.log(`Industry detected: ${parsed.industry}`);
        console.log(`Business type: ${parsed.business_type}`);
        console.log(`Suggested agents: ${parsed.suggested_agents.join(", ")}`);
        return parsed;
    } catch (e) {
        console.error("Could not parse industry JSON, using defaults");
        return {
            industry        : "General Business",
            business_type   : "General business",
            key_topics      : ["sales", "support", "feedback"],
            suggested_agents: ["Manager Agent", "Sales Agent", "Support Agent", "Feedback Agent"],
        };
    }
}

async function GenerateAgents(industryInfo, callLLM) {
  try {
    const agentList = industryInfo.suggested_agents.join(", ");

    const response = await callLLM(
        `You are a prompt engineering expert. Generate concise system prompts for AI agents.
Return ONLY a valid JSON array (no extra text, no markdown, no trailing commas):
[
  {
    "name": "Agent Name",
    "role": "short role description",
    "prompt": "System prompt (max 150 words)"
  }
]`,
        `Generate specialized agent prompts for a ${industryInfo.industry} business.
Business type   : ${industryInfo.business_type}
Key topics      : ${industryInfo.key_topics.join(", ")}
Agents to create: ${agentList}

Rules:
1. Each prompt MUST cover: role, RAG knowledge base access, escalation to Manager, and tone.
2. Include this exact sentence in every prompt: "You have access to a RAG knowledge base containing the full company website content. Always search it before answering."
3. Keep each prompt under 150 words so the full JSON fits within the token limit.
4. Make each agent's tone and focus distinct.`,
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

module.exports = { DetectIndustry, GenerateAgents};
