import { io, Socket } from 'socket.io-client';
import { Block, Election, Vote } from '../types';

let socket: Socket | null = null;

export function getSocket() {
  if (!socket) {
    socket = io();
  }
  return socket;
}

export async function getElections(): Promise<Election[]> {
  const res = await fetch('/api/elections');
  return res.json();
}

export async function getBlockchain() {
  const res = await fetch('/api/blockchain');
  return res.json();
}

export async function getResults(electionId: string): Promise<Record<string, number>> {
  const res = await fetch(`/api/results/${electionId}`);
  return res.json();
}

export async function registerVoter(commitment: string) {
  const res = await fetch('/api/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ commitment })
  });
  return res.json();
}

export async function submitVote(vote: any) {
  const res = await fetch('/api/vote', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(vote)
  });
  return res.json();
}

export async function forceMine() {
  const res = await fetch('/api/mine', {
    method: 'POST'
  });
  return res.json();
}
