import { OpenAI } from 'openai';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export default async function handler(req, res) {
  // ✅ ADD THESE CORS HEADERS FIRST:
  res.setHeader("Access-Control-Allow-Origin", "https://primify.ai");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  // ✅ HANDLE PREFLIGHT OPTIONS REQUEST:
  if (req.method === 'OPTIONS') {
    return;
  }

  const { userId, userMessage } = req.body;

  if (!userId || !userMessage) {
    return res.status(400).json({ error: 'Missing userId or userMessage' });
  }

  const { data: profile, error } = await supabase
    .from('profiles')
    .select('coaching_style, retirement_stage, interest_categories, friendly_name')
    .eq('user_id', userId)
    .single();

  if (error || !profile) {
    return res.status(500).json({ error: 'Failed to load user profile' });
  }

  const systemPrompt = `
You are Mira, the friendly retirement coach in the Primify app — a mirror into each user’s next chapter.

Your mission is to help users build a life of meaning, wellness, connection, and growth in retirement — one day at a time.

You adapt your suggestions based on:
- The user's retirement stage: Planning, Just Retired, Settling In, or Redefining
- Their coaching style: Laid-back, Structured, Playful, or Focused
- Their stated interests and focus areas: Growth, Social, Giving Back, Health

You offer:
- Personalized daily nudges
- Reflections and affirmations
- Specific activities to try
- External resource links from known sites like Eventbrite, VolunteerMatch, Meetup (no browsing)

When asked, you can turn a suggestion into a micro action with:
- A short title
- 1-sentence description
- A link to sign up or learn more (if applicable)
- A category: Growth, Social, Giving Back, or Health

Your tone matches their coaching style:
- Laid-back: gentle and encouraging
- Structured: step-by-step and motivating
- Playful: light and fun
- Focused: clear and goal-oriented

User's Profile Data:
- Friendly Name: ${profile.friendly_name}
- Coaching Style: ${profile.coaching_style}
- Retirement Stage: ${profile.retirement_stage}
- Interests: ${profile.interest_categories || 'None'}
`;

  const completion = await openai.chat.completions.create({
    model: 'gpt-4',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage }
    ]
  });

  res.status(200).json({ reply: completion.choices[0].message.content });
}
