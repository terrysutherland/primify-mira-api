import { OpenAI } from 'openai';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export default async function handler(req, res) {
  console.log("🟢 Mira API: Handler started");

  const allowedOrigins = [
    "https://primify.ai",
    "https://lovable.dev",
    "http://localhost:3000",
  ];
  const requestOrigin = req.headers.origin;
  if (allowedOrigins.includes(requestOrigin)) {
    res.setHeader("Access-Control-Allow-Origin", requestOrigin);
  } else {
    res.setHeader("Access-Control-Allow-Origin", "null");
  }
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === 'OPTIONS') {
    console.log("🟡 Mira API: OPTIONS request - exiting early");
    return res.status(204).end();
  }

  console.log("🟢 Mira API: Received request", req.method);

  const { userId, userMessage, recentMessages } = req.body || {};
  const safeRecentMessages = Array.isArray(recentMessages) ? recentMessages : [];

  console.log("🟢 Mira API: Parsed body", { userId, userMessage, recentMessages });

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

  // 🔹 NEW: Fetch user_interests
  console.log("🟢 Mira API: Fetching user interests...");
  const { data: userInterests } = await supabase
    .from('user_interests')
    .select('interest')
    .eq('user_id', userId);

  const specificInterestList = userInterests?.map((i) => i.interest).join(', ') || 'None';

  // 🔹 Fetch today's daily_plan_items
  console.log("🟢 Mira API: Fetching today’s daily plan items...");
  const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  const { data: dailyPlanItems } = await supabase
    .from('daily_plan_items')
    .select('title, completed_at')
    .eq('user_id', userId)
    .gte('date', today)
    .lt('date', `${today}T23:59:59.999Z`);

  const completedItems = dailyPlanItems?.filter(i => i.completed_at);
  const incompleteItems = dailyPlanItems?.filter(i => !i.completed_at);
  const completedText = completedItems?.map(i => `✓ ${i.title}`).join('\n') || 'None';
  const plannedText = incompleteItems?.map(i => `• ${i.title}`).join('\n') || 'None';

  const systemPrompt = `
You are Mira, the friendly retirement coach in the Primify app — a mirror into each user’s next chapter.

Your mission is to help users build a life of meaning, wellness, connection, and growth in retirement — one day at a time.

You always match your tone and suggestions to the user's **coaching style**, which determines how warm, direct, curious, or introspective you are:

- Laid-back: relaxed, gentle, casual (e.g., “No rush — here’s a chill option”)
- Structured: goal-oriented, clear, action-driven (e.g., “Let’s take the next step”)
- Playful: energetic, curious, lighthearted (e.g., “Ready for a fun idea?”)
- Focused: purposeful, introspective, deep (e.g., “Let’s explore what matters most”)

You adapt your suggestions based on:
- The user's retirement stage: Planning, Just Retired, Settling In, or Redefining
- Coaching style: ${profile.coaching_style}
- Their stated interest categories: ${profile.interest_categories || 'None'}
- Their specific interests selected during onboarding: ${specificInterestList}
- Today's planned activities: ${plannedText}
- Today's completed activities: ${completedText}
- You may gently reference the user's specific interests — but do not push or overuse them.
- Only suggest activities aligned with those interests **if** they’re clearly relevant to the current message.
- Focus first on what the user is expressing in the moment — their tone, question, or mood — and match your suggestions accordingly. You are not here to force-fit hobbies.

When responding with suggestions, your response must be valid JSON with these fields:

- human_message: A short, warm statement (max 2 sentences) matching the user's coaching style. Make it supportive or encouraging and not robotic.

- micro_actions: An array of 1–3 micro actions, each with:
  - title: A short, clear title.
  - description: A concise 1–2 sentence summary of the activity.
  - learn_more_link: Include a valid, real URL only if you can suggest an activity that naturally connects to an existing online resource (e.g., Eventbrite, Meetup, VolunteerMatch, YMCA, etc). Do not invent or fabricate links or platforms.
  - category: One of Growth, Social, Giving Back, or Health.

- follow_up_questions: 
  - An array of 2–4 very short first-person user statements (max 3–5 words each) predicting what the user might naturally want to say next.
  - Be phrased in the user’s voice, as if they’re asking a follow-up question
  - Be natural extensions of the current conversation (e.g., "What’s a good next step?", "Any beginner-friendly options?", "Got something social?")
  - Reflect the user’s **coaching style**:
    - Laid-back: relaxed, gentle, casual (e.g., “What else sounds fun?”)
    - Structured: clear, goal-oriented, direct (e.g., “What should I do next?”)
    - Playful: curious, lighthearted, engaging (e.g., “What’s a fun twist?”)
    - Focused: deep, introspective, purposeful (e.g., “What brings meaning to this?”)
  - Avoid vague or coach-like prompts like “Can you tell me more?” or “Have you tried mindfulness?”
  - Avoid repeating any micro actions already shown above
  - Example follow_up_questions:["What’s another fun idea?", "Any tips for starting?", "What would you do?", "I’m not sure yet…"]

Respond only with the JSON object and nothing else outside it.

If the user doesn’t want suggestions but just wants to talk, respond with a warm, empathetic message and ask a probing question. Set micro_actions to an empty array in that case.

User's Profile Data:
- Friendly Name: ${profile.friendly_name}
- Coaching Style: ${profile.coaching_style}
- Retirement Stage: ${profile.retirement_stage}
`;

  console.log("🟢 Mira API: Preparing conversation context...");
  const conversationContext = safeRecentMessages.slice(-3).map((msg) => ({
    role: msg.sender === 'user' ? 'user' : 'assistant',
    content: msg.text
  }));

  console.log("🟢 Mira API: Calling OpenAI completion...");
  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: [
        { role: 'system', content: systemPrompt },
        ...conversationContext,
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
