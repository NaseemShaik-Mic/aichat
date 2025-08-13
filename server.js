import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import OpenAI from 'openai';

const app = express();
app.use(cors({ origin: true }));
app.use(express.json());

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Optional helper: fetch brief text from an IPFS CID (skip binaries)
async function fetchCidText(cid) {
  try {
    const url = `${process.env.IPFS_GATEWAY?.replace(/\/+$/, '')}/${cid}`;
    const res = await fetch(url);
    const ctype = res.headers.get('content-type') || '';
    if (!ctype.includes('text') && !ctype.includes('json')) return null;
    const text = await res.text();
    // Keep it short for cheaper prompts
    return text.slice(0, 2000);
  } catch {
    return null;
  }
}

app.post('/api/chat', async (req, res) => {
  try {
    const { messages, account, cids = [] } = req.body || {};
    const userLast = messages?.filter(m => m.role === 'user').pop()?.text || '';

    // Pull a few CIDs for grounding (totally optional to start)
    const selected = Array.isArray(cids) ? cids.slice(0, 3) : [];
    const cidSnippets = (await Promise.all(selected.map(fetchCidText)))
      .filter(Boolean)
      .map((t, i) => `#CID_${i + 1}\n${t}`)
      .join('\n\n');

    const instructions = [
      "You are 'Cura', a friendly health-records assistant for the CuraVault app.",
      "You can summarize the patient's uploaded records if provided.",
      "Never give medical diagnosis. Encourage consulting a doctor for clinical advice.",
      "If data is missing, say so clearly and suggest what to upload or check next."
    ].join(' ');

    // Keep it super simple: put context + user question in one input
    const input = [
      cidSnippets ? `Context from patient records:\n${cidSnippets}\n` : '',
      `User (${account || 'unknown account'}): ${userLast}`
    ].join('\n');

    // OpenAI Responses API (recommended) — one-shot, non-streaming
    const response = await openai.responses.create({
      model: 'gpt-4o-mini',
      instructions,
      input
    });

    const reply = response.output_text || "Sorry, I couldn't generate a reply.";
    res.json({ reply });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'chat_failed' });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Cura chat API running on http://localhost:${PORT}`));
