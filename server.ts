import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import crypto from 'crypto';

// --- Blockchain Logic ---

interface Vote {
  nullifier: string;
  candidateId: string;
  timestamp: number;
  electionId: string;
  zkProof: string;
}

interface Block {
  index: number;
  timestamp: number;
  votes: Vote[];
  previousHash: string;
  hash: string;
  nonce: number;
}

// In-Memory Registrar (Simulates a Smart Contract State)
const voterCommitments = new Set<string>();
const usedNullifiers = new Set<string>();

class Blockchain {
  public chain: Block[] = [];
  private difficulty: number = 2; 
  private pendingVotes: Vote[] = [];

  constructor() {
    this.createGenesisBlock();
  }

  private createGenesisBlock() {
    const genesisBlock: Block = {
      index: 0,
      timestamp: Date.now(),
      votes: [],
      previousHash: '0',
      hash: this.calculateHash(0, '0', Date.now(), [], 0),
      nonce: 0,
    };
    this.chain.push(genesisBlock);
  }

  public calculateHash(index: number, previousHash: string, timestamp: number, votes: Vote[], nonce: number): string {
    return crypto
      .createHash('sha256')
      .update(index + previousHash + timestamp + JSON.stringify(votes) + nonce)
      .digest('hex');
  }

  public getLatestBlock(): Block {
    return this.chain[this.chain.length - 1];
  }

  public addVote(vote: Vote) {
    this.pendingVotes.push(vote);
    if (this.pendingVotes.length >= 3) {
      this.minePendingVotes();
    }
  }

  public minePendingVotes() {
    if (this.pendingVotes.length === 0) return null;

    const block = {
      index: this.chain.length,
      timestamp: Date.now(),
      votes: [...this.pendingVotes],
      previousHash: this.getLatestBlock().hash,
      nonce: 0,
      hash: '',
    };

    while (
      this.calculateHash(block.index, block.previousHash, block.timestamp, block.votes, block.nonce).substring(0, this.difficulty) !==
      Array(this.difficulty + 1).join('0')
    ) {
      block.nonce++;
    }

    block.hash = this.calculateHash(block.index, block.previousHash, block.timestamp, block.votes, block.nonce);
    
    this.chain.push(block);
    this.pendingVotes = [];
    return block;
  }

  public isChainValid(): boolean {
    for (let i = 1; i < this.chain.length; i++) {
      const currentBlock = this.chain[i];
      const previousBlock = this.chain[i - 1];
      if (currentBlock.hash !== this.calculateHash(currentBlock.index, currentBlock.previousHash, currentBlock.timestamp, currentBlock.votes, currentBlock.nonce)) return false;
      if (currentBlock.previousHash !== previousBlock.hash) return false;
    }
    return true;
  }

  public getResults(electionId: string) {
    const tally: Record<string, number> = {};
    this.chain.forEach(block => {
      block.votes.forEach(vote => {
        if (vote.electionId === electionId) {
          tally[vote.candidateId] = (tally[vote.candidateId] || 0) + 1;
        }
      });
    });
    return tally;
  }
}

// --- Server Setup ---

const blockchain = new Blockchain();
const activeElections = [
  { id: 'gen-2026', name: 'General Election 2026', candidates: [
    { id: 'c1', name: 'Alice Johnson', party: 'Decentralized Party' },
    { id: 'c2', name: 'Bob Smith', party: 'Immutable Alliance' },
    { id: 'c3', name: 'Charlie Davis', party: 'Standard Protocol' }
  ]}
];

async function startServer() {
  const app = express();
  const server = createServer(app);
  const io = new Server(server);
  const PORT = 3000;

  app.use(express.json());

  // API Routes
  app.get('/api/elections', (req, res) => {
    res.json(activeElections);
  });

  app.post('/api/register', (req, res) => {
    const { commitment } = req.body;
    if (!commitment) return res.status(400).json({ error: 'Commitment required' });
    voterCommitments.add(commitment);
    res.json({ success: true });
  });

  app.get('/api/blockchain', (req, res) => {
    res.json({
      chain: blockchain.chain,
      isValid: blockchain.isChainValid()
    });
  });

  app.get('/api/results/:electionId', (req, res) => {
    res.json(blockchain.getResults(req.params.electionId));
  });

  app.post('/api/vote', (req, res) => {
    const { nullifier, candidateId, timestamp, zkProof, electionId, commitment } = req.body;
    
    // ZK Simulation Checks
    if (!nullifier || !candidateId || !zkProof || !electionId || !commitment) {
      return res.status(400).json({ error: 'Missing cryptodata' });
    }

    if (!voterCommitments.has(commitment)) {
      return res.status(403).json({ error: 'Commitment not registered' });
    }

    if (usedNullifiers.has(nullifier)) {
      return res.status(403).json({ error: 'Double voting detected! Nullifier already used.' });
    }

    // In a real ZK app, we'd verify the zkProof against the set of commitments without knowing which commitment belongs to the voter.
    // Here we'll simulate the "Zero Knowledge" aspect by not storing the commitment in the blockchain record.
    
    usedNullifiers.add(nullifier);
    const vote: Vote = { nullifier, candidateId, timestamp, zkProof, electionId };
    blockchain.addVote(vote);

    const results = blockchain.getResults(electionId);
    io.emit('results_update', { electionId, results });
    io.emit('new_vote', { nullifier: nullifier.substring(0, 8) + '...', timestamp });

    res.json({ success: true, message: 'Vote accepted anonymously' });
  });

  app.post('/api/mine', (req, res) => {
    const block = blockchain.minePendingVotes();
    if (block) {
      io.emit('block_mined', block);
      // Update all election results
      activeElections.forEach(e => {
        io.emit('results_update', { electionId: e.id, results: blockchain.getResults(e.id) });
      });
      res.json({ success: true, block });
    } else {
      res.json({ success: false, message: 'No pending votes to mine' });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
