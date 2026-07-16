// The six real projects, kept as structured data so the scene can render
// them however it likes (and so they survive any scene redesign without
// being re-typed). Order here is the order they march past the camera.
//
// Each project also carries a heraldic `flag` color: in the caravan scene a
// cart or banner-bearer flying that color is the cue that this project's
// panel is about to come up.

export const PROJECTS = [
  {
    id: 'crossbot',
    title: 'CrossBot',
    flag: '#b23a34', // crimson
    tag: null,
    links: [{ label: 'GitHub', href: 'https://github.com/Betts6430/CrossBot' }],
    stack: 'Manifest V3 · WXT · Python · FastAPI · Ollama',
    blurb:
      'A free, personal tool that solves and autocompletes crosswords in ' +
      'your browser. Open a puzzle on a supported site, or type one in by ' +
      'hand, hit Solve, and CrossBot fills the grid.',
    bullets: [
      'A browser extension (Manifest V3, built with WXT) reads the puzzle ' +
        'off the page and overlays the answers.',
      'A small Python FastAPI server runs locally and does the actual ' +
        'solving: no paid APIs, no hosting, it stays free.',
      'A clue-answer database handles clues that have appeared before; a ' +
        'scored word list and constraint solver fill the rest while keeping ' +
        'every crossing letter consistent.',
      'An optional, off-by-default LLM booster (local via Ollama, or your ' +
        'own key) tackles leftover novel clues.',
    ],
  },
  {
    id: 'apartmentfinder',
    title: 'ApartmentFinder',
    flag: '#2f5a8c', // blue
    tag: null,
    links: [{ label: 'GitHub', href: 'https://github.com/Betts6430/ApartmentFinder' }],
    stack: 'Python · Web scraping · Transit-time ranking · Email alerts',
    blurb:
      'An Edmonton-focused rental aggregator. It scrapes RentFaster, ' +
      'Zumper, Rentals.ca, Kijiji, and RentCanada on demand, dedupes ' +
      'listings across sources, applies your filters, and ranks what survives.',
    bullets: [
      'Three rankings over the cross-source pool: Best Value, Best Location, ' +
        'and Nicest Places.',
      'Optional commute-time filter and ranking to any landmark, like the ' +
        'University of Alberta.',
      'Grid, list, and map views with pagination, plus a contact button ' +
        'with a pre-drafted text where a number is available.',
      'Saved listings and saved searches with new-match counts, "new" ' +
        'badges, and price-drop tracking.',
      'Email alerts when a saved search gets new matches.',
      'Per-source scraper health monitoring that flags a source that ' +
        'silently breaks.',
    ],
  },
  {
    id: 'baymax',
    title: 'Baymax',
    flag: '#3f7a4a', // green
    tag: null,
    links: [],
    stack: 'ROS 2 Jazzy · Python · Computer vision · Robotic arm control',
    blurb:
      'An autonomous medication delivery robot, built as a university club ' +
      'project on ROS 2 Jazzy. It integrates autonomous navigation, computer ' +
      'vision, robotic arm control, and automated pill dispensing, backed by ' +
      'a voice-logged prescription database.',
    bullets: [
      'The architecture decouples the four subsystems through a shared ' +
        'interface contract (baymax_interfaces), which lets separate teams ' +
        'build in parallel.',
      'Workspace setup and interface definitions are complete; core ' +
        'subsystem implementation (navigation, vision, arm control) is in ' +
        'progress.',
      'Built in Python on ROS 2 for modularity and ease of iteration.',
    ],
  },
  {
    id: 'autocard',
    title: 'AutoCard Dealer',
    flag: '#6a3f7a', // purple
    tag: null,
    links: [],
    stack: 'Mechanical design · Mechatronics · Embedded control',
    blurb:
      'An automatic card shuffling and dealing robot for Texas Hold’em, ' +
      'designed to sit in the centre of a poker table.',
    bullets: [
      'A rotating base indexes between seating positions.',
      'Rubber traction wheels feed cards into a central shuffling chamber.',
      'A controlled ejection mechanism deals at calibrated spin rates and ' +
        'velocities, so every card lands consistently and accurately at each ' +
        'seat.',
    ],
  },
  {
    id: 'focusboost',
    title: 'FocusBoost',
    flag: '#c8892f', // amber
    tag: 'natHACKS 2024',
    links: [{ label: 'GitHub', href: 'https://github.com/daksh3333/Neuro-Stress-Monitor' }],
    stack: 'BioAmp EXG Pill · Arduino · Electron · Signal filtering',
    blurb:
      'A real-time focus detector: a BioAmp EXG Pill and an Arduino capture ' +
      'brain signals, and an Electron app watches your focus level live and ' +
      'nudges you when it slips, for example while watching one YouTube short ' +
      'too many.',
    bullets: [
      'Detects brain waves with the BioAmp EXG Pill.',
      'Filters the raw EXG signal into the brain-wave frequency region ' +
        '(0 to 50 Hz).',
      'Fires a notification when the filtered signal exits the beta range ' +
        '(14 to 40 Hz), the band associated with active focus.',
      'Sound alerts for real-time focus warnings.',
    ],
  },
  {
    id: 'formulasheethub',
    title: 'Formula Sheet Hub',
    flag: '#2f7a7a', // teal
    tag: 'HackED 2025',
    links: [{ label: 'GitHub', href: 'https://github.com/Betts6430/formula-sheet-hub' }],
    stack: 'Python · LaTeX rendering · Full-stack web',
    blurb:
      'A full-stack web app for creating and sharing formula sheets across ' +
      'university courses. A Python backend parses submitted formulas and ' +
      'renders them into clean, LaTeX-formatted sheets, with a live preview ' +
      'as you type.',
    bullets: [
      'A metadata system (university, course, subject, topic) makes the ' +
        'sheet database searchable.',
      'Social features keep the good sheets circulating: likes, favorites, ' +
        'and a home feed of trending sheets, your own sheets, and ' +
        'recommendations based on your interests.',
    ],
  },
];
