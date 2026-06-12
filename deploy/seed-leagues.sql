-- Seed Trading Leagues — Season 1 (June 2026)
-- Run on VPS: psql "$DATABASE_URL" -f /opt/cryptox/deploy/seed-leagues.sql

INSERT INTO competitions (
  title, subtitle, description,
  prize_pool, prize_unit, top_prize,
  reward_tiers_json, rules_json,
  hero_icon, hero_color,
  join_url, scoring_rule,
  starts_at, ends_at,
  status, is_featured, is_published, position
) VALUES (
  'Zebvix Trading Champions',
  'Season 1 · June 2026',
  'A 30-day competition for India''s top traders. The highest trading volume across Spot, Futures, and Convert wins a share of the ₹2,000,000 prize pool. Open to all KYC Level 2+ users.',
  '25000',
  'USDT',
  '5000',
  '[
    {"rank":"1",      "prize":"5,000 USDT",  "extra":"+ Diamond Badge",    "tone":"amber"},
    {"rank":"2-3",    "prize":"2,500 USDT",  "extra":"+ Gold Badge",       "tone":"zinc"},
    {"rank":"4-10",   "prize":"500 USDT",    "extra":"+ Silver Badge",     "tone":"orange"},
    {"rank":"11-50",  "prize":"100 USDT",    "extra":"+ Participant Badge", "tone":"emerald"},
    {"rank":"51-100", "prize":"50 USDT",     "extra":"+ Participant NFT",  "tone":"emerald"}
  ]',
  '[
    "All KYC Level 2+ users are automatically eligible.",
    "Volume is counted from Spot, Futures, and Convert trades.",
    "Leaderboard is computed from real-time trading data.",
    "Season runs from June 1, 2026 00:00 IST to June 30, 2026 23:59 IST.",
    "Prizes credited to winner wallets within 7 business days of season end.",
    "TDS @ 1% applicable on prizes as per Section 194S of the Income Tax Act.",
    "Zebvix reserves the right to disqualify suspicious or wash-trading activity."
  ]',
  'trophy',
  '#f59e0b',
  '/trade',
  'volume',
  '2026-06-01 00:00:00+05:30',
  '2026-06-30 23:59:59+05:30',
  'active',
  true,
  true,
  1
)
ON CONFLICT DO NOTHING;

SELECT id, title, status, starts_at, ends_at, prize_pool FROM competitions ORDER BY id;
