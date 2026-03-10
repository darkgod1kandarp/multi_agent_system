const axios = require('axios'); 

const dotenv = require('dotenv');
dotenv.config();

const BEDROCK_API_KEY = process.env.BEDROCK_API_KEY;
const BEDROCK_MODEL = 'openai.gpt-oss-120b-1:0';
const BEDROCK_ENDPOINT = process.env.BEDROCK_ENDPOINT || `https://bedrock-runtime.us-east-1.amazonaws.com/model/${BEDROCK_MODEL}/invoke`;

async function CallLLM(systemPrompt, userMessage, maxTokens = 2000) {

    console.log("Calling LLM with system prompt:", BEDROCK_ENDPOINT);
    try {
    const res = await axios.post(
        BEDROCK_ENDPOINT,
        {
            model      : BEDROCK_MODEL,
            max_tokens : maxTokens,
            messages   : [
                { role: "system", content: systemPrompt },
                { role: "user",   content: userMessage  },
            ],
        },
        {
            headers: {
                "Content-Type" : "application/json",
                "Authorization": `Bearer ${BEDROCK_API_KEY}`,
            },
            timeout: 60000,
        }
    );

        let content = res.data?.choices?.[0]?.message?.content || "";

        // Strip <reasoning> tags from GPT-OSS
        content = content.replace(/<reasoning>[\s\S]*?<\/reasoning>/g, "").trim();

        return content;

    } catch (error) {
        console.error("Error calling LLM:", error);
        let content = error.response?.data?.choices?.[0]?.message?.content || "";
        // Strip <reasoning> tags from GPT-OSS
        content = content.replace(/<reasoning>[\s\S]*?<\/reasoning>/g, "").trim();
        return content;

    }
}

module.exports = { CallLLM };