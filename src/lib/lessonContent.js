// lib/lessonContent.js
// Static content bank — no Firestore reads needed for this (keeps you on
// free Spark tier). Extend arrays freely; structure stays the same.

export const DIFFICULTY_CONFIG = {
  beginner: { label: "Beginner", wpmTarget: 15, accuracyTarget: 85 },
  intermediate: { label: "Intermediate", wpmTarget: 30, accuracyTarget: 90 },
  advanced: { label: "Advanced", wpmTarget: 50, accuracyTarget: 95 },
};

// ---------- PRACTICE MODE: random pull per difficulty ----------
export const PRACTICE_CONTENT = {
  en: {
    beginner: [
      "the cat sat on the mat",
      "we go to the market for milk",
      "she can run and jump",
      "his dog is very small",
      "we like to read and play",
    ],
    intermediate: [
      "The weather today is pleasant and the sky is clear with a few clouds.",
      "Most students prefer to study early in the morning before it gets noisy.",
      "Our new office has better lighting and more space for everyone to work.",
      "He finished his homework quickly so he could watch the cricket match.",
    ],
    advanced: [
      "The government's new policy on renewable energy aims to reduce dependency on fossil fuels by 40% over the next decade, according to officials.",
      "Despite repeated warnings from the weather department, several coastal villages remained unprepared for the sudden and intense monsoon downpour.",
      "Candidates appearing for the competitive examination are advised to carry their admit card, a valid photo ID, and two passport-size photographs.",
    ],
  },
  hi: {
    beginner: [
      "राम घर जाता है",
      "यह मेरी किताब है",
      "वह पानी पीता है",
      "बच्चे खेल रहे हैं",
      "सूरज पूरब से निकलता है",
    ],
    intermediate: [
      "आज मौसम बहुत सुहावना है और आसमान में हल्के बादल छाए हुए हैं।",
      "विद्यार्थियों को प्रतिदिन नियमित रूप से अभ्यास करना चाहिए ताकि गति बढ़ सके।",
      "हमारे शहर में इस साल पानी की समस्या पिछले वर्षों से कम रही है।",
    ],
    advanced: [
      "सरकार ने नई शिक्षा नीति के अंतर्गत डिजिटल शिक्षा को बढ़ावा देने के लिए कई महत्वपूर्ण घोषणाएँ की हैं, जिनका उद्देश्य ग्रामीण क्षेत्रों तक पहुँच सुनिश्चित करना है।",
      "परीक्षा में उपस्थित होने वाले सभी अभ्यर्थियों को प्रवेश पत्र, वैध फोटो पहचान पत्र तथा दो पासपोर्ट आकार की फोटो साथ लाना अनिवार्य है।",
    ],
  },
};

// ---------- LEARN MODE: sequential, level-locked lessons ----------
// Each level unlocks after the previous is passed at accuracyTarget.
export const LEARN_LESSONS = {
  en: [
    { level: 1, type: "keys", text: "asdf jkl;" },
    { level: 2, type: "keys", text: "fj fj dk dk sl sl a; a;" },
    { level: 3, type: "keys", text: "qwer uiop" },
    { level: 4, type: "words", text: "as ask sad lad jak all fall" },
    { level: 5, type: "words", text: "the quick brown fox jumps" },
    { level: 6, type: "sentence", text: "The sun rises in the east." },
    { level: 7, type: "sentence", text: "She sells sea shells by the sea shore." },
    { level: 8, type: "paragraph", text: "Typing every day for ten minutes will steadily improve both your speed and accuracy over time." },
  ],
  hi: [
    { level: 1, type: "keys", text: "र त क द" },
    { level: 2, type: "keys", text: "म न व ल" },
    { level: 3, type: "keys", text: "ा ि ी ु" },
    { level: 4, type: "words", text: "कल घर नल तर" },
    { level: 5, type: "words", text: "राम काम नाम धाम" },
    { level: 6, type: "sentence", text: "राम घर जाता है।" },
    { level: 7, type: "sentence", text: "सूरज पूरब से निकलता है।" },
    { level: 8, type: "paragraph", text: "प्रतिदिन दस मिनट अभ्यास करने से आपकी गति और शुद्धता दोनों में लगातार सुधार होगा।" },
  ],
};

// ---------- GAME MODE: word pools for falling-words / sprint ----------
export const GAME_WORDS = {
  en: {
    beginner: ["cat", "dog", "sun", "map", "run", "big", "top", "red"],
    intermediate: ["market", "school", "cricket", "monsoon", "office", "answer"],
    advanced: ["government", "examination", "renewable", "unprepared", "coastal"],
  },
  hi: {
    beginner: ["राम", "घर", "पानी", "बच्चे", "सूरज", "फूल"],
    intermediate: ["मौसम", "विद्यार्थी", "अभ्यास", "शहर", "समस्या"],
    advanced: ["सरकार", "परीक्षा", "अभ्यर्थी", "घोषणा", "डिजिटल"],
  },
};

export function getPracticeText(language, difficulty) {
  const pool = PRACTICE_CONTENT[language]?.[difficulty] || PRACTICE_CONTENT.en.beginner;
  return pool[Math.floor(Math.random() * pool.length)];
}

export function getLearnLessons(language) {
  return LEARN_LESSONS[language] || LEARN_LESSONS.en;
}

export function getGameWords(language, difficulty) {
  return GAME_WORDS[language]?.[difficulty] || GAME_WORDS.en.beginner;
}
