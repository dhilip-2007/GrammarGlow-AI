
/* ============================================================
   GrammarGlow AI
   File: script.js
   Version: 1.0
   Frontend grammar and writing assistant
   ============================================================ */

"use strict";

/* ============================================================
   01. APPLICATION CONFIGURATION
   ============================================================ */

const GrammarGlow = {
  name: "GrammarGlow AI",
  version: "1.0.0",
  storagePrefix: "grammarglow_",
  maxHistory: 10,
  maxTextLength: 50000,
  defaultTone: "professional",
  currentTone: "professional",
  isAnalyzing: false,
  lastAnalysis: null,
  currentResults: [],
  initialized: false
};

/* ============================================================
   02. DOM HELPERS
   ============================================================ */

const $ = (selector, root = document) =>
  root.querySelector(selector);

const $$ = (selector, root = document) =>
  Array.from(root.querySelectorAll(selector));

function getElement(...ids) {
  for (const id of ids) {
    const element = document.getElementById(id);
    if (element) return element;
  }
  return null;
}

function setText(element, value) {
  if (element) element.textContent = String(value);
}

function setHTML(element, value) {
  if (element) element.innerHTML = value;
}

function showElement(element) {
  if (element) element.hidden = false;
}

function hideElement(element) {
  if (element) element.hidden = true;
}

function escapeHTML(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/* ============================================================
   03. STORAGE HELPERS
   ============================================================ */

function saveData(key, value) {
  try {
    localStorage.setItem(
      GrammarGlow.storagePrefix + key,
      JSON.stringify(value)
    );
    return true;
  } catch (error) {
    console.warn("Unable to save local data:", error);
    return false;
  }
}

function loadData(key, fallback = null) {
  try {
    const stored = localStorage.getItem(
      GrammarGlow.storagePrefix + key
    );

    return stored === null ? fallback : JSON.parse(stored);
  } catch (error) {
    console.warn("Unable to load local data:", error);
    return fallback;
  }
}

function removeData(key) {
  try {
    localStorage.removeItem(GrammarGlow.storagePrefix + key);
  } catch (error) {
    console.warn("Unable to remove local data:", error);
  }
}

/* ============================================================
   04. NOTIFICATIONS
   ============================================================ */

function showToast(message, type = "success") {
  let container = getElement("toastContainer");

  if (!container) {
    container = document.createElement("div");
    container.id = "toastContainer";
    container.className = "toast-container";
    container.setAttribute("role", "status");
    container.setAttribute("aria-live", "polite");
    document.body.appendChild(container);
  }

  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  toast.textContent = message;

  container.appendChild(toast);

  window.setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transform = "translateY(8px)";

    window.setTimeout(() => toast.remove(), 220);
  }, 2800);
}

/* ============================================================
   05. TEXT UTILITIES
   ============================================================ */

function getEditorText() {
  const editor = getElement("writingInput", "editorInput", "textInput");
  return editor ? editor.value : "";
}

function setEditorText(value) {
  const editor = getElement("writingInput", "editorInput", "textInput");

  if (!editor) return;

  editor.value = value;
  editor.dispatchEvent(new Event("input", { bubbles: true }));
}

function normalizeText(text) {
  return String(text)
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function getWords(text) {
  return String(text).match(/\b[\p{L}\p{N}]+(?:['’][\p{L}]+)*\b/gu) || [];
}

function countWords(text) {
  return getWords(text).length;
}

function countCharacters(text) {
  return String(text).length;
}

function countCharactersWithoutSpaces(text) {
  return String(text).replace(/\s/g, "").length;
}

function countSentences(text) {
  if (!text.trim()) return 0;

  const matches = text.match(/[.!?]+(?=\s|$)|[.!?]+$/g);
  return matches ? matches.length : 1;
}

function countParagraphs(text) {
  if (!text.trim()) return 0;

  return text
    .split(/\n\s*\n/)
    .filter(paragraph => paragraph.trim().length > 0)
    .length;
}

function countSyllables(word) {
  let value = String(word)
    .toLowerCase()
    .replace(/[^a-z]/g, "");

  if (!value) return 1;
  if (value.length <= 3) return 1;

  value = value.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, "");
  value = value.replace(/^y/, "");

  const groups = value.match(/[aeiouy]{1,2}/g);

  return Math.max(1, groups ? groups.length : 1);
}

function calculateReadingTime(text) {
  const words = countWords(text);

  if (words === 0) return "0 min";

  const seconds = Math.ceil((words / 200) * 60);

  if (seconds < 60) return `${seconds} sec`;

  return `${Math.ceil(seconds / 60)} min`;
}

/* ============================================================
   06. LIVE EDITOR METRICS
   ============================================================ */

function updateEditorMetrics() {
  const text = getEditorText();

  const words = countWords(text);
  const characters = countCharacters(text);
  const sentences = countSentences(text);
  const paragraphs = countParagraphs(text);

  setText(getElement("wordCount", "wordsCount"), words);
  setText(getElement("characterCount", "charCount"), characters);
  setText(getElement("sentenceCount", "sentencesCount"), sentences);
  setText(getElement("paragraphCount", "paragraphsCount"), paragraphs);
  setText(getElement("readingTime", "readingTimeValue"), calculateReadingTime(text));

  const metrics = $$(".text-metrics [data-metric]");

  metrics.forEach(element => {
    const metric = element.dataset.metric;

    const values = {
      words,
      characters,
      sentences,
      paragraphs
    };

    if (Object.hasOwn(values, metric)) {
      setText(element, values[metric]);
    }
  });

  updateSaveIndicator();
}

/* ============================================================
   07. AUTO-SAVE
   ============================================================ */

let saveTimeout = null;

function updateSaveIndicator(message = "Auto-save enabled") {
  const indicator = getElement("savedIndicator");

  if (!indicator) return;

  indicator.textContent = message;
}

function autoSaveEditor() {
  window.clearTimeout(saveTimeout);

  updateSaveIndicator("Saving...");

  saveTimeout = window.setTimeout(() => {
    const text = getEditorText();

    const success = saveData("draft", {
      text,
      updatedAt: new Date().toISOString()
    });

    updateSaveIndicator(
      success ? "Saved locally" : "Save unavailable"
    );
  }, 450);
}

function restoreDraft() {
  const draft = loadData("draft");

  if (!draft || typeof draft.text !== "string") return;

  const editor = getElement("writingInput", "editorInput", "textInput");

  if (!editor || editor.value.trim()) return;

  editor.value = draft.text;
  updateEditorMetrics();
  updateSaveIndicator("Draft restored");
}

/* ============================================================
   08. GRAMMAR RULES
   Basic local rules, not a full AI grammar engine.
   ============================================================ */

const GrammarRules = [
  {
    id: "double-space",
    category: "Formatting",
    pattern: / {2,}/g,
    severity: "Low",
    title: "Extra spaces",
    explanation: "Multiple spaces can make your writing look inconsistent.",
    replacement: " "
  },
  {
    id: "space-before-punctuation",
    category: "Punctuation",
    pattern: /\s+([,.!?;:])/g,
    severity: "Low",
    title: "Space before punctuation",
    explanation: "Remove the space immediately before punctuation.",
    replacement: "$1"
  },
  {
    id: "missing-space-after-period",
    category: "Punctuation",
    pattern: /([.!?])([A-Za-z])/g,
    severity: "Medium",
    title: "Missing space after punctuation",
    explanation: "Separate sentences with a space.",
    replacement: "$1 $2"
  },
  {
    id: "repeated-punctuation",
    category: "Punctuation",
    pattern: /([,;:])\1+/g,
    severity: "Low",
    title: "Repeated punctuation",
    explanation: "Repeated commas, semicolons, or colons are usually unnecessary.",
    replacement: "$1"
  },
  {
    id: "repeated-word",
    category: "Grammar",
    pattern: /\b(the|a|an|is|are|to|of|in|and|it)\s+\1\b/gi,
    severity: "Medium",
    title: "Repeated word",
    explanation: "A word may have been typed twice accidentally.",
    replacement: "$1"
  },
  {
    id: "article-university",
    category: "Grammar",
    pattern: /\ba university\b/gi,
    severity: "Low",
    title: "Check article usage",
    explanation: "The article depends on pronunciation; 'a university' is normally correct.",
    replacement: "a university"
  },
  {
    id: "could-of",
    category: "Grammar",
    pattern: /\bcould of\b/gi,
    severity: "Medium",
    title: "Incorrect verb phrase",
    explanation: "Use 'could have' instead of 'could of'.",
    replacement: "could have"
  },
  {
    id: "would-of",
    category: "Grammar",
    pattern: /\bwould of\b/gi,
    severity: "Medium",
    title: "Incorrect verb phrase",
    explanation: "Use 'would have' instead of 'would of'.",
    replacement: "would have"
  },
  {
    id: "should-of",
    category: "Grammar",
    pattern: /\bshould of\b/gi,
    severity: "Medium",
    title: "Incorrect verb phrase",
    explanation: "Use 'should have' instead of 'should of'.",
    replacement: "should have"
  },
  {
    id: "your-welcome",
    category: "Grammar",
    pattern: /\byour welcome\b/gi,
    severity: "Medium",
    title: "Possessive or contraction",
    explanation: "When responding to thanks, use 'you're welcome'.",
    replacement: "you're welcome"
  },
  {
    id: "their-going",
    category: "Grammar",
    pattern: /\btheir going to\b/gi,
    severity: "Medium",
    title: "Check the contraction",
    explanation: "If you mean 'they are going to', write 'they're going to'.",
    replacement: "they're going to"
  },
  {
    id: "its-important",
    category: "Grammar",
    pattern: /\bits important\b/gi,
    severity: "Low",
    title: "Possible missing apostrophe",
    explanation: "If you mean 'it is important', write 'it's important'.",
    replacement: "it's important"
  },
  {
    id: "alot",
    category: "Spelling",
    pattern: /\balot\b/gi,
    severity: "Medium",
    title: "Spelling correction",
    explanation: "'A lot' is written as two words.",
    replacement: "a lot"
  },
  {
    id: "inorder",
    category: "Spelling",
    pattern: /\binorder to\b/gi,
    severity: "Low",
    title: "Spacing correction",
    explanation: "Write 'in order to' as three words.",
    replacement: "in order to"
  },
  {
    id: "doesnt",
    category: "Punctuation",
    pattern: /\bdoesnt\b/gi,
    severity: "Medium",
    title: "Missing apostrophe",
    explanation: "The contraction is normally written 'doesn't'.",
    replacement: "doesn't"
  },
  {
    id: "dont",
    category: "Punctuation",
    pattern: /\bdont\b/gi,
    severity: "Medium",
    title: "Missing apostrophe",
    explanation: "The contraction is normally written 'don't'.",
    replacement: "don't"
  },
  {
    id: "cant",
    category: "Punctuation",
    pattern: /\bcant\b/gi,
    severity: "Medium",
    title: "Missing apostrophe",
    explanation: "When expressing inability, write 'can't'.",
    replacement: "can't"
  },
  {
    id: "wont",
    category: "Punctuation",
    pattern: /\bwont\b/gi,
    severity: "Medium",
    title: "Missing apostrophe",
    explanation: "When expressing refusal or the future negative, write 'won't'.",
    replacement: "won't"
  },
  {
    id: "im",
    category: "Punctuation",
    pattern: /\bim\b/gi,
    severity: "Medium",
    title: "Missing apostrophe",
    explanation: "Write 'I'm' when contracting 'I am'.",
    replacement: "I'm"
  },
  {
    id: "doesnt-work",
    category: "Grammar",
    pattern: /\bhe don't\b/gi,
    severity: "Medium",
    title: "Subject-verb agreement",
    explanation: "In standard English, use 'he doesn't'.",
    replacement: "he doesn't"
  },
  {
    id: "she-dont",
    category: "Grammar",
    pattern: /\bshe don't\b/gi,
    severity: "Medium",
    title: "Subject-verb agreement",
    explanation: "In standard English, use 'she doesn't'.",
    replacement: "she doesn't"
  },
  {
    id: "he-have",
    category: "Grammar",
    pattern: /\bhe have\b/gi,
    severity: "Medium",
    title: "Subject-verb agreement",
    explanation: "Use 'he has' in the present tense.",
    replacement: "he has"
  },
  {
    id: "she-have",
    category: "Grammar",
    pattern: /\bshe have\b/gi,
    severity: "Medium",
    title: "Subject-verb agreement",
    explanation: "Use 'she has' in the present tense.",
    replacement: "she has"
  },
  {
    id: "they-was",
    category: "Grammar",
    pattern: /\bthey was\b/gi,
    severity: "Medium",
    title: "Subject-verb agreement",
    explanation: "In standard English, use 'they were'.",
    replacement: "they were"
  },
  {
    id: "we-was",
    category: "Grammar",
    pattern: /\bwe was\b/gi,
    severity: "Medium",
    title: "Subject-verb agreement",
    explanation: "In standard English, use 'we were'.",
    replacement: "we were"
  },
  {
    id: "i-is",
    category: "Grammar",
    pattern: /\bi is\b/gi,
    severity: "Medium",
    title: "Subject-verb agreement",
    explanation: "Use 'I am' in standard English.",
    replacement: "I am"
  },
  {
    id: "he-are",
    category: "Grammar",
    pattern: /\bhe are\b/gi,
    severity: "Medium",
    title: "Subject-verb agreement",
    explanation: "Use 'he is' in standard English.",
    replacement: "he is"
  },
  {
    id: "she-are",
    category: "Grammar",
    pattern: /\bshe are\b/gi,
    severity: "Medium",
    title: "Subject-verb agreement",
    explanation: "Use 'she is' in standard English.",
    replacement: "she is"
  },
  {
    id: "there-is-people",
    category: "Grammar",
    pattern: /\bthere is (many|several|few|numerous)\b/gi,
    severity: "Medium",
    title: "Subject-verb agreement",
    explanation: "Plural nouns usually require 'there are'.",
    replacement: "there are $1"
  },
  {
    id: "very-very",
    category: "Style",
    pattern: /\bvery\s+very\b/gi,
    severity: "Low",
    title: "Repeated intensifier",
    explanation: "Consider using a more precise descriptive word.",
    replacement: "very"
  },
  {
    id: "in-my-opinion",
    category: "Style",
    pattern: /\bin my personal opinion\b/gi,
    severity: "Low",
    title: "Wordiness",
    explanation: "'In my opinion' is usually enough.",
    replacement: "in my opinion"
  },
  {
    id: "due-to-the-fact",
    category: "Style",
    pattern: /\bdue to the fact that\b/gi,
    severity: "Low",
    title: "Wordiness",
    explanation: "'Because' is often more direct.",
    replacement: "because"
  },
  {
    id: "at-this-point-in-time",
    category: "Style",
    pattern: /\bat this point in time\b/gi,
    severity: "Low",
    title: "Wordiness",
    explanation: "'Now' or 'currently' may be more concise.",
    replacement: "currently"
  }
];

/* ============================================================
   09. RUN GRAMMAR ANALYSIS
   ============================================================ */

function findGrammarIssues(text) {
  const issues = [];
  let issueId = 0;

  GrammarRules.forEach(rule => {
    rule.pattern.lastIndex = 0;

    let match;

    while ((match = rule.pattern.exec(text)) !== null) {
      issues.push({
        id: `${rule.id}-${issueId++}`,
        ruleId: rule.id,
        category: rule.category,
        title: rule.title,
        severity: rule.severity,
        explanation: rule.explanation,
        original: match[0],
        suggestion: match[0].replace(
          rule.pattern,
          rule.replacement
        ),
        index: match.index,
        length: match[0].length
      });

      if (match[0].length === 0) {
        rule.pattern.lastIndex++;
      }
    }
  });

  issues.sort((a, b) => a.index - b.index);

  return issues;
}

/* ============================================================
   10. READABILITY SCORE
   ============================================================ */

function calculateReadability(text) {
  const words = getWords(text);
  const wordCount = words.length;
  const sentenceCount = Math.max(1, countSentences(text));

  if (wordCount === 0) {
    return {
      score: 0,
      level: "No text",
      description: "Enter text to calculate readability.",
      averageSentenceLength: 0,
      averageWordLength: 0
    };
  }

  const syllableCount = words.reduce(
    (total, word) => total + countSyllables(word),
    0
  );

  const averageSentenceLength = wordCount / sentenceCount;

  const averageSyllables = syllableCount / wordCount;

  const averageWordLength =
    words.reduce((total, word) => total + word.length, 0) /
    wordCount;

  /*
   * Approximate Flesch Reading Ease for English text.
   * This is a heuristic, not a professional linguistic assessment.
   */

  let score =
    206.835 -
    1.015 * averageSentenceLength -
    84.6 * averageSyllables;

  score = Math.max(0, Math.min(100, Math.round(score)));

  let level;
  let description;

  if (score >= 80) {
    level = "Easy to read";
    description = "Your text is relatively easy to understand.";
  } else if (score >= 60) {
    level = "Standard";
    description = "Your text has a moderate reading difficulty.";
  } else if (score >= 40) {
    level = "Moderate";
    description = "Consider shorter sentences and simpler wording.";
  } else {
    level = "Complex";
    description = "Consider simplifying sentence structure and vocabulary.";
  }

  return {
    score,
    level,
    description,
    averageSentenceLength: Number(averageSentenceLength.toFixed(1)),
    averageWordLength: Number(averageWordLength.toFixed(1))
  };
}

/* ============================================================
   11. WRITING QUALITY SCORE
   ============================================================ */

function calculateWritingScore(text, issues) {
  const words = countWords(text);

  if (words === 0) return 0;

  const issuesPerHundredWords = (issues.length / words) * 100;

  let score = 100 - issuesPerHundredWords * 12;

  const paragraphs = countParagraphs(text);
  const sentences = countSentences(text);

  if (words > 20 && paragraphs === 1 && sentences > 5) {
    score -= 4;
  }

  if (words > 20 && sentences > 0) {
    const averageLength = words / sentences;

    if (averageLength > 30) score -= 5;
    if (averageLength > 40) score -= 5;
  }

  return Math.max(0, Math.min(100, Math.round(score)));
}

/* ============================================================
   12. SCORE DISPLAY
   ============================================================ */

function updateScoreDisplay(score, readability, issues) {
  const scoreElement = getElement(
    "qualityScore",
    "overallScore",
    "scoreValue"
  );

  setText(scoreElement, score);

  const levelElement = getElement(
    "scoreLevel",
    "qualityLevel"
  );

  if (levelElement) {
    levelElement.textContent =
      score >= 90 ? "Excellent" :
      score >= 75 ? "Good" :
      score >= 55 ? "Needs improvement" :
      "Keep practicing";
  }

  const descriptionElement = getElement(
    "scoreDescription",
    "qualityDescription"
  );

  setText(descriptionElement, readability.description);

  const progress = getElement("scoreProgress");

  if (progress) {
    const circumference = 2 * Math.PI * 66;

    progress.style.strokeDasharray = circumference;
    progress.style.strokeDashoffset =
      circumference * (1 - score / 100);
  }

  const grammarScore = Math.max(
    0,
    100 - issues.filter(i => i.category === "Grammar").length * 12
  );

  const spellingScore = Math.max(
    0,
    100 - issues.filter(i => i.category === "Spelling").length * 15
  );

  const punctuationScore = Math.max(
    0,
    100 - issues.filter(i => i.category === "Punctuation").length * 10
  );

  const readabilityScore = readability.score;

  updateBreakdown("grammarScore", grammarScore);
  updateBreakdown("spellingScore", spellingScore);
  updateBreakdown("punctuationScore", punctuationScore);
  updateBreakdown("readabilityScore", readabilityScore);

  setText(getElement("grammarValue"), grammarScore);
  setText(getElement("spellingValue"), spellingScore);
  setText(getElement("punctuationValue"), punctuationScore);
  setText(getElement("readabilityValue"), readabilityScore);
}

function updateBreakdown(id, value) {
  const element = getElement(id);

  if (!element) return;

  if (element.tagName === "PROGRESS") {
    element.value = value;
    return;
  }

  if (element.tagName === "SPAN" || element.tagName === "DIV") {
    if (element.classList.contains("mini-progress")) {
      const bar = $("span", element);

      if (bar) bar.style.width = `${value}%`;

      return;
    }

    if (element.parentElement?.classList.contains("mini-progress")) {
      element.style.width = `${value}%`;
      return;
    }

    if (element.hasAttribute("data-score-bar")) {
      element.style.width = `${value}%`;
    }
  }
}

/* ============================================================
   13. RENDER GRAMMAR RESULTS
   ============================================================ */

function renderGrammarResults(issues) {
  const container = getElement(
    "resultsList",
    "grammarResults",
    "issuesList"
  );

  const section = getElement(
    "resultsSection",
    "grammarResultsSection"
  );

  const countElement = getElement(
    "resultCount",
    "issuesCount"
  );

  setText(countElement, `${issues.length} issue${issues.length === 1 ? "" : "s"}`);

  if (!container) return;

  if (section) showElement(section);

  if (issues.length === 0) {
    setHTML(
      container,
      `<div class="no-results">
        <strong>Great work!</strong>
        <p>No issues were found by the built-in checks.</p>
        <p>This does not guarantee that every sentence is grammatically correct.</p>
      </div>`
    );

    return;
  }

  container.innerHTML = issues.map((issue, index) => `
    <article class="result-item">
      <div class="result-item-header">
        <span class="result-category">
          ${escapeHTML(issue.category)}
        </span>
        <span class="result-severity">
          ${escapeHTML(issue.severity)}
        </span>
      </div>

      <p><strong>${escapeHTML(issue.title)}</strong></p>

      <p>
        Original:
        <span>${escapeHTML(issue.original)}</span>
      </p>

      <p class="result-explanation">
        ${escapeHTML(issue.explanation)}
      </p>

      <div class="result-suggestion">
        Suggestion: ${escapeHTML(issue.suggestion)}
      </div>

      <button
        type="button"
        class="text-button apply-suggestion"
        data-issue-index="${index}"
      >
        Apply suggestion
      </button>
    </article>
  `).join("");
}

/* ============================================================
   14. BUILD A CORRECTED TEXT
   ============================================================ */

function buildCorrectedText(text, issues) {
  let corrected = text;

  /*
   * Apply replacements from the end toward the beginning.
   * This preserves the indexes of earlier matches.
   */

  const sortedIssues = [...issues].sort(
    (a, b) => b.index - a.index
  );

  sortedIssues.forEach(issue => {
    corrected =
      corrected.slice(0, issue.index) +
      issue.suggestion +
      corrected.slice(issue.index + issue.length);
  });

  return corrected;
}

function applySingleSuggestion(issueIndex) {
  const issue = GrammarGlow.currentResults[issueIndex];

  if (!issue) return;

  const editor = getElement("writingInput", "editorInput", "textInput");

  if (!editor) return;

  const text = editor.value;

  const before = text.slice(0, issue.index);
  const original = text.slice(
    issue.index,
    issue.index + issue.length
  );

  if (original !== issue.original) {
    showToast("The text has changed. Analyze it again.", "error");
    return;
  }

  editor.value =
    before +
    issue.suggestion +
    text.slice(issue.index + issue.length);

  editor.dispatchEvent(new Event("input", { bubbles: true }));

  showToast("Suggestion applied.");
  analyzeText();
}

/* ============================================================
   15. MAIN ANALYSIS FUNCTION
   ============================================================ */

function analyzeText() {
  if (GrammarGlow.isAnalyzing) return;

  const text = getEditorText();

  if (!text.trim()) {
    showToast("Please enter some text first.", "error");

    const editor = getElement("writingInput");

    if (editor) editor.focus();

    return;
  }

  if (text.length > GrammarGlow.maxTextLength) {
    showToast("Please shorten your text before analyzing.", "error");
    return;
  }

  GrammarGlow.isAnalyzing = true;

  const analyzeButton = getElement(
    "analyzeButton",
    "checkGrammarButton",
    "grammarCheckButton"
  );

  const originalButtonText = analyzeButton
    ? analyzeButton.textContent
    : "";

  if (analyzeButton) {
    analyzeButton.disabled = true;
    analyzeButton.textContent = "Analyzing...";
  }

  try {
    const issues = findGrammarIssues(text);
    const readability = calculateReadability(text);
    const score = calculateWritingScore(text, issues);

    GrammarGlow.currentResults = issues;

    GrammarGlow.lastAnalysis = {
      text,
      issues,
      readability,
      score,
      analyzedAt: new Date().toISOString()
    };

    updateScoreDisplay(score, readability, issues);
    renderGrammarResults(issues);
    updateEditorMetrics();

    saveData("lastAnalysis", {
      text,
      issues,
      score,
      readability,
      analyzedAt: GrammarGlow.lastAnalysis.analyzedAt
    });

    addToHistory(text, score, issues.length);

    const output = getElement("correctedOutput");
    const outputWrap = getElement("correctedOutputWrap");

    if (output && outputWrap) {
      output.value = buildCorrectedText(text, issues);
      showElement(outputWrap);
    }

    showToast(
      `Analysis complete. Found ${issues.length} potential issue${issues.length === 1 ? "" : "s"}.`
    );
  } catch (error) {
    console.error("Grammar analysis failed:", error);
    showToast("Analysis failed. Please try again.", "error");
  } finally {
    GrammarGlow.isAnalyzing = false;

    if (analyzeButton) {
      analyzeButton.disabled = false;
      analyzeButton.textContent = originalButtonText || "Analyze Text";
    }
  }
}

/* ============================================================
   16. TONE SELECTION
   ============================================================ */

const WritingTones = {
  professional: {
    label: "Professional",
    replacements: [
      [/\bhey\b/gi, "Hello"],
      [/\bguys\b/gi, "everyone"],
      [/\bkinda\b/gi, "somewhat"],
      [/\bgonna\b/gi, "going to"],
      [/\bwanna\b/gi, "want to"],
      [/\ba lot of\b/gi, "many"]
    ]
  },

  friendly: {
    label: "Friendly",
    replacements: [
      [/\bDear Sir or Madam\b/g, "Hello"],
      [/\bI am writing to inform you\b/gi, "I wanted to let you know"],
      [/\bPlease be advised that\b/gi, "Just so you know"],
      [/\bKindly note that\b/gi, "Please note that"]
    ]
  },

  academic: {
    label: "Academic",
    replacements: [
      [/\bI think\b/gi, "The evidence suggests"],
      [/\ba lot of\b/gi, "numerous"],
      [/\bget\b/gi, "obtain"],
      [/\bbig\b/gi, "significant"],
      [/\bshow\b/gi, "demonstrate"]
    ]
  },

  concise: {
    label: "Concise",
    replacements: [
      [/\bdue to the fact that\b/gi, "because"],
      [/\bat this point in time\b/gi, "now"],
      [/\bin order to\b/gi, "to"],
      [/\bhas the ability to\b/gi, "can"],
      [/\bin the event that\b/gi, "if"],
      [/\bfor the purpose of\b/gi, "for"]
    ]
  },

  casual: {
    label: "Casual",
    replacements: [
      [/\bHello\b/g, "Hi"],
      [/\bI would like to\b/gi, "I'd like to"],
      [/\bdo not\b/gi, "don't"],
      [/\bcannot\b/gi, "can't"],
      [/\bit is\b/gi, "it's"]
    ]
  }
};

function transformTone(text, toneName) {
  const tone = WritingTones[toneName];

  if (!tone) return text;

  let transformed = text;

  tone.replacements.forEach(([pattern, replacement]) => {
    transformed = transformed.replace(pattern, replacement);
  });

  return transformed;
}

function setWritingTone(toneName) {
  if (!WritingTones[toneName]) return;

  GrammarGlow.currentTone = toneName;

  $$(".tone-option").forEach(button => {
    const selected =
      button.dataset.tone === toneName ||
      button.id === `${toneName}Tone`;

    button.classList.toggle("selected", selected);

    button.setAttribute("aria-pressed", String(selected));
  });

  saveData("tone", toneName);

  const note = getElement("toneNote");

  if (note) {
    note.textContent =
      `${WritingTones[toneName].label} tone selected. ` +
      "Choose Rewrite to apply the available style adjustments.";
  }
}

function rewriteWithSelectedTone() {
  const text = getEditorText();

  if (!text.trim()) {
    showToast("Enter text before rewriting.", "error");
    return;
  }

  const rewritten = transformTone(
    text,
    GrammarGlow.currentTone
  );

  const output = getElement("correctedOutput");
  const outputWrap = getElement("correctedOutputWrap");

  if (output) {
    output.value = rewritten;
  }

  showElement(outputWrap);

  showToast(
    `Applied ${WritingTones[GrammarGlow.currentTone].label.toLowerCase()} style adjustments.`
  );
}

/* ============================================================
   17. CLEAR EDITOR
   ============================================================ */

function clearEditor() {
  const editor = getElement("writingInput", "editorInput", "textInput");

  if (!editor) return;

  if (!editor.value.trim()) {
    showToast("The editor is already empty.");
    return;
  }

  const confirmed = window.confirm(
    "Clear the text in the editor?"
  );

  if (!confirmed) return;

  editor.value = "";

  editor.dispatchEvent(new Event("input", { bubbles: true }));

  GrammarGlow.currentResults = [];
  GrammarGlow.lastAnalysis = null;

  const output = getElement("correctedOutput");
  const outputWrap = getElement("correctedOutputWrap");

  if (output) output.value = "";

  hideElement(outputWrap);

  const results = getElement("resultsList", "grammarResults", "issuesList");

  if (results) results.innerHTML = "";

  setText(getElement("resultCount", "issuesCount"), "0 issues");

  updateScoreDisplay(
    0,
    calculateReadability(""),
    []
  );

  showToast("Editor cleared.");
}

/* ============================================================
   18. COPY TEXT
   ============================================================ */

async function copyText(text) {
  if (!text) {
    showToast("There is no text to copy.", "error");
    return;
  }

  try {
    await navigator.clipboard.writeText(text);
    showToast("Text copied to clipboard.");
  } catch (error) {
    const temporary = document.createElement("textarea");

    temporary.value = text;
    temporary.style.position = "fixed";
    temporary.style.opacity = "0";

    document.body.appendChild(temporary);
    temporary.select();

    try {
      const successful = document.execCommand("copy");

      if (successful) {
        showToast("Text copied to clipboard.");
      } else {
        showToast("Copy failed. Please select the text manually.", "error");
      }
    } catch {
      showToast("Copy failed. Please select the text manually.", "error");
    } finally {
      temporary.remove();
    }
  }
}

function copyEditorText() {
  copyText(getEditorText());
}

function copyCorrectedText() {
  const output = getElement("correctedOutput");

  if (output) copyText(output.value);
}

function useCorrectedText() {
  const output = getElement("correctedOutput");

  if (!output || !output.value.trim()) {
    showToast("Analyze or rewrite text first.", "error");
    return;
  }

  setEditorText(output.value);
  showToast("Corrected text moved to the editor.");
}

/* ============================================================
   19. DOWNLOAD TEXT
   ============================================================ */

function downloadTextFile(filename, content) {
  const blob = new Blob([content], {
    type: "text/plain;charset=utf-8"
  });

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = filename;

  document.body.appendChild(link);
  link.click();
  link.remove();

  URL.revokeObjectURL(url);

  showToast("Download started.");
}

function downloadEditorText() {
  const text = getEditorText();

  if (!text.trim()) {
    showToast("There is no text to download.", "error");
    return;
  }

  downloadTextFile("grammarglow-document.txt", text);
}

function downloadCorrectedText() {
  const output = getElement("correctedOutput");

  if (!output || !output.value.trim()) {
    showToast("There is no corrected text to download.", "error");
    return;
  }

  downloadTextFile("grammarglow-corrected.txt", output.value);
}

function printReport() {
  if (!GrammarGlow.lastAnalysis) {
    showToast("Analyze some text before printing.", "error");
    return;
  }

  window.print();
}

/* ============================================================
   20. DARK AND LIGHT THEMES
   ============================================================ */

function setTheme(theme) {
  const light = theme === "light";

  document.body.classList.toggle("light-theme", light);

  const toggle = getElement("themeToggle", "themeButton");

  if (toggle) {
    toggle.setAttribute(
      "aria-label",
      light ? "Switch to dark theme" : "Switch to light theme"
    );

    toggle.setAttribute("aria-pressed", String(light));

    const icon = toggle.querySelector("[data-theme-icon]");

    if (icon) {
      icon.textContent = light ? "☾" : "☼";
    }
  }

  saveData("theme", light ? "light" : "dark");
}

function toggleTheme() {
  const isLight = document.body.classList.contains("light-theme");

  setTheme(isLight ? "dark" : "light");
}

/* ============================================================
   21. DOCUMENT HISTORY
   ============================================================ */

function getHistory() {
  const history = loadData("history", []);

  return Array.isArray(history) ? history : [];
}

function addToHistory(text, score, issueCount) {
  if (!text.trim()) return;

  const item = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    title: text.split(/\s+/).slice(0, 6).join(" ") || "Untitled document",
    text,
    score,
    issueCount,
    savedAt: new Date().toISOString()
  };

  const history = getHistory();

  history.unshift(item);

  saveData(
    "history",
    history.slice(0, GrammarGlow.maxHistory)
  );

  renderHistory();
}

function formatDate(value) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "Unknown date";

  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function renderHistory() {
  const container = getElement("historyList");
  const emptyState = getElement("historyEmpty");

  if (!container) return;

  const history = getHistory();

  if (history.length === 0) {
    container.innerHTML = "";

    if (emptyState) showElement(emptyState);

    return;
  }

  if (emptyState) hideElement(emptyState);

  container.innerHTML = history.map(item => `
    <article class="history-item">
      <div class="history-icon">▤</div>

      <div class="history-item-content">
        <strong>${escapeHTML(item.title)}</strong>
        <small>
          ${escapeHTML(formatDate(item.savedAt))}
          · Score: ${Number(item.score) || 0}
          · ${Number(item.issueCount) || 0} issues
        </small>
      </div>

      <button
        type="button"
        data-history-open="${escapeHTML(item.id)}"
      >
        Open
      </button>

      <button
        type="button"
        data-history-delete="${escapeHTML(item.id)}"
        aria-label="Delete saved document"
      >
        Delete
      </button>
    </article>
  `).join("");
}

function openHistoryItem(id) {
  const item = getHistory().find(entry => entry.id === id);

  if (!item) {
    showToast("Saved document not found.", "error");
    return;
  }

  setEditorText(item.text);

  const editor = getElement("writingInput");

  if (editor) editor.focus();

  showToast("Saved document loaded.");
}

function deleteHistoryItem(id) {
  const history = getHistory().filter(item => item.id !== id);

  saveData("history", history);
  renderHistory();

  showToast("Saved document deleted.");
}

function clearHistory() {
  const history = getHistory();

  if (!history.length) {
    showToast("History is already empty.");
    return;
  }

  if (!window.confirm("Delete all saved document history?")) {
    return;
  }

  saveData("history", []);
  renderHistory();

  showToast("Document history cleared.");
}

/* ============================================================
   22. VOCABULARY BUILDER
   ============================================================ */

const Vocabulary = {
  improve: ["enhance", "strengthen", "refine", "develop"],
  good: ["excellent", "effective", "valuable", "beneficial"],
  bad: ["unhelpful", "ineffective", "harmful", "poor"],
  big: ["substantial", "significant", "enormous", "considerable"],
  small: ["minor", "limited", "compact", "modest"],
  important: ["essential", "significant", "crucial", "valuable"],
  show: ["demonstrate", "illustrate", "indicate", "reveal"],
  make: ["create", "develop", "produce", "construct"],
  get: ["obtain", "receive", "acquire", "achieve"],
  help: ["assist", "support", "enable", "facilitate"],
  use: ["apply", "employ", "utilize", "implement"],
  think: ["consider", "believe", "evaluate", "reflect"],
  tell: ["explain", "describe", "inform", "communicate"],
  say: ["state", "express", "mention", "communicate"],
  fast: ["rapid", "quick", "swift", "efficient"],
  slow: ["gradual", "steady", "unhurried", "measured"],
  smart: ["intelligent", "capable", "knowledgeable", "skilled"],
  happy: ["pleased", "delighted", "cheerful", "satisfied"],
  sad: ["unhappy", "disappointed", "sorrowful", "upset"],
  easy: ["simple", "straightforward", "effortless", "accessible"],
  hard: ["difficult", "challenging", "demanding", "complex"],
  clear: ["understandable", "precise", "explicit", "transparent"],
  problem: ["challenge", "difficulty", "issue", "obstacle"],
  idea: ["concept", "proposal", "approach", "suggestion"],
  change: ["modify", "transform", "adjust", "revise"],
  learn: ["study", "understand", "master", "discover"],
  start: ["begin", "initiate", "launch", "commence"],
  end: ["finish", "complete", "conclude", "finalize"],
  result: ["outcome", "consequence", "finding", "effect"],
  very: ["highly", "extremely", "particularly", "remarkably"],
  nice: ["pleasant", "appealing", "excellent", "enjoyable"],
  many: ["numerous", "several", "multiple", "various"],
  explain: ["clarify", "describe", "illustrate", "elaborate"],
  create: ["develop", "design", "produce", "build"],
  useful: ["practical", "valuable", "beneficial", "effective"],
  important: ["essential", "critical", "significant", "fundamental"],
  beautiful: ["attractive", "elegant", "appealing", "stunning"],
  improve: ["enhance", "refine", "strengthen", "upgrade"],
  example: ["illustration", "instance", "demonstration", "case"],
  communicate: ["convey", "express", "share", "articulate"],
  efficient: ["productive", "effective", "streamlined", "capable"]
};

function searchVocabulary() {
  const input = getElement(
    "vocabularyInput",
    "vocabularySearch",
    "wordSearch"
  );

  const results = getElement(
    "vocabularyResults",
    "wordResults"
  );

  if (!input || !results) return;

  const word = input.value.trim().toLowerCase();

  if (!word) {
    results.innerHTML =
      '<p class="vocabulary-placeholder">Enter a word to discover alternatives.</p>';
    return;
  }

  const matches = Vocabulary[word];

  if (!matches) {
    results.innerHTML =
      `<p>No saved alternatives for "${escapeHTML(word)}". Try words such as "good", "important", or "improve".</p>`;
    return;
  }

  results.innerHTML = matches.map(synonym => `
    <button
      type="button"
      class="word-chip"
      data-vocabulary-word="${escapeHTML(synonym)}"
      title="Click to copy"
    >
      ${escapeHTML(synonym)}
    </button>
  `).join("");
}

/* ============================================================
   23. SAMPLE TEXT
   ============================================================ */

const SampleTexts = {
  grammar: "She don't know how to solve this problem. The result is very very good, and it can help a lot of students.",

  academic: "Technology has become an important part of modern education. It helps students learn new concepts and access information. However, students should use technology responsibly and develop their critical thinking skills.",

  email: "hey sir, im writing to inform you that i cant attend the meeting today due to the fact that i have an important appointment. please let me know if we can schedule it another time.",

  creative: "The morning sunlight entered the quiet room. A gentle breeze moved the curtains, and the world outside slowly came to life. It was the beginning of a new day filled with possibilities."
};

function loadSampleText(type = "grammar") {
  const sample = SampleTexts[type];

  if (!sample) return;

  setEditorText(sample);

  const editor = getElement("writingInput");

  if (editor) editor.focus();

  showToast("Sample text loaded.");
}

/* ============================================================
   24. MOBILE SIDEBAR
   ============================================================ */

function toggleSidebar(force) {
  const sidebar = getElement("sidebar", "appSidebar");

  if (!sidebar) return;

  const shouldOpen =
    typeof force === "boolean"
      ? force
      : !sidebar.classList.contains("sidebar-open");

  sidebar.classList.toggle("sidebar-open", shouldOpen);

  const button = getElement(
    "mobileMenuButton",
    "menuToggle"
  );

  if (button) {
    button.setAttribute("aria-expanded", String(shouldOpen));
  }
}

function closeSidebarOnNavigation() {
  $$(".sidebar-nav a, .sidebar-nav button").forEach(element => {
    element.addEventListener("click", () => {
      if (window.innerWidth <= 760) {
        toggleSidebar(false);
      }
    });
  });
}

/* ============================================================
   25. NAVIGATION
   ============================================================ */

function initializeNavigation() {
  const links = $$(".sidebar-nav a[href^='#']");

  links.forEach(link => {
    link.addEventListener("click", event => {
      const targetId = link.getAttribute("href");

      if (!targetId || targetId === "#") return;

      const target = $(targetId);

      if (!target) return;

      event.preventDefault();

      target.scrollIntoView({
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "auto"
          : "smooth",
        block: "start"
      });

      links.forEach(item => {
        item.classList.toggle("active", item === link);
      });

      if (history.replaceState) {
        history.replaceState(null, "", targetId);
      }
    });
  });
}

/* ============================================================
   26. TOOL CARDS
   ============================================================ */

function openTool(toolName) {
  const editor = getElement("writingInput");

  switch (toolName) {
    case "grammar":
      editor?.focus();
      showToast("Write or paste text, then analyze it.");
      break;

    case "rewrite":
    case "tone":
      rewriteWithSelectedTone();
      break;

    case "vocabulary":
      getElement("vocabularyInput")?.focus();
      getElement("vocabularySection")?.scrollIntoView({
        behavior: "smooth"
      });
      break;

    case "readability":
      if (!getEditorText().trim()) {
        showToast("Enter text to calculate readability.", "error");
      } else {
        const result = calculateReadability(getEditorText());

        showToast(
          `Readability: ${result.score}/100 — ${result.level}`
        );
      }
      break;

    case "history":
      getElement("historySection")?.scrollIntoView({
        behavior: "smooth"
      });
      break;

    case "download":
      downloadEditorText();
      break;

    default:
      showToast("This tool is not available yet.", "error");
  }
}

/* ============================================================
   27. KEYBOARD SHORTCUTS
   ============================================================ */

function initializeKeyboardShortcuts() {
  document.addEventListener("keydown", event => {
    const modifier = event.ctrlKey || event.metaKey;

    if (!modifier) return;

    const key = event.key.toLowerCase();

    if (key === "enter") {
      event.preventDefault();
      analyzeText();
    }

    if (key === "s") {
      event.preventDefault();
      autoSaveEditor();

      showToast("Draft save requested.");
    }

    if (key === "shift" || event.shiftKey) {
      return;
    }

    if (key === "l" && event.altKey) {
      event.preventDefault();
      toggleTheme();
    }
  });
}

/* ============================================================
   28. ACCESSIBILITY
   ============================================================ */

function initializeAccessibility() {
  const editor = getElement("writingInput");

  if (editor && !editor.getAttribute("aria-label")) {
    editor.setAttribute(
      "aria-label",
      "Enter the text you want to check"
    );
  }

  const output = getElement("correctedOutput");

  if (output && !output.getAttribute("aria-label")) {
    output.setAttribute(
      "aria-label",
      "Corrected or rewritten text"
    );
  }

  const analyzeButton = getElement("analyzeButton");

  if (analyzeButton && !analyzeButton.getAttribute("type")) {
    analyzeButton.type = "button";
  }
}

/* ============================================================
   29. EVENT LISTENERS
   ============================================================ */

function bindClick(ids, callback) {
  ids.forEach(id => {
    const element = document.getElementById(id);

    if (element) {
      element.addEventListener("click", callback);
    }
  });
}

function initializeEditorEvents() {
  const editor = getElement("writingInput", "editorInput", "textInput");

  if (!editor) {
    console.warn(
      "GrammarGlow: No editor found. Check the writingInput ID in index.html."
    );
    return;
  }

  editor.addEventListener("input", () => {
    updateEditorMetrics();
    autoSaveEditor();
  });

  editor.addEventListener("paste", () => {
    window.setTimeout(updateEditorMetrics, 0);
  });

  bindClick(
    ["analyzeButton", "checkGrammarButton", "grammarCheckButton"],
    analyzeText
  );

  bindClick(["clearButton", "clearTextButton"], clearEditor);

  bindClick(["copyButton", "copyTextButton"], copyEditorText);

  bindClick(["downloadButton", "downloadTextButton"], downloadEditorText);

  bindClick(["copyCorrectedButton"], copyCorrectedText);

  bindClick(["useCorrectedButton"], useCorrectedText);

  bindClick(["downloadCorrectedButton"], downloadCorrectedText);

  bindClick(["rewriteButton", "applyToneButton"], rewriteWithSelectedTone);

  bindClick(["themeToggle", "themeButton"], toggleTheme);

  bindClick(["mobileMenuButton", "menuToggle"], () => {
    toggleSidebar();
  });

  bindClick(["historyClearButton"], clearHistory);

  bindClick(["printButton"], printReport);

  bindClick(["sampleButton"], () => loadSampleText("grammar"));

  bindClick(["sampleAcademicButton"], () => loadSampleText("academic"));

  bindClick(["sampleEmailButton"], () => loadSampleText("email"));

  bindClick(["vocabularySearchButton"], searchVocabulary);

  const vocabularyInput = getElement(
    "vocabularyInput",
    "vocabularySearch",
    "wordSearch"
  );

  if (vocabularyInput) {
    vocabularyInput.addEventListener("keydown", event => {
      if (event.key === "Enter") {
        event.preventDefault();
        searchVocabulary();
      }
    });
  }

  const vocabularyResults = getElement(
    "vocabularyResults",
    "wordResults"
  );

  if (vocabularyResults) {
    vocabularyResults.addEventListener("click", event => {
      const button = event.target.closest("[data-vocabulary-word]");

      if (!button) return;

      copyText(button.dataset.vocabularyWord);
    });
  }

  const resultsContainer = getElement(
    "resultsList",
    "grammarResults",
    "issuesList"
  );

  if (resultsContainer) {
    resultsContainer.addEventListener("click", event => {
      const button = event.target.closest(".apply-suggestion");

      if (!button) return;

      applySingleSuggestion(
        Number(button.dataset.issueIndex)
      );
    });
  }

  const historyContainer = getElement("historyList");

  if (historyContainer) {
    historyContainer.addEventListener("click", event => {
      const openButton = event.target.closest("[data-history-open]");
      const deleteButton = event.target.closest("[data-history-delete]");

      if (openButton) {
        openHistoryItem(openButton.dataset.historyOpen);
      }

      if (deleteButton) {
        deleteHistoryItem(deleteButton.dataset.historyDelete);
      }
    });
  }

  $$(".tone-option").forEach(button => {
    button.addEventListener("click", () => {
      const tone =
        button.dataset.tone ||
        button.id.replace(/Tone$/, "");

      setWritingTone(tone);
    });
  });

  $$("[data-sample]").forEach(button => {
    button.addEventListener("click", () => {
      loadSampleText(button.dataset.sample);
    });
  });

  $$("[data-tool]").forEach(button => {
    button.addEventListener("click", () => {
      openTool(button.dataset.tool);
    });
  });

  $$("[data-action]").forEach(button => {
    button.addEventListener("click", () => {
      switch (button.dataset.action) {
        case "analyze":
          analyzeText();
          break;

        case "clear":
          clearEditor();
          break;

        case "copy":
          copyEditorText();
          break;

        case "download":
          downloadEditorText();
          break;

        case "theme":
          toggleTheme();
          break;

        case "rewrite":
          rewriteWithSelectedTone();
          break;

        case "copy-corrected":
          copyCorrectedText();
          break;

        case "use-corrected":
          useCorrectedText();
          break;

        default:
          console.warn(
            "Unknown GrammarGlow action:",
            button.dataset.action
          );
      }
    });
  });
}

/* ============================================================
   30. INITIALIZE APPLICATION
   ============================================================ */

function initializeGrammarGlow() {
  if (GrammarGlow.initialized) return;

  GrammarGlow.initialized = true;

  initializeAccessibility();
  initializeEditorEvents();
  initializeNavigation();
  initializeKeyboardShortcuts();
  closeSidebarOnNavigation();

  restoreDraft();
  updateEditorMetrics();
  renderHistory();

  const savedTheme = loadData("theme", "dark");

  setTheme(savedTheme === "light" ? "light" : "dark");

  const savedTone = loadData(
    "tone",
    GrammarGlow.defaultTone
  );

  setWritingTone(
    WritingTones[savedTone]
      ? savedTone
      : GrammarGlow.defaultTone
  );

  const savedAnalysis = loadData("lastAnalysis");

  if (savedAnalysis && savedAnalysis.text) {
    const editor = getElement("writingInput");

    if (editor && !editor.value.trim()) {
      editor.value = savedAnalysis.text;
      updateEditorMetrics();
    }
  }

  console.info(
    `${GrammarGlow.name} v${GrammarGlow.version} initialized.`
  );
}

if (document.readyState === "loading") {
  document.addEventListener(
    "DOMContentLoaded",
    initializeGrammarGlow,
    { once: true }
  );
} else {
  initializeGrammarGlow();
}

/* ============================================================
   31. PUBLIC FUNCTIONS
   Useful for HTML buttons that use onclick attributes.
   ============================================================ */

window.GrammarGlowApp = {
  analyze: analyzeText,
  clear: clearEditor,
  copy: copyEditorText,
  copyCorrected: copyCorrectedText,
  useCorrected: useCorrectedText,
  download: downloadEditorText,
  downloadCorrected: downloadCorrectedText,
  toggleTheme,
  setTheme,
  setTone: setWritingTone,
  rewrite: rewriteWithSelectedTone,
  loadSample: loadSampleText,
  searchVocabulary,
  calculateReadability,
  countWords,
  countSentences,
  getHistory,
  clearHistory,
  showToast
};
