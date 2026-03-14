const axios = require("axios");

const dotenv = require("dotenv");
dotenv.config();

const BEDROCK_REGION =
    process.env.BEDROCK_REGION ||
    process.env.AWS_REGION ||
    process.env.AWS_DEFAULT_REGION ||
    "us-east-1";
const BEDROCK_MODEL = process.env.BEDROCK_MODEL || "us.anthropic.claude-opus-4-1-20250805-v1:0";
const AWS_BEARER_TOKEN_BEDROCK = process.env.AWS_BEARER_TOKEN_BEDROCK || "";
const BEDROCK_ENDPOINT =
    `https://bedrock-runtime.us-east-1.amazonaws.com/model/${BEDROCK_MODEL}/invoke`;

async function CallLLM(systemPrompt, userMessage = ".", maxTokens = 2000, useCalude= true) {

    if (useCalude) {
        const { BedrockRuntimeClient, ConverseCommand } = require("@aws-sdk/client-bedrock-runtime");
        const client = new BedrockRuntimeClient({ region: BEDROCK_REGION });

        const command = new ConverseCommand({
            modelId: BEDROCK_MODEL,
            messages: [
                { role: "user", content: [{ text: userMessage }] },
            ],
            system: systemPrompt ? [{ text: systemPrompt }] : undefined,
            inferenceConfig: {
                maxTokens,
            },
        });

        try {
            const response = await client.send(command);
            return response?.output?.message?.content?.[0]?.text || "";
        } catch (error) {
            console.error("Error calling Bedrock:", error);
            let content = error.response?.data?.choices?.[0]?.message?.content || "";
            if (!content) {
                content = error?.message || "";
            }
            return content;
        }
    }

    try {
        if (!AWS_BEARER_TOKEN_BEDROCK) {
            throw new Error(
                "Missing Bedrock API key. Set AWS_BEARER_TOKEN_BEDROCK or BEDROCK_API_KEY."
            );
        }

        const res = await axios.post(
            BEDROCK_ENDPOINT,
            {
                model: BEDROCK_MODEL,
                max_tokens: maxTokens,
                messages: [
                    { role: "system", content: systemPrompt },
                    { role: "user", content: userMessage },
                ],
            },
            {
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${AWS_BEARER_TOKEN_BEDROCK}`,
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
        if (!content) {
            content = error?.message || "";
        }
        // Strip <reasoning> tags from GPT-OSS
        content = content.replace(/<reasoning>[\s\S]*?<\/reasoning>/g, "").trim();
        return content;

    }
}

module.exports = { CallLLM };
