

async function DetectIndustry(searchQdrant, callLLM) {
    console.log("\n🔍 Step 1: Detecting industry from Qdrant data...");

    // Fetch a broad sample from Qdrant
    const samples = await searchQdrant("company business products services overview about us", 10);
    const context = samples.join("\n\n").slice(0, 4000);

    const response = await callLLM(
        `You are an expert business analyst. Analyze the provided content and detect the industry and business type.
Return ONLY a JSON object like this (no extra text):
{
  "industry": "E-commerce",
  "business_type": "Online retail store selling fashion products",
  "key_topics": ["products", "shipping", "returns", "discounts"],
  "suggested_agents": ["Manager Agent", "Sales Agent", "Support Agent", "Returns Agent", "Marketing Agent"]
}`,
        `Analyze this content and detect the industry:\n\n${context}`
    );

    try {
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

module.exports = { DetectIndustry };
