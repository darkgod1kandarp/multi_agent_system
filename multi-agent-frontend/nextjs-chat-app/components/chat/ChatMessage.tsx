"use client";

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Agent } from './ChatWindow';
import { useUser } from '../UserContext';
import { fetchWithTimeout } from '../../lib/fetchWithTimeout';

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001';

interface ChatMessageProps {
    sender: string;
    message: string;
    agents?: Agent[];
    groupId?: string;
    isError?: boolean;
    isStreaming?: boolean;
    streamStep?: string;
}

interface TestResult {
    passed: boolean;
    avgScore: number;
    summary: string;
    attempts: number;
    scopeCheck: { in_scope: boolean; violations: string[]; summary: string; };
    testResults: Array<{ testCase: string; passed: boolean; score: number; reason: string; }>;
}

const GRADIENTS = [
    ['#4f7fff', '#9c4fff'],
    ['#22c55e', '#06b6d4'],
    ['#f59e0b', '#ef4444'],
    ['#ec4899', '#8b5cf6'],
    ['#06b6d4', '#3b82f6'],
];

const CORE_KEYS = new Set(['name', 'role', 'prompt']);

function resolveExplanation(agent: Agent): string {
    return (
        agent['Detailed Explnation for customer'] ||
        agent['Detailed Explanation for customer'] ||
        agent['Explanation'] ||
        Object.entries(agent)
            .filter(([k, v]) => !CORE_KEYS.has(k) && typeof v === 'string' && (v as string).length > 20)
            .sort((a, b) => (b[1] as string).length - (a[1] as string).length)[0]?.[1]
    ) as string || '';
}

// ─── TestResultBanner ────────────────────────────────────────────────────────

const TestResultBanner = ({ result }: { result: TestResult }) => {
    const [expanded, setExpanded] = useState(false);
    const failed = result.testResults.filter(r => !r.passed);
    const hasDetails = failed.length > 0 || (result.scopeCheck.violations && result.scopeCheck.violations.length > 0);

    return (
        <div style={{
            borderRadius: '8px',
            border: `1px solid ${result.passed ? 'rgba(34,197,94,0.25)' : 'rgba(239,68,68,0.25)'}`,
            background: result.passed ? 'rgba(34,197,94,0.06)' : 'rgba(239,68,68,0.06)',
            overflow: 'hidden',
        }}>
            <div
                style={{
                    display: 'flex', alignItems: 'center', gap: '8px',
                    padding: '8px 12px', cursor: hasDetails ? 'pointer' : 'default',
                    userSelect: 'none',
                }}
                onClick={() => hasDetails && setExpanded(e => !e)}
            >
                <span style={{ fontSize: '13px' }}>{result.passed ? '✅' : '❌'}</span>
                <span style={{ fontSize: '12px', fontWeight: 600, color: result.passed ? '#4ade80' : '#f87171', flex: 1 }}>
                    {result.passed ? 'Tests passed' : 'Tests failed'}
                    {' · '}Score: {result.avgScore}/5
                    {' · '}Attempt{result.attempts !== 1 ? 's' : ''}: {result.attempts}
                </span>
                {hasDetails && (
                    <span style={{ fontSize: '11px', color: 'rgba(180,190,220,0.5)' }}>
                        {expanded ? '▲ hide' : '▼ details'}
                    </span>
                )}
            </div>

            {expanded && hasDetails && (
                <div style={{ padding: '0 12px 10px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {result.scopeCheck.violations && result.scopeCheck.violations.length > 0 && (
                        <div style={{ fontSize: '11px', color: '#fca5a5', background: 'rgba(239,68,68,0.08)', borderRadius: '6px', padding: '6px 10px' }}>
                            <strong>Scope:</strong> {result.scopeCheck.summary}
                        </div>
                    )}
                    {failed.map((r, i) => (
                        <div key={i} style={{ fontSize: '11px', color: '#cbd5e1', background: 'rgba(0,0,0,0.2)', borderRadius: '6px', padding: '6px 10px', lineHeight: 1.5 }}>
                            <div style={{ color: '#f87171', marginBottom: '2px', fontWeight: 600 }}>
                                Test failed · Score {r.score}/5
                            </div>
                            <div style={{ opacity: 0.7 }}>{r.reason}</div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

// ─── ChatMessage ────────────────────────────────────────────────────────────

const ChatMessage: React.FC<ChatMessageProps> = ({ sender, message, agents, groupId, isError, isStreaming, streamStep }) => {
    const isUser = sender === 'User';
    const router = useRouter();
    const { user, isMaster } = useUser();

    const [explanations, setExplanations] = useState<string[]>(
        () => (agents ?? []).map(resolveExplanation)
    );

    // Sync explanations when new agents are appended during streaming
    useEffect(() => {
        setExplanations((agents ?? []).map(resolveExplanation));
    }, [agents?.length]);
    const [removedIndices, setRemovedIndices] = useState<Set<number>>(new Set());
    const [customAgents, setCustomAgents] = useState<Agent[]>([]);
    const [customExplanations, setCustomExplanations] = useState<string[]>([]);
    const [customTestResults, setCustomTestResults] = useState<(TestResult | null)[]>([]);
    const [showAddForm, setShowAddForm] = useState(false);
    const [newAgentName, setNewAgentName] = useState('');
    const [newAgentRole, setNewAgentRole] = useState('');
    const [newAgentDesc, setNewAgentDesc] = useState('');
    const [addAgentLoading, setAddAgentLoading] = useState(false);
    const [addAgentError, setAddAgentError] = useState('');
    const [finalizedAll, setFinalizedAll] = useState(false);
    const [finalizeAllLoading, setFinalizeAllLoading] = useState(false);
    const [finalizeAllError, setFinalizeAllError] = useState('');

    const handleRemoveAgent = (index: number) => {
        setRemovedIndices(prev => new Set(prev).add(index));
    };

    const handleRemoveCustomAgent = (index: number) => {
        setCustomAgents(prev => prev.filter((_, i) => i !== index));
        setCustomExplanations(prev => prev.filter((_, i) => i !== index));
        setCustomTestResults(prev => prev.filter((_, i) => i !== index));
    };

    const handleAddAgent = async () => {
        if (!newAgentName.trim() || !newAgentRole.trim()) return;
        setAddAgentLoading(true);
        setAddAgentError('');
        try {
            const res = await fetchWithTimeout(`${BACKEND_URL}/agent/new`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'x-user-id': user?.id ?? '' },
                body: JSON.stringify({
                    message: { name: newAgentName.trim(), role: newAgentRole.trim(), description: newAgentDesc.trim() },
                    existingAgents: allAgents.map(a => ({ name: a.name, role: a.role })),
                }),
            });
            const data = await res.json();
            const result = data.response;
            if (!result.can_create) {
                setAddAgentError(result.reason || 'Cannot create this agent.');
                return;
            }
            // Use the finalAgent prompt if available (it was fixed by the retry loop)
            const finalAgent = data.finalAgent || {};
            const newAgent: Agent = {
                name: newAgentName.trim(),
                role: newAgentRole.trim(),
                prompt: finalAgent.prompt || result.prompt || '',
                ...finalAgent,
            };
            setCustomAgents(prev => [...prev, newAgent]);
            setCustomExplanations(prev => [...prev, finalAgent.Explanation || newAgentDesc.trim()]);
            setCustomTestResults(prev => [...prev, data.testResult || null]);
            setNewAgentName('');
            setNewAgentRole('');
            setNewAgentDesc('');
            setShowAddForm(false);
        } catch {
            setAddAgentError('Could not reach backend. Make sure it is running on port 3001.');
        } finally {
            setAddAgentLoading(false);
        }
    };

    const [agentOverrides, setAgentOverrides] = useState<Record<number, Agent>>({});

    const visibleOriginal = (agents ?? [])
        .map((a, i) => ({ agent: agentOverrides[i] ?? a, origIdx: i }))
        .filter(({ origIdx }) => !removedIndices.has(origIdx));

    const visibleAgents = visibleOriginal.map(({ agent }) => agent);
    const visibleExplanations = explanations.filter((_, i) => !removedIndices.has(i));
    const allAgents = [...visibleAgents, ...customAgents];
    const allExplanations = [...visibleExplanations, ...customExplanations];

    const handleFinalizeAll = async () => {
        if (allAgents.length === 0) return;
        setFinalizeAllLoading(true);
        setFinalizeAllError('');
        try {
            const payload = allAgents.map((agent, i) => ({
                name: agent.name,
                role: agent.role,
                prompt: agent.prompt,
                explanation: allExplanations[i] || resolveExplanation(agent),
            }));
            const res = await fetchWithTimeout(`${BACKEND_URL}/agent/finalize`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'x-user-id': user?.id ?? '' },
                body: JSON.stringify({ agents: payload, groupId }),
            });
            if (!res.ok) throw new Error('Server error');
            const data = await res.json();
            const id: string = data.id || groupId || '';
            setFinalizedAll(true);
            sessionStorage.setItem('finalizedAgents', JSON.stringify(payload));
            sessionStorage.setItem('finalizedGroupId', id);
            localStorage.setItem('agentGroupId', id);
            router.push('/agents-created');
        } catch {
            setFinalizeAllError('Could not reach backend. Make sure it is running on port 3001.');
        } finally {
            setFinalizeAllLoading(false);
        }
    };

    return (
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', flexDirection: isUser ? 'row-reverse' : 'row' }}>
            {/* Avatar */}
            <div style={{
                width: 34, height: 34, borderRadius: '50%', flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '13px', fontWeight: 700, color: '#fff', marginTop: '2px',
                background: isUser ? 'linear-gradient(135deg,#4f7fff,#9c4fff)' : isError ? 'linear-gradient(135deg,#ef4444,#f97316)' : 'linear-gradient(135deg,#22c55e,#06b6d4)',
                boxShadow: isUser ? '0 3px 12px rgba(99,102,241,0.45)' : isError ? '0 3px 12px rgba(239,68,68,0.4)' : '0 3px 12px rgba(34,197,94,0.35)',
            }}>
                {isUser ? 'U' : isError ? '!' : 'AI'}
            </div>

            {/* Content column */}
            <div style={{ maxWidth: isUser ? '65%' : '85%', display: 'flex', flexDirection: 'column', gap: '12px' }}>

                {/* Message bubble */}
                <div style={{
                    padding: '12px 16px',
                    borderRadius: isUser ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
                    fontSize: '14px', lineHeight: '1.65', wordBreak: 'break-word',
                    background: isUser ? 'linear-gradient(135deg,#4f7fff 0%,#9c4fff 100%)' : isError ? 'rgba(239,68,68,0.1)' : 'rgba(26,32,53,0.95)',
                    color: '#f1f3f9',
                    border: isUser ? 'none' : isError ? '1px solid rgba(239,68,68,0.3)' : isStreaming ? '1px solid rgba(99,102,241,0.3)' : '1px solid rgba(255,255,255,0.07)',
                    boxShadow: isUser ? '0 6px 24px rgba(99,102,241,0.35)' : '0 4px 16px rgba(0,0,0,0.3)',
                }}>
                    <div style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.8px', textTransform: 'uppercase', marginBottom: '5px', opacity: 0.65, color: isUser ? '#e0e7ff' : isError ? '#f87171' : '#818cf8' }}>
                        {sender}
                    </div>
                    {isStreaming ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <span style={{ width: 10, height: 10, border: '2px solid rgba(99,102,241,0.3)', borderTopColor: '#818cf8', borderRadius: '50%', display: 'inline-block', animation: 'spin 0.8s linear infinite', flexShrink: 0 }} />
                            <span style={{ color: 'rgba(180,190,230,0.75)', fontSize: '13px' }}>{streamStep || 'Working...'}</span>
                        </div>
                    ) : (
                        message
                    )}
                </div>

                {/* Agent cards */}
                {(agents && agents.length > 0 || isStreaming) && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>

                        {/* Header row */}
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingLeft: '2px' }}>
                            <span style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '11px', fontWeight: 600, letterSpacing: '1px', textTransform: 'uppercase', color: 'rgba(129,140,248,0.6)' }}>
                                {allAgents.length} Agent{allAgents.length !== 1 ? 's' : ''} {isStreaming ? 'Creating...' : 'Generated'}
                                {isStreaming && (
                                    <span style={{ width: 8, height: 8, border: '2px solid rgba(99,102,241,0.3)', borderTopColor: '#818cf8', borderRadius: '50%', display: 'inline-block', animation: 'spin 0.8s linear infinite' }} />
                                )}
                            </span>

                            {/* Finalize All button — master only */}
                            {!finalizedAll ? (
                                <button
                                    onClick={handleFinalizeAll}
                                    disabled={finalizeAllLoading || !isMaster || isStreaming}
                                    title={!isMaster ? 'Only master users can finalize agents' : undefined}
                                    style={{
                                        display: 'flex', alignItems: 'center', gap: '6px',
                                        background: (!isMaster || finalizeAllLoading || isStreaming) ? 'rgba(99,102,241,0.15)' : 'linear-gradient(135deg,#4f7fff,#9c4fff)',
                                        border: 'none', borderRadius: '8px',
                                        padding: '6px 14px', color: '#fff',
                                        fontSize: '12px', fontWeight: 600,
                                        cursor: (!isMaster || finalizeAllLoading || isStreaming) ? 'not-allowed' : 'pointer',
                                        fontFamily: 'inherit',
                                        opacity: (!isMaster || finalizeAllLoading || isStreaming) ? 0.5 : 1,
                                        boxShadow: (!isMaster || finalizeAllLoading || isStreaming) ? 'none' : '0 3px 14px rgba(99,102,241,0.4)',
                                    }}
                                >
                                    {finalizeAllLoading ? (
                                        <>
                                            <span style={{ width: 10, height: 10, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', display: 'inline-block', animation: 'spin 0.8s linear infinite' }} />
                                            Finalizing...
                                        </>
                                    ) : (
                                        <>
                                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                                <polyline points="20 6 9 17 4 12" />
                                            </svg>
                                            Finalize All
                                        </>
                                    )}
                                </button>
                            ) : (
                                <span style={{ fontSize: '12px', fontWeight: 600, color: '#22c55e', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" />
                                    </svg>
                                    All Agents Finalized
                                </span>
                            )}
                        </div>

                        {finalizeAllError && (
                            <div style={{ fontSize: '12px', color: '#f87171', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: '8px', padding: '8px 12px' }}>
                                ⚠ {finalizeAllError}
                            </div>
                        )}

                        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

                        {visibleOriginal.map(({ agent, origIdx }, visIdx) => (
                            <AgentCard
                                key={`orig-${origIdx}`}
                                agent={agent}
                                index={visIdx}
                                explanation={explanations[origIdx]}
                                testResult={null}
                                onExplanationChange={(text) => setExplanations(prev => { const next = [...prev]; next[origIdx] = text; return next; })}
                                onRemove={() => handleRemoveAgent(origIdx)}
                                onUpdate={(updated, newExp) => {
                                    setAgentOverrides(prev => ({ ...prev, [origIdx]: updated }));
                                    setExplanations(prev => { const next = [...prev]; next[origIdx] = newExp; return next; });
                                }}
                                allAgents={allAgents}
                                isMaster={isMaster}
                                userId={user?.id ?? ''}
                            />
                        ))}

                        {customAgents.map((agent, i) => (
                            <AgentCard
                                key={`custom-${i}`}
                                agent={agent}
                                index={visibleAgents.length + i}
                                explanation={customExplanations[i]}
                                testResult={customTestResults[i] || null}
                                onExplanationChange={(text) => setCustomExplanations(prev => { const next = [...prev]; next[i] = text; return next; })}
                                onRemove={() => handleRemoveCustomAgent(i)}
                                onUpdate={(updated, newExp) => {
                                    setCustomAgents(prev => { const next = [...prev]; next[i] = updated; return next; });
                                    setCustomExplanations(prev => { const next = [...prev]; next[i] = newExp; return next; });
                                }}
                                allAgents={allAgents}
                                isMaster={isMaster}
                                userId={user?.id ?? ''}
                            />
                        ))}

                        {/* Add Agent Form — master only */}
                        {!isMaster ? null : showAddForm ? (
                            <div style={{ background: 'rgba(15,20,35,0.95)', border: '1px solid rgba(99,102,241,0.35)', borderRadius: '16px', padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                <div style={{ fontSize: '12px', fontWeight: 700, color: '#818cf8', letterSpacing: '0.7px', textTransform: 'uppercase' }}>New Agent</div>
                                <input
                                    placeholder="Agent name *"
                                    value={newAgentName}
                                    onChange={e => setNewAgentName(e.target.value)}
                                    style={{ padding: '9px 12px', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: '#f1f3f9', fontSize: '13px', fontFamily: 'inherit', outline: 'none' }}
                                />
                                <input
                                    placeholder="Role / purpose *"
                                    value={newAgentRole}
                                    onChange={e => setNewAgentRole(e.target.value)}
                                    style={{ padding: '9px 12px', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: '#f1f3f9', fontSize: '13px', fontFamily: 'inherit', outline: 'none' }}
                                />
                                <textarea
                                    placeholder="Description (optional)"
                                    value={newAgentDesc}
                                    onChange={e => setNewAgentDesc(e.target.value)}
                                    rows={3}
                                    style={{ padding: '9px 12px', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: '#f1f3f9', fontSize: '13px', fontFamily: 'inherit', outline: 'none', resize: 'vertical' }}
                                />
                                {addAgentError && (
                                    <div style={{ fontSize: '12px', color: '#f87171', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: '8px', padding: '8px 12px' }}>
                                        ⚠ {addAgentError}
                                    </div>
                                )}
                                <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                                    <button onClick={() => { setShowAddForm(false); setAddAgentError(''); }} style={{ padding: '6px 14px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: 'rgba(200,210,240,0.6)', fontSize: '12px', fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
                                    <button onClick={handleAddAgent} disabled={!newAgentName.trim() || !newAgentRole.trim() || addAgentLoading} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 16px', background: 'linear-gradient(135deg,#4f7fff,#9c4fff)', border: 'none', borderRadius: '8px', color: '#fff', fontSize: '12px', fontWeight: 600, cursor: !newAgentName.trim() || !newAgentRole.trim() || addAgentLoading ? 'not-allowed' : 'pointer', fontFamily: 'inherit', opacity: !newAgentName.trim() || !newAgentRole.trim() || addAgentLoading ? 0.6 : 1 }}>
                                        {addAgentLoading && <span style={{ width: 10, height: 10, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', display: 'inline-block', animation: 'spin 0.8s linear infinite' }} />}
                                        {addAgentLoading ? 'Validating & testing...' : 'Add Agent'}
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <button
                                onClick={() => setShowAddForm(true)}
                                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', padding: '10px', background: 'rgba(99,102,241,0.06)', border: '1px dashed rgba(99,102,241,0.3)', borderRadius: '12px', color: 'rgba(129,140,248,0.7)', fontSize: '13px', fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.2s' }}
                                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(99,102,241,0.14)'; (e.currentTarget as HTMLButtonElement).style.color = '#a5b4fc'; }}
                                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(99,102,241,0.06)'; (e.currentTarget as HTMLButtonElement).style.color = 'rgba(129,140,248,0.7)'; }}
                            >
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                    <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                                </svg>
                                Add Another Agent
                            </button>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};

// ─── AgentCard ───────────────────────────────────────────────────────────────

interface AgentCardProps {
    agent: Agent;
    index: number;
    explanation: string;
    testResult: TestResult | null;
    onExplanationChange: (text: string) => void;
    onRemove: () => void;
    onUpdate: (updatedAgent: Agent, newExplanation: string) => void;
    allAgents: Agent[];
    isMaster: boolean;
    userId: string;
}

const AgentCard = ({ agent, index, explanation, testResult, onExplanationChange, onRemove, onUpdate, allAgents, isMaster, userId }: AgentCardProps) => {
    const [start, end] = GRADIENTS[index % GRADIENTS.length];

    const [isEditing, setIsEditing] = useState(false);
    const [draftName, setDraftName] = useState(agent.name);
    const [draftRole, setDraftRole] = useState(agent.role);
    const [draftText, setDraftText] = useState(explanation);
    const [updateLoading, setUpdateLoading] = useState(false);
    const [updateError, setUpdateError] = useState('');
    const [editSaved, setEditSaved] = useState(false);
    const [localTestResult, setLocalTestResult] = useState<TestResult | null>(testResult);

    const initial = (draftName || agent.name)?.charAt(0)?.toUpperCase() ?? '?';

    const handleEdit = () => {
        setDraftName(agent.name);
        setDraftRole(agent.role);
        setDraftText(explanation);
        setUpdateError('');
        setIsEditing(true);
    };
    const handleCancel = () => { setIsEditing(false); setUpdateError(''); };
    const handleSave = async () => {
        if (!draftName.trim() || !draftRole.trim()) return;
        setUpdateLoading(true);
        setUpdateError('');
        try {
            const res = await fetchWithTimeout(`${BACKEND_URL}/agent/update`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'x-user-id': userId },
                body: JSON.stringify({
                    agent: { name: draftName.trim(), role: draftRole.trim(), description: draftText.trim() },
                    existingAgents: allAgents.map(a => ({ name: a.name, role: a.role })),
                }),
            });
            const data = await res.json();
            const result = data.response;
            if (!result.can_update) {
                setUpdateError(result.reason || 'Cannot update this agent.');
                return;
            }
            // Use finalAgent prompt if available (it was fixed by the retry loop)
            const finalAgent = data.finalAgent || {};
            const updatedAgent: Agent = {
                ...agent,
                name: draftName.trim(),
                role: draftRole.trim(),
                prompt: finalAgent.prompt || result.prompt || agent.prompt,
                ...finalAgent,
            };
            const newExplanation = finalAgent.Explanation || result.Explanation || draftText.trim();
            onUpdate(updatedAgent, newExplanation);
            onExplanationChange(newExplanation);
            setLocalTestResult(data.testResult || null);
            setIsEditing(false);
            setEditSaved(true);
            setTimeout(() => setEditSaved(false), 2000);
        } catch {
            setUpdateError('Could not reach backend. Make sure it is running on port 3001.');
        } finally {
            setUpdateLoading(false);
        }
    };

    return (
        <div style={{
            background: 'rgba(15,20,35,0.95)',
            border: `1px solid ${isEditing ? `${start}55` : 'rgba(255,255,255,0.07)'}`,
            borderRadius: '16px', overflow: 'hidden',
            boxShadow: isEditing
                ? `0 8px 40px rgba(0,0,0,0.5), 0 0 0 1px ${start}33`
                : '0 8px 32px rgba(0,0,0,0.4)',
            transition: 'border 0.2s, box-shadow 0.2s',
        }}>
            {/* Header */}
            <div style={{
                background: `linear-gradient(135deg,${start},${end})`,
                padding: '14px 18px', display: 'flex', alignItems: 'center', gap: '12px',
            }}>
                <div style={{
                    width: 40, height: 40, borderRadius: '10px',
                    background: 'rgba(255,255,255,0.15)', backdropFilter: 'blur(4px)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '16px', fontWeight: 800, color: '#fff', flexShrink: 0,
                }}>
                    {initial}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '15px', fontWeight: 700, color: '#fff', lineHeight: 1.2 }}>{isEditing ? draftName || agent.name : agent.name}</div>
                    <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.72)', marginTop: '2px' }}>{isEditing ? draftRole || agent.role : agent.role}</div>
                </div>
                <div style={{
                    fontSize: '10px', fontWeight: 700, letterSpacing: '0.6px',
                    background: 'rgba(255,255,255,0.18)', color: '#fff',
                    padding: '3px 9px', borderRadius: '20px', flexShrink: 0,
                }}>
                    AGENT {index + 1}
                </div>
                {isMaster && <button
                    onClick={onRemove}
                    title="Remove agent"
                    style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        width: 28, height: 28, borderRadius: '8px', flexShrink: 0,
                        background: 'rgba(239,68,68,0.18)', border: '1px solid rgba(239,68,68,0.35)',
                        color: '#fca5a5', cursor: 'pointer', transition: 'all 0.2s',
                    }}
                    onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(239,68,68,0.35)'; (e.currentTarget as HTMLButtonElement).style.color = '#fff'; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(239,68,68,0.18)'; (e.currentTarget as HTMLButtonElement).style.color = '#fca5a5'; }}
                >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14H6L5 6" /><path d="M10 11v6M14 11v6" /><path d="M9 6V4h6v2" />
                    </svg>
                </button>}
            </div>

            {/* Body */}
            <div style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {/* Section label row */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <div style={{ width: 3, height: 14, borderRadius: '2px', background: `linear-gradient(to bottom,${start},${end})` }} />
                        <span style={{ fontSize: '11px', fontWeight: 700, color: 'rgba(129,140,248,0.85)', letterSpacing: '0.7px', textTransform: 'uppercase' }}>
                            What this agent does
                        </span>
                        {editSaved && <span style={{ fontSize: '11px', color: '#22c55e', fontWeight: 600 }}>✓ Saved</span>}
                    </div>

                    {/* Edit / Save / Cancel — master only */}
                    {!isMaster ? null : !isEditing ? (
                        <button onClick={handleEdit}
                            style={{ display: 'flex', alignItems: 'center', gap: '5px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '7px', padding: '4px 10px', color: 'rgba(200,210,240,0.7)', fontSize: '12px', fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' }}
                            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = `${start}22`; (e.currentTarget as HTMLButtonElement).style.borderColor = `${start}66`; (e.currentTarget as HTMLButtonElement).style.color = '#fff'; }}
                            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.05)'; (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(255,255,255,0.1)'; (e.currentTarget as HTMLButtonElement).style.color = 'rgba(200,210,240,0.7)'; }}
                        >
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                            </svg>
                            Edit
                        </button>
                    ) : (
                        <div style={{ display: 'flex', gap: '6px' }}>
                            <button onClick={handleCancel} disabled={updateLoading} style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '7px', padding: '4px 12px', color: 'rgba(200,210,240,0.6)', fontSize: '12px', fontWeight: 500, cursor: updateLoading ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>Cancel</button>
                            <button onClick={handleSave} disabled={updateLoading || !draftName.trim() || !draftRole.trim()} style={{ display: 'flex', alignItems: 'center', gap: '5px', background: `linear-gradient(135deg,${start},${end})`, border: 'none', borderRadius: '7px', padding: '4px 14px', color: '#fff', fontSize: '12px', fontWeight: 600, cursor: updateLoading ? 'not-allowed' : 'pointer', fontFamily: 'inherit', opacity: updateLoading ? 0.7 : 1, boxShadow: `0 2px 10px ${start}55` }}>
                                {updateLoading && <span style={{ width: 9, height: 9, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', display: 'inline-block', animation: 'spin 0.8s linear infinite' }} />}
                                {updateLoading ? 'Saving & testing...' : 'Save'}
                            </button>
                        </div>
                    )}
                </div>

                {/* Edit fields or read-only explanation */}
                {isEditing ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <input value={draftName} onChange={e => setDraftName(e.target.value)} placeholder="Agent name *" autoFocus
                            style={{ padding: '9px 12px', background: 'rgba(0,0,0,0.3)', border: `1px solid ${start}66`, borderRadius: '8px', color: '#f1f3f9', fontSize: '13px', fontFamily: 'inherit', outline: 'none' }}
                        />
                        <input value={draftRole} onChange={e => setDraftRole(e.target.value)} placeholder="Role / purpose *"
                            style={{ padding: '9px 12px', background: 'rgba(0,0,0,0.3)', border: `1px solid ${start}44`, borderRadius: '8px', color: '#f1f3f9', fontSize: '13px', fontFamily: 'inherit', outline: 'none' }}
                        />
                        <textarea value={draftText} onChange={e => setDraftText(e.target.value)} placeholder="Description (optional)" rows={4}
                            style={{ padding: '9px 12px', background: 'rgba(0,0,0,0.3)', border: `1px solid ${start}44`, borderRadius: '8px', color: '#f1f3f9', fontSize: '13px', lineHeight: '1.7', fontFamily: 'inherit', resize: 'vertical', outline: 'none', boxSizing: 'border-box' }}
                        />
                        {updateError && (
                            <div style={{ fontSize: '12px', color: '#f87171', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: '8px', padding: '8px 12px' }}>
                                ⚠ {updateError}
                            </div>
                        )}
                    </div>
                ) : (
                    <p style={{ fontSize: '13px', color: '#b0bbd4', lineHeight: '1.7', margin: 0, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '10px', padding: '12px 14px', whiteSpace: 'pre-wrap' }}>
                        {explanation || 'No description available.'}
                    </p>
                )}

                {/* Test result banner */}
                {localTestResult && <TestResultBanner result={localTestResult} />}
            </div>
        </div>
    );
};

export default ChatMessage;
