const axios = require("axios");
const dotenv = require("dotenv");
dotenv.config();

const BEDROCK_REGION =
    process.env.BEDROCK_REGION ||
    process.env.AWS_REGION ||
    process.env.AWS_DEFAULT_REGION ||
    "us-east-1";

// ── Provider selection ────────────────────────────────────────────────────────
// Set LLM_PROVIDER=claude or LLM_PROVIDER=openai in .env
const LLM_PROVIDER = (process.env.LLM_PROVIDER || "openai").toLowerCase();

const CLAUDE_MODEL  = process.env.CLAUDE_MODEL  || "us.anthropic.claude-opus-4-1-20250805-v1:0";
const OPENAI_MODEL  = process.env.OPENAI_MODEL  || "openai.gpt-oss-120b-1:0";
const ACTIVE_MODEL  = LLM_PROVIDER === "claude" ? CLAUDE_MODEL : OPENAI_MODEL;

const AWS_BEARER_TOKEN = process.env.AWS_BEARER_TOKEN_BEDROCK || "";
const OPENAI_ENDPOINT  = process.env.BEDROCK_ENDPOINT ||
    `https://bedrock-runtime.${BEDROCK_REGION}.amazonaws.com/openai/v1/chat/completions`;

// Singleton client for Claude (ConverseCommand)
const { BedrockRuntimeClient, ConverseCommand } = require("@aws-sdk/client-bedrock-runtime");
const bedrockClient = new BedrockRuntimeClient({ region: BEDROCK_REGION });

console.log(`[LLM] Provider: ${LLM_PROVIDER.toUpperCase()} | Model: ${ACTIVE_MODEL}`);

// ── Claude via Bedrock ConverseCommand ────────────────────────────────────────
async function callClaude(systemPrompt, userMessage, maxTokens) {
    const command = new ConverseCommand({
        modelId: ACTIVE_MODEL,
        messages: [{ role: "user", content: [{ text: userMessage }] }],
        system: systemPrompt ? [{ text: systemPrompt }] : undefined,
        inferenceConfig: { maxTokens },
    });

    let delay = 2000;
    for (let attempt = 1; attempt <= 5; attempt++) {
        try {
            const response = await bedrockClient.send(command);
            return response?.output?.message?.content?.[0]?.text || "";
        } catch (error) {
            const is503 = error?.$metadata?.httpStatusCode === 503
                || error?.name === 'ServiceUnavailableException'
                || error?.message?.toLowerCase().includes('too many connections');

            if (is503 && attempt < 5) {
                console.warn(`[Claude] 503 — retry ${attempt}/4 in ${delay / 1000}s...`);
                await new Promise(r => setTimeout(r, delay));
                delay *= 2; // 2s → 4s → 8s → 16s
            } else {
                console.error("[Claude] Error:", error.message || error);
                return "";
            }
        }
    }
}

// ── OpenAI-compatible via Bedrock /openai/v1 endpoint ─────────────────────────
async function callOpenAI(systemPrompt, userMessage, maxTokens) {
    if (!AWS_BEARER_TOKEN) {
        console.error("[OpenAI] Missing AWS_BEARER_TOKEN_BEDROCK in .env");
        return "";
    }
    try {
        const res = await axios.post(
            OPENAI_ENDPOINT,
            {
                model: ACTIVE_MODEL,
                max_tokens: maxTokens,
                messages: [
                    { role: "system", content: systemPrompt },
                    { role: "user",   content: userMessage  },
                ],
            },
            {
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${AWS_BEARER_TOKEN}`,
                },
                timeout: 120000,
            }
        );
        let content = res.data?.choices?.[0]?.message?.content || "";
        // Strip <reasoning> tags emitted by GPT-OSS models
        content = content.replace(/<reasoning>[\s\S]*?<\/reasoning>/g, "").trim();
        return content;
    } catch (error) {
        console.error("[OpenAI] Error:", error.response?.data || error.message);
        let content = error.response?.data?.choices?.[0]?.message?.content || "";
        content = content.replace(/<reasoning>[\s\S]*?<\/reasoning>/g, "").trim();
        return content || "";
    }
}

// ── Public API ────────────────────────────────────────────────────────────────
async function CallLLM(systemPrompt, userMessage = ".", maxTokens = 2000) {
    if (LLM_PROVIDER === "claude") {
        return callClaude(systemPrompt, userMessage, maxTokens);
    }
    return callOpenAI(systemPrompt, userMessage, maxTokens);
}

module.exports = { CallLLM };
