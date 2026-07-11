import { env } from './config/env.js';

async function listModels() {
  const apiKey = env.GEMINI_API_KEY;
  console.log('Listing models for API Key:', apiKey ? 'FOUND' : 'MISSING');
  if (!apiKey) return;

  const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;

  try {
    const response = await fetch(url);
    console.log('Status:', response.status, response.statusText);
    const data = await response.json();
    console.log('API Response:', JSON.stringify(data, null, 2));
  } catch (error) {
    console.error('Error fetching models:', error);
  }
}

listModels();
