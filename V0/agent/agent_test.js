const dotenv = require('dotenv');
dotenv.config();

const BEDROCK_API_KEY = process.env.BEDROCK_API_KEY; // Your single Bedrock API key
const BEDROCK_ENDPOINT = "https://bedrock-runtime.us-east-1.amazonaws.com/model/openai.gpt-oss-120b-1:0/invoke"; // Full OpenAI-compatible endpoint URL

const MODEL_ID = 'openai.gpt-oss-120b-1:0';

const PROMPT = 'Explain the concept of recursion in programming with a simple example.';

async function callBedrock(prompt) {
    if (!BEDROCK_API_KEY) {
        throw new Error('BEDROCK_API_KEY is not set. Add it to your .env file.');
    }
    if (!BEDROCK_ENDPOINT) {
        throw new Error('BEDROCK_ENDPOINT is not set. Set it to your Bedrock OpenAI-compatible endpoint URL in .env.');
    }

    console.log('Calling Bedrock (OpenAI-compatible) API with prompt:', prompt);

    const body = {
        model: MODEL_ID,
        messages: [
            { role: 'system', content: 'You are a helpful assistant.' },
            { role: 'user', content: prompt },
        ],
        max_tokens: 512,
    };

    const response = await fetch(BEDROCK_ENDPOINT, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${BEDROCK_API_KEY}`,
        },
        body: JSON.stringify(body),
    });

    if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        throw new Error(`Bedrock API error ${response.status}: ${errorText}`);
    }

    const data = await response.json();

    if (!data.choices || !data.choices[0] || !data.choices[0].message) {
        throw new Error('Unexpected Bedrock response format');
    }

    return data.choices[0].message.content;
}

callBedrock(PROMPT)
    .then(response => {
        console.log('Bedrock Response:');
        console.log(response);
    })
    .catch(error => {
        console.error('Error calling Bedrock API:', error.message || error);
    });
