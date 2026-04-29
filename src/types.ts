export interface Voter {
  id: string;
  name: string;
  publicKey: string;
  privateKey?: string; // Only available during registration for demo
}

export interface Candidate {
  id: string;
  name: string;
  party: string;
}

export interface Election {
  id: string;
  name: string;
  candidates: Candidate[];
}

export interface Vote {
  nullifier: string; // Anonymous unique ID for this voter+election
  candidateId: string;
  timestamp: number;
  electionId: string;
  zkProof: string; // Cryptographic proof of eligibility
}

export interface VoterIdentity {
  secret: string;
  commitment: string;
}

export interface Block {
  index: number;
  timestamp: number;
  votes: Vote[];
  previousHash: string;
  hash: string;
  nonce: number;
}
