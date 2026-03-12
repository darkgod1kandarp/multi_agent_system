const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, '..', 'vomyara.db');
const db = new Database(DB_PATH);

// Enable WAL mode for better concurrent read performance
db.pragma('journal_mode = WAL');

// --- Schema ---
db.exec(`
    CREATE TABLE IF NOT EXISTS agent_groups (
        id              TEXT PRIMARY KEY,
        source_url      TEXT,
        qdrant_collection TEXT,
        industry        TEXT,
        business_type   TEXT,
        company_name    TEXT,
        created_at      TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS agents (
        id              TEXT PRIMARY KEY,
        group_id        TEXT NOT NULL REFERENCES agent_groups(id),
        name            TEXT NOT NULL,
        role            TEXT,
        data            TEXT NOT NULL,
        finalized_at    TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS chat_history (
        id              TEXT PRIMARY KEY,
        group_id        TEXT,
        user_message    TEXT NOT NULL,
        response        TEXT NOT NULL,
        agent_name      TEXT,
        agent_role      TEXT,
        created_at      TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS users (
        id              TEXT PRIMARY KEY,
        username        TEXT NOT NULL UNIQUE,
        role            TEXT NOT NULL DEFAULT 'normal',
        created_at      TEXT NOT NULL
    );
`);

// --- Agent Groups ---

function saveAgentGroup({ id, sourceUrl, qdrantCollection, industry, businessType, companyName }) {
    const stmt = db.prepare(`
        INSERT INTO agent_groups (id, source_url, qdrant_collection, industry, business_type, company_name, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
            source_url = excluded.source_url,
            qdrant_collection = excluded.qdrant_collection,
            industry = excluded.industry,
            business_type = excluded.business_type,
            company_name = excluded.company_name
    `);
    stmt.run(id, sourceUrl || null, qdrantCollection || null, industry || null, businessType || null, companyName || null, new Date().toISOString());
}

function getCompanyName(groupId) {
    const row = db.prepare('SELECT company_name FROM agent_groups WHERE id = ?').get(groupId);
    return row ? row.company_name : null;
}

function getAgentGroup(id) {
    return db.prepare('SELECT * FROM agent_groups WHERE id = ?').get(id);
}

function getAllAgentGroups() {
    return db.prepare('SELECT * FROM agent_groups ORDER BY created_at DESC').all();
}

function getQdrantCollection(groupId) {
    const row = db.prepare('SELECT qdrant_collection FROM agent_groups WHERE id = ?').get(groupId);
    return row ? row.qdrant_collection : null;
}

// --- Agents ---

function saveAgents(groupId, agents) {
    const insert = db.prepare(`
        INSERT INTO agents (id, group_id, name, role, data, finalized_at)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
            name = excluded.name,
            role = excluded.role,
            data = excluded.data,
            finalized_at = excluded.finalized_at
    `);

    const { v4: uuidv4 } = require('uuid');
    const insertMany = db.transaction((agentList) => {
        for (const agent of agentList) {
            const agentId = agent.id || uuidv4();
            const finalizedAt = agent.finalizedAt || new Date().toISOString();
            insert.run(agentId, groupId, agent.name, agent.role, JSON.stringify(agent), finalizedAt);
        }
    });
    insertMany(agents);
}

function getAgentsByGroup(groupId) {
    const rows = db.prepare('SELECT data FROM agents WHERE group_id = ? ORDER BY rowid').all(groupId);
    return rows.map(r => JSON.parse(r.data));
}

function getAllFinalizedAgents() {
    const groups = getAllAgentGroups();
    const result = {};
    for (const group of groups) {
        result[group.id] = getAgentsByGroup(group.id);
    }
    return result;
}

// --- Chat History ---

function saveChatMessage({ id, groupId, userMessage, response, agentName, agentRole }) {
    db.prepare(`
        INSERT INTO chat_history (id, group_id, user_message, response, agent_name, agent_role, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, groupId || null, userMessage, response, agentName || null, agentRole || null, new Date().toISOString());
}

function getChatHistory(groupId, limit = 50) {
    if (groupId) {
        return db.prepare('SELECT * FROM chat_history WHERE group_id = ? ORDER BY created_at DESC LIMIT ?').all(groupId, limit);
    }
    return db.prepare('SELECT * FROM chat_history ORDER BY created_at DESC LIMIT ?').all(limit);
}

// --- Users ---

function createUser({ id, username, role = 'normal' }) {
    db.prepare(`
        INSERT INTO users (id, username, role, created_at)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(username) DO UPDATE SET role = excluded.role
    `).run(id, username, role, new Date().toISOString());
}

function getUserById(id) {
    return db.prepare('SELECT * FROM users WHERE id = ?').get(id);
}

function getUserByUsername(username) {
    return db.prepare('SELECT * FROM users WHERE username = ?').get(username);
}

function getAllUsers() {
    return db.prepare('SELECT id, username, role, created_at FROM users ORDER BY created_at DESC').all();
}

function isMasterUser(userId) {
    const user = getUserById(userId);
    return user && user.role === 'master';
}

module.exports = {
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
    isMasterUser,
};
