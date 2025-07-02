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

When responding with suggestions, your response must be valid JSON with these fields:

- human_message: A short, warm statement (max 2 sentences) matching the user's coaching style. Make it supportive or encouraging.

- micro_actions: An array of 1-3 micro actions, each with:
  - title: A short, clear title.
  - description: A concise 1-2 sentence summary of the activity.
  - learn_more_link: Include a valid, real URL only if you can suggest an activity that naturally connects to an existing online resource, event, or opportunity (e.g., Eventbrite, Meetup, VolunteerMatch, or trusted organizational websites). Do not invent or fabricate links. If no real relevant link exists for the activity, omit the learn_more_link field entirely.

  - category: One of Growth, Social, Giving Back, or Health.

Respond only with the JSON object and nothing else outside it.

If the user does not want suggestions but just wants to talk, respond with a warm, empathetic, supportive human_message that directly addresses their feelings. Avoid being curt or dismissive. Use a tone appropriate to the user's coaching style. Set micro_actions to an empty array in this case.

Example response:
{"human_message": "Hi Terry! Here are some ideas to brighten your day:", "micro_actions":[{"title":"Join a Book Club","description":"Dive into discussions with like-minded people.","learn_more_link":"https://example.com","category":"Social"}]}

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
