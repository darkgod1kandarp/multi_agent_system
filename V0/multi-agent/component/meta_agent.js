const { StateGraph, END, START } = require('@langchain/langgraph');
const { DynamicStructuredTool }  = require('@langchain/core/tools');
const { z }      = require('zod');
const { Client } = require('pg');
const dotenv = require('dotenv');

dotenv.config();

const SUPABASE_DB_URL = process.env.SUPABASE_DB_URL;
if (!SUPABASE_DB_URL) {
    console.warn('MetaAgent: SUPABASE_DB_URL is not set. SQL tool will fail.');
}

async function withClient(fn) {
    const client = new Client({ connectionString: SUPABASE_DB_URL });
    await client.connect();
    try {
        return await fn(client);
    } finally {
        await client.end();
    }
}

// ─── Single Tool: full SQL access ────────────────────────────────────────────

const dbTool = new DynamicStructuredTool({
    name        : 'execute_sql',
    description : 'Execute any SQL against the Vomyara Postgres database (Supabase) — reads (SELECT/SHOW/WITH) and writes (INSERT, UPDATE, DELETE, ALTER TABLE, CREATE TABLE). Runs all statements in order.',
    schema      : z.object({
        statements: z.array(z.string()).describe('SQL statements to run in order.'),
    }),
    func: async ({ statements }) => {
        const results = [];
        await withClient(async (client) => {
            for (const sql of statements) {
                try {
                    const trimmed = sql.trim();
                    const upper   = trimmed.toUpperCase();
                    if (upper.startsWith('SELECT') || upper.startsWith('SHOW') || upper.startsWith('WITH')) {
                        const res = await client.query(trimmed);
                        results.push({ sql: trimmed, rows: res.rows });
                    } else {
                        const res = await client.query(trimmed);
                        results.push({ sql: trimmed, rowCount: res.rowCount });
                    }
                } catch (e) {
                    results.push({ sql, error: e.message });
                }
            }
        });
        return JSON.stringify(results, null, 2);
    },
});


async function readDBState() {
    return await withClient(async (client) => {
        const tablesRes = await client.query(
            `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name`
        );
        const tables = tablesRes.rows.map(r => r.table_name);

        const schema = {};
        for (const t of tables) {
            const colsRes = await client.query(
                `SELECT column_name, data_type, is_nullable
                 FROM information_schema.columns
                 WHERE table_schema = 'public' AND table_name = $1
                 ORDER BY ordinal_position`,
                [t]
            );
            const pkRes = await client.query(
                `SELECT kcu.column_name
                 FROM information_schema.table_constraints tc
                 JOIN information_schema.key_column_usage kcu
                   ON tc.constraint_name = kcu.constraint_name
                  AND tc.table_schema = kcu.table_schema
                 WHERE tc.table_schema = 'public'
                   AND tc.table_name = $1
                   AND tc.constraint_type = 'PRIMARY KEY'`,
                [t]
            );
            const pkSet = new Set(pkRes.rows.map(r => r.column_name));
            schema[t] = colsRes.rows.map(c => ({
                name: c.column_name,
                type: c.data_type,
                notnull: c.is_nullable === 'NO',
                pk: pkSet.has(c.column_name),
            }));
        }

        const groupsRes = await client.query(`SELECT * FROM agent_groups ORDER BY created_at DESC`);
        const agentsRes = await client.query(`SELECT id, group_id, name, role FROM agents`);

        return { schema, groups: groupsRes.rows, agents: agentsRes.rows };
    });
}

function generateSQLPrompt(userGoal, dbState, previousAttempt) {
    const retrySection = previousAttempt
        ? `\nPREVIOUS ATTEMPT FAILED:\nSQL attempted:\n${previousAttempt.sqls.map(s => `  ${s}`).join('\n')}\nIssues found:\n${previousAttempt.issues.map(i => `  - ${i}`).join('\n')}\nFix these issues in your new SQL.\n`
        : '';

    return `You are a database engineer with full access to the Vomyara Postgres database (Supabase).

CURRENT DATABASE STATE (schema + data):
${JSON.stringify(dbState, null, 2)}
${retrySection}
USER GOAL:
"${userGoal}"

Write the exact SQL statements to achieve this goal.
You can use any SQL: SELECT, PRAGMA, INSERT, UPDATE, DELETE, ALTER TABLE, CREATE TABLE, etc.

Important notes about the schema:
- agent_groups holds company info: company_name, industry, business_type, source_url, qdrant_collection
- agents holds agent configs: the "data" column is JSONB containing all agent fields (name, role, prompt, tone, identity, instructions[], guardrails[])
  To update an agent field, use: UPDATE agents SET data = jsonb_set(data, '{field}', '"value"'::jsonb) WHERE name = '...' AND group_id = '...'
  Or read + modify JSON with: data->>'field'

Return ONLY a valid JSON array of SQL strings (no markdown, no explanation):
["SQL 1", "SQL 2", ...]`;
}

function verifyPrompt(userGoal, stateBefore, stateAfter, previousIssues) {
    const priorSection = previousIssues.length
        ? `\nPrevious issues: ${previousIssues.join(', ')}\n`
        : '';

    return `You are verifying whether a database change achieved the intended goal.
${priorSection}
USER GOAL:
"${userGoal}"

DB STATE BEFORE:
${JSON.stringify(stateBefore, null, 2)}

DB STATE AFTER:
${JSON.stringify(stateAfter, null, 2)}

Has the goal been fully achieved? Check carefully by comparing before vs after.

Return ONLY valid JSON (no markdown):
{
    "achieved": true or false,
    "issues": ["specific issue if not achieved, empty array if done"],
    "reply": "Plain text message to the user. Confirm what changed, or explain what still needs fixing. No markdown."
}`;
}


async function nodeReadState(state) {
    console.log('[MetaAgent][read_state] Reading DB...');
    const dbState = await readDBState();
    return { dbState, stateBefore: dbState };
}

async function nodeGenerateSQL(state) {
    console.log(`[MetaAgent][generate_sql] Attempt ${state.retries + 1}/${state.maxRetries}`);
    const raw = await state.callLLM(
        generateSQLPrompt(state.userGoal, state.dbState, state.previousAttempt),
        '.', 2000
    );
    console.log('[MetaAgent][generate_sql] LLM output:', raw);

    let sqls = [];
    try {
        sqls = JSON.parse(raw.replace(/```json|```/g, '').trim());
        if (!Array.isArray(sqls)) sqls = [sqls];
    } catch (e) {
        console.error('[MetaAgent][generate_sql] Parse error:', e.message);
    }
    return { sqls };
}

async function nodeExecuteSQL(state) {
    console.log(`[MetaAgent][execute_sql] Running ${state.sqls.length} statement(s)...`);
    let executionResult = '[]';
    if (state.sqls.length > 0) {
        executionResult = await dbTool.func({ statements: state.sqls });
    }
    console.log('[MetaAgent][execute_sql] Result:', executionResult);
    const dbState = await readDBState();   // re-read after writes
    return { executionResult, dbState };
}

async function nodeVerifyState(state) {
    console.log('[MetaAgent][verify_state] Verifying...');
    const raw = await state.callLLM(
        verifyPrompt(state.userGoal, state.stateBefore, state.dbState, state.issues || []),
        '.', 800
    );
    console.log('[MetaAgent][verify_state] Raw:', raw);

    let verification = { achieved: true, issues: [], reply: 'Done! Your database has been updated.' };
    try {
        verification = JSON.parse(raw.replace(/```json|```/g, '').trim());
    } catch (e) {
        console.error('[MetaAgent][verify_state] Parse error:', e.message);
    }

    return {
        verification,
        issues          : verification.issues || [],
        previousAttempt : !verification.achieved ? { sqls: state.sqls, issues: verification.issues } : null,
        retries         : state.retries + 1,
        finalReply      : verification.reply,
    };
}

async function nodeRespond({ finalReply }) {
    console.log('[MetaAgent][respond]', finalReply);
    return { finalReply: finalReply || 'Done!' };
}

// ─── Conditional Edge ─────────────────────────────────────────────────────────

function shouldRetry(state) {
    if (state.verification?.achieved)      return 'respond';
    if (state.retries >= state.maxRetries) return 'respond';
    return 'generate_sql';   // ← loop back, LLM fixes using previousAttempt issues
}

// ─── Build LangGraph ──────────────────────────────────────────────────────────

function buildGraph() {
    const graph = new StateGraph({
        channels: {
            userGoal        : { value: (a, b) => b ?? a, default: () => '' },
            callLLM         : { value: (a, b) => b ?? a, default: () => null },
            maxRetries      : { value: (a, b) => b ?? a, default: () => 3 },
            retries         : { value: (a, b) => b ?? a, default: () => 0 },
            dbState         : { value: (a, b) => b ?? a, default: () => null },
            stateBefore     : { value: (a, b) => b ?? a, default: () => null },
            sqls            : { value: (a, b) => b ?? a, default: () => [] },
            executionResult : { value: (a, b) => b ?? a, default: () => '' },
            verification    : { value: (a, b) => b ?? a, default: () => null },
            issues          : { value: (a, b) => b ?? a, default: () => [] },
            previousAttempt : { value: (a, b) => b ?? a, default: () => null },
            finalReply      : { value: (a, b) => b ?? a, default: () => '' },
        },
    });

    graph.addNode('read_state',   nodeReadState);
    graph.addNode('generate_sql', nodeGenerateSQL);
    graph.addNode('execute_sql',  nodeExecuteSQL);
    graph.addNode('verify_state', nodeVerifyState);
    graph.addNode('respond',      nodeRespond);

    graph.addEdge(START,          'read_state');
    graph.addEdge('read_state',   'generate_sql');
    graph.addEdge('generate_sql', 'execute_sql');
    graph.addEdge('execute_sql',  'verify_state');

    graph.addConditionalEdges('verify_state', shouldRetry, {
        generate_sql : 'generate_sql',   // ← the loop
        respond      : 'respond',
    });

    graph.addEdge('respond', END);

    return graph.compile();
}

const compiledGraph = buildGraph();


async function runMetaAgent(userGoal, groupId, callLLM, maxRetries = 3) {
    console.log(`\n[MetaAgent] Start — group: ${groupId} | goal: "${userGoal}"`);

    const result = await compiledGraph.invoke({
        userGoal  : `Group ID in context: ${groupId}\n\nGoal: ${userGoal}`,
        callLLM,
        maxRetries,
        retries   : 0,
    });

    return result.finalReply || 'Done!';
}

module.exports = { runMetaAgent };
