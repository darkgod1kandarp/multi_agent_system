const { createClient } = require('@supabase/supabase-js');
const { v4: uuidv4 } = require('uuid');
const { Client } = require('pg');
const dotenv = require('dotenv');

dotenv.config();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
const SUPABASE_DB_URL = process.env.SUPABASE_DB_URL;


console.log("Supabase configuration:");
console.log(SUPABASE_URL, SUPABASE_KEY)

if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.warn(
        'Supabase: missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY/SUPABASE_ANON_KEY'
    );
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function ensureSchema() {
    if (!SUPABASE_DB_URL) {
        console.warn(
            'Supabase: SUPABASE_DB_URL not set. Auto-creation of tables is disabled.'
        );
        return false;
    }

    const client = new Client({ 
        connectionString: SUPABASE_DB_URL, 
        ssl: { rejectUnauthorized: false }
     });
    try {
        await client.connect();
        await client.query(`
            CREATE TABLE IF NOT EXISTS agent_groups (
                id TEXT PRIMARY KEY,
                source_url TEXT,
                qdrant_collection TEXT,
                industry TEXT,
                business_type TEXT,
                company_name TEXT,
                created_at TIMESTAMPTZ NOT NULL
            );

            CREATE TABLE IF NOT EXISTS agents (
                id TEXT PRIMARY KEY,
                group_id TEXT NOT NULL,
                name TEXT NOT NULL,
                role TEXT,
                data JSONB NOT NULL,
                finalized_at TIMESTAMPTZ NOT NULL
            );

            CREATE TABLE IF NOT EXISTS chat_history (
                id TEXT PRIMARY KEY,
                group_id TEXT,
                user_message TEXT NOT NULL,
                response TEXT NOT NULL,
                agent_name TEXT,
                agent_role TEXT,
                created_at TIMESTAMPTZ NOT NULL
            );

            CREATE TABLE IF NOT EXISTS users (
                id TEXT PRIMARY KEY,
                username TEXT NOT NULL UNIQUE,
                role TEXT NOT NULL DEFAULT 'normal',
                created_at TIMESTAMPTZ NOT NULL
            );
        `);
        return true;
    } catch (error) {
        console.error('Supabase ensureSchema error:', error.message);
        return false;
    } finally {
        await client.end();
    }
}

function normalizeAgentData(row) {
    if (!row) return null;
    const data = row.data;
    if (typeof data === 'string') {
        try {
            return JSON.parse(data);
        } catch {
            return null;
        }
    }
    return data || null;
}

async function saveAgentGroup({
    id,
    sourceUrl,
    qdrantCollection,
    industry,
    businessType,
    companyName,
}) {
    const now = new Date().toISOString();
    const basePayload = {
        id,
        source_url: sourceUrl ?? null,
        qdrant_collection: qdrantCollection ?? null,
        industry: industry ?? null,
        business_type: businessType ?? null,
        company_name: companyName ?? null,
        created_at: now,
    };

    const { data: existing, error: existsError } = await supabase
        .from('agent_groups')
        .select('id')
        .eq('id', id)
        .maybeSingle();
    if (existsError) {
        console.error('Supabase saveAgentGroup lookup error:', existsError.message);
        return false;
    }

    if (!existing) {
        const { error } = await supabase.from('agent_groups').insert(basePayload);
        if (error) {
            console.error('Supabase saveAgentGroup insert error:', error.message);
            return false;
        }
        return true;
    }

    const updatePayload = {};
    if (sourceUrl !== undefined && sourceUrl !== null) updatePayload.source_url = sourceUrl;
    if (qdrantCollection !== undefined && qdrantCollection !== null) updatePayload.qdrant_collection = qdrantCollection;
    if (industry !== undefined && industry !== null) updatePayload.industry = industry;
    if (businessType !== undefined && businessType !== null) updatePayload.business_type = businessType;
    if (companyName !== undefined && companyName !== null) updatePayload.company_name = companyName;

    if (Object.keys(updatePayload).length === 0) return true;

    const { error } = await supabase
        .from('agent_groups')
        .update(updatePayload)
        .eq('id', id);
    if (error) {
        console.error('Supabase saveAgentGroup update error:', error.message);
        return false;
    }
    return true;
}

async function getCompanyName(groupId) {
    const { data, error } = await supabase
        .from('agent_groups')
        .select('company_name')
        .eq('id', groupId)
        .single();
    if (error) {
        console.error('Supabase getCompanyName error:', error.message);
        return null;
    }
    return data?.company_name || null;
}

async function getAgentGroup(id) {
    const { data, error } = await supabase
        .from('agent_groups')
        .select('*')
        .eq('id', id)
        .single();
    if (error) {
        console.error('Supabase getAgentGroup error:', error.message);
        return null;
    }
    return data || null;
}

async function getAllAgentGroups() {
    const { data, error } = await supabase
        .from('agent_groups')
        .select('*')
        .order('created_at', { ascending: false });
    if (error) {
        console.error('Supabase getAllAgentGroups error:', error.message);
        return [];
    }
    return data || [];
}

async function getQdrantCollection(groupId) {
    const { data, error } = await supabase
        .from('agent_groups')
        .select('qdrant_collection')
        .eq('id', groupId)
        .single();
    if (error) {
        console.error('Supabase getQdrantCollection error:', error.message);
        return null;
    }
    return data?.qdrant_collection || null;
}

async function saveAgents(groupId, agents) {
    const rows = (agents || []).map((agent) => ({
        id: agent.id || uuidv4(),
        group_id: groupId,
        name: agent.name,
        role: agent.role || null,
        data: agent,
        finalized_at: agent.finalizedAt || new Date().toISOString(),
    }));
    if (!rows.length) return true;
    const { error } = await supabase
        .from('agents')
        .upsert(rows, { onConflict: 'id' });
    if (error) {
        console.error('Supabase saveAgents error:', error.message);
        return false;
    }
    return true;
}

async function getAgentsByGroup(groupId) {
    const { data, error } = await supabase
        .from('agents')
        .select('data')
        .eq('group_id', groupId)
        .order('finalized_at', { ascending: true });
    if (error) {
        console.error('Supabase getAgentsByGroup error:', error.message);
        return [];
    }
    return (data || [])
        .map((row) => normalizeAgentData(row))
        .filter(Boolean);
}

async function getAllFinalizedAgents() {
    const groups = await getAllAgentGroups();
    const result = {};
    for (const group of groups) {
        result[group.id] = await getAgentsByGroup(group.id);
    }
    return result;
}

async function saveChatMessage({
    id,
    groupId,
    userMessage,
    response,
    agentName,
    agentRole,
}) {
    const { error } = await supabase.from('chat_history').insert({
        id,
        group_id: groupId || null,
        user_message: userMessage,
        response,
        agent_name: agentName || null,
        agent_role: agentRole || null,
        created_at: new Date().toISOString(),
    });
    if (error) {
        console.error('Supabase saveChatMessage error:', error.message);
        return false;
    }
    return true;
}

async function getChatHistory(groupId, limit = 50) {
    const query = supabase
        .from('chat_history')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit);
    const { data, error } = groupId
        ? await query.eq('group_id', groupId)
        : await query;
    if (error) {
        console.error('Supabase getChatHistory error:', error.message);
        return [];
    }
    return data || [];
}

async function createUser({ id, username, role = 'normal' }) {
    const { error } = await supabase
        .from('users')
        .upsert(
            {
                id,
                username,
                role,
                created_at: new Date().toISOString(),
            },
            { onConflict: 'username' }
        );
    if (error) {
        console.error('Supabase createUser error:', error.message);
        return false;
    }
    return true;
}

async function getUserById(id) {
    const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('id', id)
        .single();
    if (error) {
        console.error('Supabase getUserById error:', error.message);
        return null;
    }
    return data || null;
}

async function getUserByUsername(username) {
    const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('username', username)
        .single();
    if (error) {
        console.error('Supabase getUserByUsername error:', error.message);
        return null;
    }
    return data || null;
}

async function getAllUsers() {
    const { data, error } = await supabase
        .from('users')
        .select('id, username, role, created_at')
        .order('created_at', { ascending: false });
    if (error) {
        console.error('Supabase getAllUsers error:', error.message);
        return [];
    }
    return data || [];
}

async function updateUserRole(username, role) {
    const { error } = await supabase
        .from('users')
        .update({ role })
        .eq('username', username);
    if (error) {
        console.error('Supabase updateUserRole error:', error.message);
        return false;
    }
    return true;
}

async function isMasterUser(userId) {
    const user = await getUserById(userId);
    return user && user.role === 'master';
}

module.exports = {
    ensureSchema,
    saveAgentGroup,
    getAgentGroup,
    getAllAgentGroups,
    getQdrantCollection,
    getCompanyName,
    saveAgents,
    getAgentsByGroup,
    getAllFinalizedAgents,
    saveChatMessage,
    getChatHistory,
    createUser,
    getUserById,
    getUserByUsername,
    getAllUsers,
    updateUserRole,
    isMasterUser,
};
