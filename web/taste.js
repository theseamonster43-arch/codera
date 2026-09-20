/**
 * What Codera recommends, and why.
 *
 * Every post is read for the subjects it is about (Python, Rust, game
 * development and so on) from its title, description, body, code language and
 * code. Each person carries a small score per subject, kept in taste/{uid}:
 * watching something nudges its subjects up, a like pushes harder, a dislike
 * pulls down, and a search counts too. Scores fade a little with every change, so
 * last month's interest gives way to this week's.
 *
 * The feed is then ordered by how well a post's subjects match those scores,
 * whether its author is someone you follow, how recent it is and how liked.
 * Someone brand new has no scores yet and simply sees the newest, most liked
 * first. The same file is copied into the desktop and phone apps so all three
 * recommend alike.
 */

/** Subjects, and the words that give each away. Matched on whole words. */
export const TOPICS = {
  python: ['python', 'py', 'django', 'flask', 'fastapi', 'pandas', 'numpy', 'pip', 'jupyter'],
  javascript: ['javascript', 'js', 'node', 'nodejs', 'npm', 'express', 'deno', 'bun'],
  typescript: ['typescript', 'ts', 'tsx'],
  react: ['react', 'nextjs', 'next.js', 'jsx', 'react native', 'expo'],
  web: ['html', 'css', 'tailwind', 'frontend', 'website', 'web', 'svelte', 'vue', 'angular'],
  rust: ['rust', 'cargo', 'rustlang', 'tauri'],
  go: ['golang', 'go'],
  java: ['java', 'spring', 'jvm', 'gradle'],
  kotlin: ['kotlin', 'jetpack', 'compose'],
  swift: ['swift', 'swiftui', 'xcode'],
  csharp: ['c#', 'csharp', '.net', 'dotnet', 'asp.net'],
  cpp: ['c++', 'cpp', 'c', 'arduino'],
  sql: ['sql', 'postgres', 'postgresql', 'mysql', 'sqlite', 'database', 'firebase', 'firestore', 'mongodb'],
  git: ['git', 'github', 'gitlab', 'commit', 'merge'],
  linux: ['linux', 'bash', 'terminal', 'shell', 'ubuntu', 'command', 'cmd', 'powershell'],
  ai: ['ai', 'ml', 'machine learning', 'neural', 'llm', 'gpt', 'claude', 'pytorch', 'tensorflow', 'model'],
  games: ['game', 'games', 'gamedev', 'unity', 'godot', 'unreal', 'roblox', 'lua', 'minecraft'],
  mobile: ['android', 'ios', 'iphone', 'flutter', 'mobile', 'app'],
  devops: ['docker', 'kubernetes', 'k8s', 'aws', 'azure', 'gcp', 'cloud', 'deploy', 'ci', 'server'],
  security: ['security', 'hacking', 'ctf', 'encryption', 'auth', 'password'],
};

// The code-language picker's names, for posts that carry one.
const LANG_TOPIC = {
  JavaScript: 'javascript', Python: 'python', TypeScript: 'typescript', Java: 'java',
  'C++': 'cpp', Go: 'go', Rust: 'rust',
};

const escapeRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// One pattern per subject, built once. Word edges are spaces, punctuation or the
// ends of the text, so "go" matches "go 1.22" but not "google".
const MATCHERS = Object.entries(TOPICS).map(([topic, words]) => [
  topic,
  new RegExp('(^|[^a-z0-9+#.])(' + words.map(escapeRe).join('|') + ')(?=$|[^a-z0-9+#])', 'i'),
]);

/** The subjects of a piece of text. */
export function topicsOfText(text) {
  const t = String(text || '').toLowerCase();
  if (!t) return [];
  return MATCHERS.filter(([, re]) => re.test(t)).map(([topic]) => topic);
}

/** The subjects of a post, short, video or stream. */
export function topicsOf(p) {
  if (!p) return [];
  const found = new Set(topicsOfText([p.title, p.description, p.body].filter(Boolean).join(' ')));
  if (p.lang && LANG_TOPIC[p.lang]) found.add(LANG_TOPIC[p.lang]);
  // Code is long and full of words; only its first lines are read, and only
  // for a post nothing else has named a subject for.
  if (p.code && !found.size) topicsOfText(String(p.code).slice(0, 400)).forEach(t => found.add(t));
  return [...found];
}

/** How much each kind of action says about what someone likes. */
export const WEIGHT = { watch: 1, like: 3, dislike: -2, search: 2, comment: 2, stream: 1.5 };

const FADE = 0.97;      // every change keeps 97% of what was there before
const KEEP = 40;        // subjects remembered at most

/**
 * The scores after an action on some subjects. Pure: takes the old map and
 * hands back a new one, ready to be written to taste/{uid}.
 */
export function learn(scores, topics, weight) {
  if (!topics || !topics.length || !weight) return scores || {};
  const next = {};
  for (const [k, v] of Object.entries(scores || {})) {
    const faded = v * FADE;
    if (Math.abs(faded) >= 0.05) next[k] = Math.round(faded * 100) / 100;
  }
  for (const t of topics) {
    next[t] = Math.max(-10, Math.min(50, (next[t] || 0) + weight));
  }
  // Only the strongest few are kept, so the document stays small.
  return Object.fromEntries(
    Object.entries(next).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1])).slice(0, KEEP),
  );
}

const millis = ts => (ts && ts.toMillis ? ts.toMillis() : typeof ts === 'number' ? ts : 0);

/**
 * How strongly to recommend a post to someone.
 *
 * @param p          the post
 * @param scores     their taste map
 * @param following  a Set of uids they follow
 * @param now        Date.now(), passed in so a whole list is scored at one moment
 */
export function score(p, scores, following, now) {
  const topics = topicsOf(p);
  const s = scores || {};
  const total = Object.values(s).reduce((n, v) => n + Math.max(0, v), 0) || 1;
  // The share of this person's interest the post's subjects cover, 0 to 1.
  const match = topics.reduce((n, t) => n + Math.max(0, s[t] || 0), 0) / total;
  const dislike = topics.reduce((n, t) => n + Math.min(0, s[t] || 0), 0);

  const hours = Math.max(0, (now - millis(p.createdAt)) / 3.6e6);
  const fresh = Math.exp(-hours / 72);
  const liked = Math.log1p(Math.max(0, (p.likeCount || 0) - (p.dislikeCount || 0) * 0.5));

  return match * 6
    + (following && following.has(p.uid) ? 2.5 : 0)
    + fresh * 3
    + liked * 0.8
    + dislike * 0.3;
}

/** A list, best first for this person. */
export function rank(list, scores, following) {
  const now = Date.now();
  return list
    .map(p => ({ p, s: score(p, scores, following, now) }))
    .sort((a, b) => b.s - a.s)
    .map(x => x.p);
}

/** The subjects someone cares about most, for the "Because you watch …" line. */
export function favourites(scores, n = 3) {
  return Object.entries(scores || {})
    .filter(([, v]) => v > 1)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([k]) => k);
}

/** A subject's name as people write it. */
export const TOPIC_LABEL = {
  python: 'Python', javascript: 'JavaScript', typescript: 'TypeScript', react: 'React', web: 'Web',
  rust: 'Rust', go: 'Go', java: 'Java', kotlin: 'Kotlin', swift: 'Swift', csharp: 'C#', cpp: 'C/C++',
  sql: 'Databases', git: 'Git', linux: 'Linux', ai: 'AI', games: 'Game dev', mobile: 'Mobile',
  devops: 'DevOps', security: 'Security',
};
