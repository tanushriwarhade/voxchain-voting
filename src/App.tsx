import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Database, 
  ShieldCheck, 
  Vote as VoteIcon, 
  UserCircle, 
  ChevronRight, 
  Activity,
  History,
  Info,
  CheckCircle2,
  Lock,
  Cpu,
  BarChart3
} from 'lucide-react';
import { Election, Block, Candidate, VoterIdentity } from './types';
import { getElections, getBlockchain, submitVote, forceMine, getSocket, registerVoter } from './services/blockchainService';
import { generateVoterIdentity, generateAnonymousVote } from './services/cryptoService';
import { formatHash, formatDate, cn } from './lib/utils';

// --- Components ---

const StatusBadge = ({ label, active }: { label: string; active: boolean }) => (
  <div className="flex items-center gap-2 px-3 py-1.5 rounded-full border border-zinc-800 bg-zinc-950/50">
    <div className={cn("w-1.5 h-1.5 rounded-full", active ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)]" : "bg-zinc-600")} />
    <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-400">{label}</span>
  </div>
);

function CandidateCard(props: { candidate: Candidate; selected: boolean; onSelect: () => void; results: number; key?: string }) {
  const { candidate, selected, onSelect, results } = props;
  return (
    <motion.button
    whileHover={{ scale: 1.02 }}
    whileTap={{ scale: 0.98 }}
    onClick={onSelect}
    className={cn(
      "w-full p-4 rounded-xl border transition-all text-left group relative overflow-hidden",
      selected 
        ? "border-emerald-500/50 bg-emerald-500/5 ring-1 ring-emerald-500/20" 
        : "border-zinc-800 bg-zinc-900/50 hover:border-zinc-700"
    )}
  >
    <div className="flex justify-between items-start relative z-10">
      <div>
        <h4 className="font-sans font-medium text-zinc-100">{candidate.name}</h4>
        <p className="text-xs text-zinc-500 font-mono italic">{candidate.party}</p>
      </div>
      {results > 0 && (
        <div className="text-right">
          <span className="text-lg font-mono font-medium text-emerald-400">{results}</span>
          <p className="text-[10px] uppercase tracking-tighter text-zinc-500">Votes</p>
        </div>
      )}
    </div>
    {selected && (
      <div className="absolute right-[-20px] bottom-[-20px] rotate-[-12deg] opacity-10">
        <ShieldCheck size={120} className="text-emerald-500" />
      </div>
    )}
  </motion.button>
  );
}

function BlockchainNode(props: { block: Block; isNew: boolean; key?: string }) {
  const { block, isNew } = props;
  return (
    <motion.div
    initial={isNew ? { opacity: 0, x: -20, scale: 0.9 } : false}
    animate={{ opacity: 1, x: 0, scale: 1 }}
    className="min-w-[280px] p-5 rounded-2xl bg-zinc-950 border border-zinc-800 relative group"
  >
    <div className="flex items-center justify-between mb-4">
      <div className="flex items-center gap-2">
        <div className="p-2 rounded-lg bg-zinc-900">
          <Cpu size={14} className="text-zinc-400" />
        </div>
        <span className="text-xs font-mono text-zinc-500">Block #{block.index}</span>
      </div>
      <div className="px-2 py-0.5 rounded bg-zinc-900 border border-zinc-800 text-[10px] font-mono text-zinc-400">
        NONCE: {block.nonce}
      </div>
    </div>
    
    <div className="space-y-3">
      <div>
        <label className="text-[9px] uppercase tracking-widest text-zinc-600 block mb-1">Hash</label>
        <div className="font-mono text-[11px] text-zinc-300 bg-black/40 p-2 rounded-md break-all border border-zinc-900/50">
          {block.hash}
        </div>
      </div>
      
      <div>
        <label className="text-[9px] uppercase tracking-widest text-zinc-600 block mb-1">Prev Hash</label>
        <div className="font-mono text-[11px] text-zinc-500 bg-black/20 p-2 rounded-md break-all">
          {formatHash(block.previousHash)}
        </div>
      </div>

      <div className="pt-2 border-t border-zinc-900">
        <div className="flex items-center justify-between text-[10px]">
          <span className="text-zinc-600">Transactions</span>
          <span className="text-emerald-500 font-mono">{block.votes.length} Votes</span>
        </div>
      </div>
    </div>

    {block.index > 0 && (
      <div className="absolute left-[-16px] top-1/2 -translate-y-1/2 text-zinc-800 group-hover:text-emerald-500/50 transition-colors">
        <ChevronRight size={16} />
      </div>
    )}
  </motion.div>
  );
}

// --- Main App ---

export default function App() {
  const [view, setView] = useState<'landing' | 'vote' | 'admin'>('landing');
  const [elections, setElections] = useState<Election[]>([]);
  const [selectedElection, setSelectedElection] = useState<Election | null>(null);
  const [blockchain, setBlockchain] = useState<Block[]>([]);
  const [results, setResults] = useState<Record<string, Record<string, number>>>({});
  const [voterName, setVoterName] = useState('');
  const [identity, setIdentity] = useState<VoterIdentity | null>(null);
  const [isRegistering, setIsRegistering] = useState(false);
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(null);
  const [isVoting, setIsVoting] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);
  const [logs, setLogs] = useState<string[]>([]);

  useEffect(() => {
    loadInitialData();

    const socket = getSocket();
    socket.on('results_update', ({ electionId, results }: { electionId: string; results: Record<string, number> }) => {
      setResults(prev => ({ ...prev, [electionId]: results }));
    });

    socket.on('new_vote', ({ nullifier, timestamp }: { nullifier: string; timestamp: number }) => {
      setLogs(prev => [`[${formatDate(timestamp)}] ZK Proof Validated. Nullifier: ${nullifier}`, ...prev.slice(0, 10)]);
    });

    socket.on('block_mined', (block: Block) => {
      setBlockchain(prev => [...prev, block]);
      setLogs(prev => [`[${formatDate(block.timestamp)}] Block #${block.index} successfully mined and linked.`, ...prev.slice(0, 10)]);
      loadInitialData(); // Refresh full state
    });

    return () => {
      socket.off('results_update');
      socket.off('new_vote');
      socket.off('block_mined');
    };
  }, []);

  const loadInitialData = async () => {
    try {
      const activeElections = await getElections();
      setElections(activeElections);
      if (activeElections.length > 0) setSelectedElection(activeElections[0]);
      
      const chainData = await getBlockchain();
      setBlockchain(chainData.chain);

      const tallies: Record<string, Record<string, number>> = {};
      for (const e of activeElections) {
        tallies[e.id] = await (await fetch(`/api/results/${e.id}`)).json();
      }
      setResults(tallies);
    } catch (err) {
      console.error('Failed to load data', err);
    }
  };

  const handleRegister = async () => {
    if (!voterName) return;
    setIsRegistering(true);
    try {
      const idData = await generateVoterIdentity();
      await registerVoter(idData.commitment);
      setIdentity(idData);
      setLogs(prev => [`[${formatDate(Date.now())}] ZK Identity registered. Commitment: ${idData.commitment.substring(0, 16)}...`, ...prev]);
    } catch (err) {
      setFeedback({ type: 'error', message: 'Registration failed.' });
    } finally {
      setIsRegistering(false);
    }
  };

  const handleVote = async () => {
    if (!selectedElection || !selectedCandidateId || !identity) return;
    setIsVoting(true);
    try {
      const timestamp = Date.now();
      const { nullifier, zkProof } = await generateAnonymousVote(identity.secret, selectedElection.id, selectedCandidateId);
      
      const result = await submitVote({
        nullifier,
        candidateId: selectedCandidateId,
        timestamp,
        zkProof,
        electionId: selectedElection.id,
        commitment: identity.commitment
      });

      if (result.success) {
        setFeedback({ type: 'success', message: 'Your anonymous vote has been accepted and added to the block.' });
      } else {
        setFeedback({ type: 'error', message: result.error || 'Voting failed.' });
      }
    } catch (err) {
      setFeedback({ type: 'error', message: 'Cryptographic proof generation failed.' });
    } finally {
      setIsVoting(false);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-300 font-sans selection:bg-emerald-500/30">
      {/* Header */}
      <header className="border-b border-zinc-900 bg-black/20 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3 group cursor-pointer" onClick={() => setView('landing')}>
            <div className="p-2 bg-emerald-500 rounded-xl group-hover:rotate-12 transition-transform shadow-[0_0_20px_rgba(16,185,129,0.3)]">
              <ShieldCheck className="text-black" size={20} />
            </div>
            <h1 className="font-sans font-bold text-xl tracking-tight text-white">VoxChain</h1>
          </div>
          
          <div className="hidden md:flex items-center gap-6">
            <nav className="flex gap-4">
              <button 
                onClick={() => setView('vote')} 
                className={cn("px-4 py-2 text-sm transition-colors", view === 'vote' ? "text-emerald-400" : "hover:text-white")}
              >
                Voter Portal
              </button>
              <button 
                onClick={() => setView('admin')} 
                className={cn("px-4 py-2 text-sm transition-colors", view === 'admin' ? "text-emerald-400" : "hover:text-white")}
              >
                Nodes & Admin
              </button>
            </nav>
            <div className="h-4 w-px bg-zinc-800" />
            <StatusBadge label="Network Active" active={true} />
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-10">
        <AnimatePresence mode="wait">
          {view === 'landing' && (
            <motion.div
              key="landing"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="grid gap-12"
            >
              {/* Hero */}
              <div className="max-w-3xl">
                <p className="text-emerald-500 font-mono text-sm uppercase tracking-[0.3em] mb-4">The Future of Governance</p>
                <h2 className="text-5xl md:text-7xl font-bold text-white leading-tight mb-8">
                  Immutable trust. <br/>
                  Transparent elections.
                </h2>
                <div className="flex flex-wrap gap-4">
                  <button 
                    onClick={() => setView('vote')}
                    className="px-8 py-4 bg-emerald-500 text-black font-semibold rounded-xl hover:bg-emerald-400 transition-colors flex items-center gap-2"
                  >
                    Cast Your Vote <ChevronRight size={18} />
                  </button>
                  <button 
                    onClick={() => setView('admin')}
                    className="px-8 py-4 bg-zinc-900 text-white font-semibold rounded-xl border border-zinc-800 hover:bg-zinc-800 transition-colors"
                  >
                    View Audit Logs
                  </button>
                </div>
              </div>

              {/* Stats/Live */}
              <div className="grid md:grid-cols-3 gap-6">
                <div className="p-6 rounded-3xl bg-zinc-900/50 border border-zinc-800">
                  <BarChart3 className="text-emerald-500 mb-4" size={24} />
                  <h3 className="text-lg font-medium text-white mb-1">Live Tallying</h3>
                  <p className="text-sm text-zinc-500">Real-time election results verified across decentralized nodes.</p>
                </div>
                <div className="p-6 rounded-3xl bg-zinc-900/50 border border-zinc-800">
                  <Lock className="text-emerald-500 mb-4" size={24} />
                  <h3 className="text-lg font-medium text-white mb-1">E2E Encryption</h3>
                  <p className="text-sm text-zinc-500">Votes are signed locally on your device before entering the ledger.</p>
                </div>
                <div className="p-6 rounded-3xl bg-zinc-900/50 border border-zinc-800">
                  <Activity className="text-emerald-500 mb-4" size={24} />
                  <h3 className="text-lg font-medium text-white mb-1">Proof of Audit</h3>
                  <p className="text-sm text-zinc-500">Every vote produces a cryptographic hash for individual verification.</p>
                </div>
              </div>
            </motion.div>
          )}

          {view === 'vote' && (
            <motion.div
              key="vote"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="max-w-4xl mx-auto"
            >
              <div className="flex items-center gap-3 mb-8">
                <div className="p-3 bg-zinc-900 rounded-2xl">
                  <VoteIcon className="text-emerald-500" size={24} />
                </div>
                <div>
                  <h2 className="text-2xl font-bold text-white">Voter Portal</h2>
                  <p className="text-sm text-zinc-500">Identify and cast your cryptographic ballot.</p>
                </div>
              </div>

              {!identity ? (
                <div className="bg-zinc-900/50 border border-zinc-800 rounded-3xl p-8 text-center">
                  <div className="w-16 h-16 bg-zinc-800 rounded-2xl flex items-center justify-center mx-auto mb-6">
                    <UserCircle className="text-zinc-500" size={32} />
                  </div>
                  <h3 className="text-xl font-medium text-white mb-2">Zero-Knowledge Registration</h3>
                  <p className="text-zinc-500 mb-8 max-w-md mx-auto">
                    Identify yourself officially to register your commitment. Once registered, your votes are completely anonymous.
                  </p>
                  <div className="flex flex-col gap-4 max-w-sm mx-auto">
                    <input 
                      type="text" 
                      placeholder="Enter Full Name" 
                      value={voterName}
                      onChange={(e) => setVoterName(e.target.value)}
                      className="bg-black border border-zinc-800 rounded-xl px-5 py-4 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                    />
                    <button 
                      onClick={handleRegister}
                      disabled={isRegistering || !voterName}
                      className="bg-emerald-500 text-black font-bold py-4 rounded-xl hover:bg-emerald-400 transition-all disabled:opacity-50"
                    >
                      {isRegistering ? 'Generating Commitment...' : 'Create Anonymous Voter Identity'}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="grid gap-8">
                  {/* Identity Box */}
                  <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-4 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-full bg-emerald-500 flex items-center justify-center font-bold text-black text-sm">
                        {voterName[0]}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-white">{voterName}</p>
                        <p className="text-[10px] font-mono text-zinc-500 break-all max-w-[200px]">
                          COMMITMENT: {identity.commitment.substring(0, 24)}...
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-col items-end">
                      <span className="text-[10px] uppercase font-mono text-emerald-500">ZK-Verified Holder</span>
                      <button onClick={() => setIdentity(null)} className="text-[10px] text-zinc-500 hover:text-white underline">Clear Identity</button>
                    </div>
                  </div>

                  {/* Election Selection */}
                  <div>
                    <h3 className="text-lg font-medium text-white mb-4">Active Election</h3>
                    <div className="grid gap-4">
                      {elections.map(e => (
                        <div 
                          key={e.id}
                          className={cn(
                            "p-6 rounded-3xl border transition-colors",
                            selectedElection?.id === e.id ? "border-emerald-500/50 bg-emerald-500/5" : "border-zinc-800 bg-zinc-900/40"
                          )}
                        >
                          <h4 className="text-lg font-bold mb-6">{e.name}</h4>
                          <div className="grid md:grid-cols-2 gap-4">
                            {e.candidates.map(candidate => (
                              <CandidateCard 
                                key={candidate.id} 
                                candidate={candidate} 
                                selected={selectedCandidateId === candidate.id}
                                onSelect={() => setSelectedCandidateId(candidate.id)}
                                results={results[e.id]?.[candidate.id] || 0}
                              />
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {feedback && (
                    <div className={cn(
                      "p-4 rounded-xl text-sm flex items-center gap-3",
                      feedback.type === 'success' ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" : "bg-red-500/10 text-red-400 border border-red-500/20"
                    )}>
                      {feedback.type === 'success' ? <CheckCircle2 size={18} /> : <Info size={18} />}
                      {feedback.message}
                    </div>
                  )}

                  <button
                    onClick={handleVote}
                    disabled={isVoting || !selectedCandidateId}
                    className="w-full bg-emerald-500 text-black font-bold py-6 rounded-2xl hover:bg-emerald-400 transition-all shadow-[0_10px_30px_rgba(16,185,129,0.3)] disabled:opacity-50 disabled:grayscale"
                  >
                    {isVoting ? 'Signing & Verifying...' : 'Cast Secure Vote'}
                  </button>
                </div>
              )}
            </motion.div>
          )}

          {view === 'admin' && (
            <motion.div
              key="admin"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="grid gap-10"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-3 bg-zinc-900 rounded-2xl">
                    <Database className="text-emerald-500" size={24} />
                  </div>
                  <div>
                    <h2 className="text-2xl font-bold text-white">Blockchain Ledger</h2>
                    <p className="text-sm text-zinc-500">Live monitoring of nodes and transactions.</p>
                  </div>
                </div>
                <button 
                  onClick={forceMine}
                  className="px-6 py-2 border border-emerald-500/30 text-emerald-400 rounded-full hover:bg-emerald-500/10 transition-colors text-sm font-mono"
                >
                  FORCE MINE BLOCK
                </button>
              </div>

              {/* Chain Viz */}
              <div className="relative">
                <div className="flex gap-6 overflow-x-auto pb-8 scrollbar-hide">
                  {blockchain.map((block, i) => (
                    <BlockchainNode 
                      key={block.hash} 
                      block={block} 
                      isNew={i === blockchain.length - 1} 
                    />
                  ))}
                  {blockchain.length === 0 && (
                    <div className="w-full py-20 text-center border-2 border-dashed border-zinc-800 rounded-3xl">
                      <p className="text-zinc-600">Initializing Network...</p>
                    </div>
                  )}
                </div>
              </div>

              <div className="grid md:grid-cols-2 gap-8">
                {/* Audit Logs */}
                <div className="bg-zinc-900/30 border border-zinc-800 rounded-3xl overflow-hidden">
                  <div className="p-5 border-b border-zinc-800 flex items-center justify-between bg-zinc-900/50">
                    <div className="flex items-center gap-2">
                      <History size={18} className="text-zinc-500" />
                      <h3 className="font-bold text-sm">System Logs</h3>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                      <span className="text-[10px] font-mono text-zinc-500">RECORDING</span>
                    </div>
                  </div>
                  <div className="p-4 space-y-3 font-mono text-xs overflow-y-auto max-h-[300px]">
                    {logs.map((log, i) => (
                      <div key={i} className="flex gap-3 text-zinc-400 pb-2 border-b border-zinc-800/30 last:border-0">
                        <span className="text-zinc-600 whitespace-nowrap">0x{i.toString(16).padStart(2, '0')}</span>
                        <p>{log}</p>
                      </div>
                    ))}
                    {logs.length === 0 && <p className="text-zinc-700 italic">No activity detected yet.</p>}
                  </div>
                </div>

                {/* Results Section */}
                <div className="bg-zinc-900/30 border border-zinc-800 rounded-3xl overflow-hidden">
                  <div className="p-5 border-b border-zinc-800 bg-zinc-900/50">
                    <div className="flex items-center gap-2">
                      <Activity size={18} className="text-zinc-500" />
                      <h3 className="font-bold text-sm">Live Results Verification</h3>
                    </div>
                  </div>
                  <div className="p-6">
                    {elections.map(e => (
                      <div key={e.id} className="space-y-4">
                        <h4 className="text-xs font-mono uppercase text-zinc-500 mb-6">{e.name}</h4>
                        {e.candidates.map(c => {
                          const resultsForElection = results[e.id] || {};
                          const votes = resultsForElection[c.id] || 0;
                          const voteValues = Object.values(resultsForElection) as number[];
                          const totalVotes = voteValues.reduce((a, b) => a + b, 0) || 1;
                          const percent = Math.round((votes / totalVotes) * 100);
                          
                          return (
                            <div key={c.id}>
                              <div className="flex justify-between items-end mb-1 text-sm">
                                <span className="font-medium text-zinc-200">{c.name}</span>
                                <span className="text-zinc-500 text-xs font-mono">{votes} / {percent}%</span>
                              </div>
                              <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
                                <motion.div 
                                  initial={{ width: 0 }}
                                  animate={{ width: `${percent}%` }}
                                  className="h-full bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.4)]"
                                />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Footer Branding */}
      <footer className="border-t border-zinc-900 py-10 mt-20">
        <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="text-[10px] font-mono text-zinc-600 uppercase tracking-widest">
            VoxChain Protocol v1.4.0 — Secure Democratic Infrastructure
          </div>
          <div className="flex gap-8 text-[11px] text-zinc-500 hover:text-zinc-400">
            <a href="#">Whitepaper</a>
            <a href="#">Audit Report</a>
            <a href="#">Github</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
