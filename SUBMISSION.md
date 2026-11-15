# Live Lifesaver: NASA Space Apps 2026 submission draft

Challenge: **Create Health Monitoring Software for Astronauts on Space Missions**
Local event: Nigde
Live app: https://mastergodgamer13.github.io/live-lifesaver/
Code: https://github.com/mastergodgamer13/live-lifesaver

(Fill in team name, members and demo video link yourselves. Everything below is written in English as the rules require.)

---

## 1. Short summary (for the "Summary" field)

Live Lifesaver is a self-check app for astronauts on long missions. In a few minutes a crew member answers one short question per screen (vital signs, symptoms, red flags and optional blood tests) and gets a green, yellow or red status for ten body regions, plus simple things they can do themselves. Each person is compared with their own baseline, and every lab value can be shown next to the real ranges measured in the Inspiration4 crew, read from NASA's Open Science Data Repository (OSDR). It runs in the browser, works offline, and is available in 9 languages. It never gives a diagnosis.

## 2. What it does (for the "Detailed description" field)

**The problem.** On a long mission the medical team is far away and communication is delayed. Astronauts need a quick, structured way to notice that something is changing before it becomes serious, and flight surgeons need clear data about each person's trend.

**The solution.**
- **Guided check-up.** 51 slides, one question each: 26 vital signs, 9 symptoms, 2 red-flag questions (including a radiation-alarm yes/no) and 14 optional lab values, including six cytokines (IL-6, TNF-α, IL-8, IL-10, MCP-1, VEGF-A). After each answer the app shows the status, what to do, and what the crew measured.
- **Own baseline.** Values without a fixed normal range (for example cytokines) are judged against the person's own usual value. Missing data is never shown as "fine": it is grey and counted separately.
- **Readiness ring and body map.** Ten regions (brain, immune, heart, lungs, metabolism, kidneys, digestion, whole body, bones and muscle) light up together on a ring and a body map. Status is also shown with symbols and outline patterns, not only colour.
- **Real NASA data.** Reads OSDR live: OSD-575 (Inspiration4 serum metabolic panel and immune panel) and OSD-569 (Inspiration4 complete blood count), and shows each crew member's pre-flight and post-flight values. OSD-635 (human cells flown on the ISS) is shown as a study example. A catalog tab searches the OSDR for other human spaceflight studies.
- **Crew and reviewer tools.** Compare users, a "who needs a look first" list, and a reviewer view that lists every threshold so a flight surgeon can check it.
- **Built for the real setting.** Plain static website with no backend, works offline, installable, reminders, printable report, 9 languages (English, Turkish, Italian, Spanish, French, German, Russian, Japanese, Chinese), text size and high-contrast settings, night mode.

**Honest limits.** All zones, the 2× cytokine cut-off and every wording are prototype values that a flight surgeon must review. It is not a medical device and gives no diagnosis or treatment advice. Translations are machine-assisted drafts for native review. Bone density cannot be measured by the app and is only judged indirectly.

**Why it is different.** Most health apps are built for consumers and compare you with a population. This one is built for crews: it compares each person with themselves, grounds every lab in what real astronauts measured in NASA data, never hides missing data, and works with no internet.

## 3. How we built it

Vanilla JavaScript, HTML and CSS with no framework or build step. Health logic is in one tested module; 20 automated test files check the engine, the 9 translations, storage and the NASA data parsers. NASA data is read from the OSDR API in the browser, with an optional small Cloudflare Worker relay when the browser blocks cross-origin requests; verified copies of the data are bundled as a fallback.

## 4. References (paste into the "References" field)

Data and NASA resources
- NASA Open Science Data Repository (OSDR): https://osdr.nasa.gov (API: /osdr/data/search, /osdr/data/osd/meta/{id})
- OSD-575: Inspiration4 crew serum metabolic panel and immune (Eve) panel
- OSD-569: Inspiration4 crew whole blood, complete blood count
- OSD-635: human aortic smooth muscle cells, ISS SpaceX-17 (Space Flight vs Ground Control)
- NASA Space Apps Challenge 2026 challenge statement: Create Health Monitoring Software for Astronauts on Space Missions

Code, tools and services
- Vanilla JavaScript, no third-party runtime libraries
- GitHub and GitHub Pages (hosting)
- Cloudflare Workers (optional relay, our own code in the `worker` folder)
- Playwright and Google Chrome headless (testing only)
- Fonts: system fonts only, no external font files

Images and sound
- The body map, icons, ring and background are drawn by our own code (SVG, canvas and CSS). No outside images, music or text are used.

AI assistance
- We used Claude (Anthropic) as an AI coding and writing assistant during development, including code, tests, translations and documentation. The team directed the work, reviewed the results, and a flight surgeon and native speakers reviewed earlier versions.

## 5. Demo video script (about 2 minutes 30 seconds)

1. **0:00 Hook (15 s).** "On a long mission the doctor is far away. Live Lifesaver lets an astronaut check their own health in minutes." Show the dashboard ring.
2. **0:15 Intro and demo (20 s).** Open the app, show the three-step welcome, press "Try the demo astronaut".
3. **0:35 One slide (30 s).** Show a heart-rate slide: big number, +/- buttons, green status, what to do, what real crew measured. Then show a yellow and a red answer.
4. **1:05 Real NASA data (30 s).** Open a lab slide with the Inspiration4 crew range chart. Say it is read live from NASA OSDR (OSD-575 and OSD-569). Show a cytokine slide and the "your own usual" idea.
5. **1:35 Result (25 s).** Show the readiness report: ring, "Do this first", print button.
6. **2:00 Dashboard (15 s).** Show the body map and ring linked together, and a phone-size view.
7. **2:15 Close (15 s).** "No backend, works offline, 9 languages, never a diagnosis. Next step: flight-surgeon review of every threshold." Show the live link.

Record in a quiet room, keep the text large (Display menu, "Large text"), and add English subtitles if you speak another language.

## 6. Last-hour checklist

- [ ] Challenge chosen from the official list (not "Create Your Own Challenge")
- [ ] All team members registered, on the Members tab, 1 to 6 people
- [ ] Every required field on the Project page is filled in
- [ ] Page and linked materials in English
- [ ] References field filled in (section 4)
- [ ] Both checkboxes ticked (submission guide, terms and privacy)
- [ ] Demo video link works when opened logged out
- [ ] Live link opens on a phone
- [ ] Submit before 11:59 PM Nigde time today
