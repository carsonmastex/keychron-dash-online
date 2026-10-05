// Leaderboard name filter, shared by the game (instant feedback) and the
// Worker (enforced). Two tiers to avoid blocking real names that happen to
// contain a rude string (Cassie, Hancock, Dickson, Matsushita):
//  - STRONG words are blocked anywhere, even inside other letters or with
//    spaces/dots/leetspeak in between ("f.u.c.k", "Fuuuck", "sh1thead").
//  - WORD words are blocked only as a whole word ("ass", "dick", "shit").
// Chinese/Cantonese terms are matched as substrings of the raw name.

const STRONG = [
  "fuck", "fuk", "fck", "phuck", "cunt", "nigg", "nigga", "faggot", "fagot",
  "wank", "motherf", "bitch", "biatch", "whore", "slut", "pussy", "bastard",
  "asshole", "arsehole", "dickhead", "shithead", "bullshit", "retard",
  "hitler", "nazi", "porn", "dildo", "blowjob", "jizz", "pedo", "rapist",
  // Cantonese romanisation
  "dllm", "pukgai", "pokgai", "hamgachan", "hamgaachan", "diulei", "diulay", "diunei",
];

const WORD = [
  "ass", "arse", "dick", "cock", "tit", "tits", "piss", "shit", "shitty", "fag",
  "fags", "rape", "cum", "prick", "twat", "kkk", "sex", "xxx", "anal", "boob", "boobs",
  "damn", "crap", "diu",
];

const CHINESE = [
  "屌", "撚", "閪", "𨳒", "柒", "仆街", "冚家", "戇鳩", "鳩", "肏", "操你", "干你",
  "傻逼", "傻屄", "屄", "婊", "妈的", "媽的", "他媽", "他妈", "你妈", "你媽", "雞巴", "鸡巴",
  "賤人", "贱人", "死全家",
];

const LEET: Record<string, string> = {
  "0": "o", "1": "i", "!": "i", "|": "i", "3": "e", "4": "a", "@": "a",
  "5": "s", "$": "s", "7": "t", "+": "t", "8": "b", "9": "g", "*": "u",
};

function deLeet(text: string) {
  return Array.from(text.toLowerCase(), (ch) => LEET[ch] ?? ch).join("");
}

/** True if the name contains a blocked word. */
export function isBlockedName(name: string): boolean {
  const raw = name.normalize("NFKC");
  if (CHINESE.some((term) => raw.includes(term))) return true;

  const lowered = deLeet(raw);
  // Letters only, repeats squashed ("fuuuck" -> "fuck")
  const compact = lowered.replace(/[^a-z]/g, "");
  const squashed = compact.replace(/(.)\1+/g, "$1");
  if (STRONG.some((word) => compact.includes(word) || squashed.includes(word.replace(/(.)\1+/g, "$1")))) {
    return true;
  }

  const words = lowered.split(/[^a-z0-9]+/).filter(Boolean);
  const wordSet = new Set([...words, ...words.map((w) => w.replace(/(.)\1+/g, "$1"))]);
  return WORD.some((word) => wordSet.has(word));
}
