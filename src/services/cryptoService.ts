/**
 * Browser-side cryptographic functions for ZK-Voting Simulation
 */

async function hash(message: string) {
  const encoder = new TextEncoder();
  const data = encoder.encode(message);
  const hashBuffer = await window.crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function generateVoterIdentity() {
  const array = new Uint8Array(32);
  window.crypto.getRandomValues(array);
  const secret = Array.from(array).map(b => b.toString(16).padStart(2, '0')).join('');
  
  // Commitment is H(secret)
  const commitment = await hash(secret);
  
  return { secret, commitment };
}

/**
 * Generates an anonymous proof and nullifier.
 * Nullifier = H(secret + electionId)
 * Proof = H(secret + electionId + candidateId) - simulated ZK proof
 */
export async function generateAnonymousVote(secret: string, electionId: string, candidateId: string) {
  const nullifier = await hash(secret + electionId);
  const zkProof = await hash(secret + electionId + "PROOF_MARKER"); // Simple proof of knowledge
  
  return { nullifier, zkProof };
}
