# EtymoBreak AI - Requirements

## Overview
EtymoBreak AI is a mobile-friendly single-page web application for exploring English word roots, prefixes, suffixes, and word families. A user can enter a word to see its breakdown, or enter a root to discover related words built from that root.

## Suggested Tech Stack
- Frontend: Angular SPA
- Backend: FastAPI
- API style: JSON over HTTP
- UI behavior: client-side routing or panel switching within a single-page experience
- AI provider: Google Gemini for word breakdowns, root/prefix/suffix analysis, and related word generation

## Goals
- Help users understand how words are formed.
- Show clear word breakdowns with meanings.
- Return related words for a chosen root, prefix, or suffix.
- Make the experience fast, simple, and easy to use on mobile.

## Core Features
1. Word Breakdown
   - User enters a word such as `cardiology`.
   - System identifies parts like root, prefix, and suffix.
   - System shows literal meaning and actual meaning.
   - UI Navigation: home search bar -> result panel within the same page -> breakdown section.
   - Interactions: type word, submit search, tap sections to expand/collapse if needed.
   - Flow: input word -> analyze -> show split parts -> show meaning -> show related words.
   - Design: prominent search bar at the top, result area below with a strong title, segmented breakdown cards for each part, and a clean definition block. Use subtle visual highlighting for root, prefix, and suffix chips. Keep the layout stacked on mobile and split into two columns only on larger screens.

2. Root Word Search
   - User enters a root such as `arch`.
   - System returns related words such as `monarch`, `patriarch`, `matriarch`, `archangel`, and `architect`.
   - Each result includes breakdown and meaning.
   - UI Navigation: home search bar -> root results panel within the same page -> related words list/table.
   - Interactions: type root, submit search, tap a related word to open its breakdown.
   - Flow: enter root -> fetch word family -> display ranked related words -> allow drill-down into any word.
   - Design: treat the root as the hero element, then show a compact meaning panel and a dense table or card list of related words. Use bold word labels, lighter meaning text, and clear row separation. On mobile, present the results as stacked cards instead of a wide table.

3. Affix Exploration
   - User can search by prefix or suffix.
   - System shows other words that use the same affix.
   - UI Navigation: search bar or affix quick filter -> affix detail panel within the same page -> word family results.
   - Interactions: select prefix/suffix mode, enter affix, switch between prefix and suffix tabs.
   - Flow: choose affix type -> enter affix -> show meaning -> show examples -> allow opening each example word.
   - Design: use a two-state toggle or tab control for prefix and suffix, with the selected state visually obvious. Show the affix meaning in a highlighted callout, then render examples in compact cards or a list with enough spacing for scanability. Keep the visual style consistent with the word breakdown view so the app feels like one system.

4. Search Experience
   - Single search input for all lookups.
   - Suggestions or autocomplete for common roots and affixes.
   - Support for partial matches where useful.
   - UI Navigation: persistent top search bar on the single page, visible across all states.
   - Interactions: live suggestions, search on enter or button tap, clear input, select suggestion.
   - Flow: user starts typing -> app suggests matches -> user selects or submits -> app routes to the right result view.
   - Design: make the search bar the most visually dominant control on the screen, with a clear action button and an unobtrusive clear icon. Suggestions should appear as a lightweight dropdown or sheet with no heavy borders, and should remain easy to tap on small screens.

5. Result Display
   - Show the main word at the top.
   - Show a breakdown section.
   - Show related words in a readable table or list.
   - Keep layout responsive for mobile and desktop.
   - UI Navigation: word detail section with tabs or anchored panels inside the SPA.
   - Interactions: scroll between sections, tap tabs/chips, expand definitions, copy/share word if added later.
   - Flow: display primary meaning first -> reveal breakdown -> list related words -> support deep navigation into any related word.
   - Design: use a clear visual hierarchy with the word title first, then a short summary, then secondary sections separated by spacing rather than heavy borders. Tabs or section chips should look touch-friendly and active states should be unmistakable. Related words should read like a structured reference list, not a marketing card grid.

## Application Structure
- Angular handles the full UI experience in one app shell.
- FastAPI exposes endpoints for word lookup, breakdown, related-word search, and future AI explanations.
- FastAPI calls Google Gemini to generate the breakdown and word-family results from the user's input.
- The frontend calls the backend asynchronously and updates the visible content without full page reloads.
- Use modular components for search, breakdown view, related words list, and affix explorer.

## AI Behavior
- For a user-entered word, Gemini should return a structured breakdown with root, prefix, suffix, meaning, and related words.
- For a user-entered root, prefix, or suffix, Gemini should return a list of related words with short meanings.
- The API response should be normalized so the frontend can render it consistently across all search types.
- The app should handle cases where Gemini returns uncertain or partial analysis by showing a clear fallback message.

## Content Requirements
- Root or affix name
- Word parts breakdown
- Meaning of each part
- Literal meaning of the full word
- Actual meaning of the full word
- Related words using the same root/affix

## Non-Functional Requirements
- Mobile-first responsive UI
- Fast search response
- Clean, readable typography
- Simple navigation and minimal user effort
- Easy to expand with more word data later

## Nice-to-Have Features
- Favorites or saved words
- Search history
- Daily word challenge or quiz
- AI-generated explanations in simple language
- Pronunciation help

## Success Criteria
- A user can enter a word and get a useful breakdown.
- A user can enter a root and see related words.
- The app is easy to use on a phone without zooming or horizontal scrolling.
