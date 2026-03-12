const { testingAgentPrompt, scopeValidationPrompt, scoreResponsePrompt, fixAgentPrompt } = require('../utils/prompt');

async function validateScope(agentInfo, callLLM) {
    const raw = await callLLM(scopeValidationPrompt(agentInfo), '.', 1000);
    try {
        const cleaned = raw.replace(/```json|```/g, '').trim();
        return JSON.parse(cleaned);
    } catch (e) {
        console.error('Could not parse scope validation JSON:', e.message);
        return { in_scope: false, violations: ['Could not parse LLM response'], summary: 'Scope check failed to parse.' };
    }
}

async function generateTestCases(agentInfo, callLLM) {
    const raw = await callLLM('You are a QA engineer generating test inputs.', testingAgentPrompt(agentInfo), 1500);
    try {
        const cleaned = raw.replace(/```json|```/g, '').trim();
        return JSON.parse(cleaned);
    } catch (e) {
        console.error('Could not parse test cases JSON:', e.message);
        return [];
    }
}

async function runAndScoreTestCase(testCase, agentInfo, callLLM) {
    // Simulate a real user talking to this agent
    const agentResponse = await callLLM(agentInfo.prompt, testCase, 600);

    const raw = await callLLM(scoreResponsePrompt(testCase, agentResponse, agentInfo), '.', 600);
    try {
        const cleaned = raw.replace(/```json|```/g, '').trim();
        const score = JSON.parse(cleaned);
        return { testCase, response: agentResponse, ...score };
    } catch (e) {
        console.error('Could not parse score JSON:', e.message);
        return { testCase, response: agentResponse, passed: false, score: 0, reason: 'Could not parse score.' };
    }
}

async function TestAgent(agentInfo, callLLM) {
    console.log(`\n[TestAgent] Starting tests for agent: "${agentInfo.name}"`);

    // 1. Scope validation
    console.log('[TestAgent] Step 1: Validating scope...');
    const scopeCheck = await validateScope(agentInfo, callLLM);
    console.log(`[TestAgent] Scope in_scope=${scopeCheck.in_scope}, violations=${JSON.stringify(scopeCheck.violations)}`);

    // 2. Generate test cases
    console.log('[TestAgent] Step 2: Generating test cases...');
    const testCases = await generateTestCases(agentInfo, callLLM);
    console.log(`[TestAgent] Generated ${testCases.length} test case(s)`);

    // 3. Run and score each test case
    console.log('[TestAgent] Step 3: Running test cases...');
    const testResults = [];
    for (const testCase of testCases) {
        const result = await runAndScoreTestCase(testCase, agentInfo, callLLM);
        console.log(`[TestAgent]   "${testCase.slice(0, 60)}..." → passed=${result.passed}, score=${result.score}`);
        testResults.push(result);
    }

    const allTestsPassed = testResults.length > 0 && testResults.every(r => r.passed);
    const avgScore = testResults.length > 0
        ? (testResults.reduce((sum, r) => sum + (r.score || 0), 0) / testResults.length).toFixed(1)
        : 0;
    const passed = scopeCheck.in_scope && allTestsPassed;

    console.log(`[TestAgent] Done. passed=${passed}, avgScore=${avgScore}`);

    return {
        passed,
        avgScore: parseFloat(avgScore),
        scopeCheck,
        testResults,
        summary: passed
            ? `Agent "${agentInfo.name}" passed all checks with an average score of ${avgScore}/5.`
            : `Agent "${agentInfo.name}" failed. Scope valid: ${scopeCheck.in_scope}. Tests passed: ${testResults.filter(r => r.passed).length}/${testResults.length}.`,
    };
}

async function TestAndFixAgent(agentInfo, callLLM, maxRetries = 3) {
    // Adding the agent's name to the info for better context in prompts
    let currentAgent = { ...agentInfo };

    // We will attempt to test and fix the agent up to maxRetries times
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        console.log(`\n[TestAndFixAgent] Attempt ${attempt}/${maxRetries} for agent: "${currentAgent.name}"`);

        
        const testResult = await TestAgent(currentAgent, callLLM);

        if (testResult.passed) {
            console.log(`[TestAndFixAgent] Agent passed on attempt ${attempt}`);
            return { ...testResult, attempts: attempt, finalAgent: currentAgent };
        }

        if (attempt === maxRetries) {
            console.log(`[TestAndFixAgent] Agent failed after ${maxRetries} attempts`);
            return { ...testResult, attempts: attempt, finalAgent: currentAgent };
        }

        console.log(`[TestAndFixAgent] Agent failed. Requesting LLM fix...`);
        const raw = await callLLM(fixAgentPrompt(currentAgent, testResult), '.', 2000);
        try {
            const cleaned = raw.replace(/```json|```/g, '').trim();
            const fixed = JSON.parse(cleaned);
            currentAgent = { ...currentAgent, ...fixed };
            console.log(`[TestAndFixAgent] Agent prompt fixed. Retrying...`);
        } catch (e) {
            console.error('[TestAndFixAgent] Could not parse fixed agent JSON:', e.message);
            return { ...testResult, attempts: attempt, finalAgent: currentAgent };
        }
    }
}

module.exports = { TestAgent, TestAndFixAgent };
