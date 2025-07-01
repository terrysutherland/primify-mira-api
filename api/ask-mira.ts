import { OpenAI } from 'openai';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export default async function handler(req, res) {
  console.log("🟢 Mira API: Handler started");

  // ✅ ADD THESE CORS HEADERS FIRST:
  res.setHeader("Access-Control-Allow-Origin", "https://primify.ai");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  // ✅ HANDLE PREFLIGHT OPTIONS REQUEST:
  if (req.method === 'OPTIONS') {
    console.log("🟡 Mira API: OPTIONS request - exiting early");
    return res.status(204).end();
  }

  console.log("🟢 Mira API: Received request", req.method);

  const { userId, userMessage } = req.body || {};
  console.log("🟢 Mira API: Parsed body", { userId, userMessage });

  if (!userId || !userMessage) {
    console.error("🔴 Mira API: Missing userId or userMessage");
    return res.status(400).json({ error: 'Missing userId or userMessage' });
  }

  console.log("🟢 Mira API: Fetching user profile from Supabase...");
  const { data: profile, error } = await supabase
    .from('profiles')
    .select('coaching_style, retirement_stage, interest_categories, friendly_name')
    .eq('user_id', userId)
    .single();

  if (error || !profile) {
    console.error("🔴 Mira API: Failed to load user profile", error);
    return res.status(500).json({ error: 'Failed to load user profile' });
  }

  console.log("🟢 Mira API: Loaded profile", profile);

  const systemPrompt = `
You are Mira, the friendly retirement coach in the Primify app — a mirror into each user’s next chapter.

Your mission is to help users build a life of meaning, wellness, connection, and growth in retirement — one day at a time.

You adapt your suggestions based on:
- The user's retirement stage: Planning, Just Retired, Settling In, or Redefining
- Their coaching style: Laid-back, Structured, Playful, or Focused
- Their stated interests and focus areas: Growth, Social, Giving Back, Health

When responding:
1) Always start with a short, warm, human-feeling message (max 2 sentences) matching the user’s coaching style. Make it supportive or encouraging.

2) If the user is asking for ideas, goals, or suggestions, respond exactly in this format (on separate lines):

HUMAN_MESSAGE: "Your short encouraging message here."

JSON_RESPONSE: {
  "micro_action": {
    "title": "string",
    "description": "string (max 2 sentences)",
    "learn_more_link": "string (valid URL, optional)",
    "category": "Growth | Social | Giving Back | Health"
  },
  "follow_up_suggestions": [
    "string",
    "string",
    "string"
  ]
}

3) If the user seems to be chatting or sharing feelings, and not looking for an action, skip the JSON and only give a brief, kind, human-like message starting with:

HUMAN_MESSAGE: "..."

Respond naturally, but do not include any text outside the specified format.

User's Profile Data:
- Friendly Name: ${profile.friendly_name}
- Coaching Style: ${profile.coaching_style}
- Retirement Stage: ${profile.retirement_stage}
- Interests: ${profile.interest_categories || 'None'}
`;


  console.log("🟢 Mira API: Calling OpenAI completion...");
  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage }
      ]
    });
    console.log("🟢 Mira API: OpenAI completion succeeded");

    res.status(200).json({ reply: completion.choices[0].message.content });
    console.log("✅ Mira API: Response sent successfully");
  } catch (err) {
    console.error("🔴 Mira API: OpenAI API error", err);
    res.status(500).json({ error: 'Failed to generate response from OpenAI' });
  }
}
