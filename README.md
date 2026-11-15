# Live Lifesaver

Continuation of *Astronot Self Check* (NASA Space Apps 2026). Goal of this repository: instead of adding each NASA dataset by hand, read the NASA OSDR catalog live and make every human spaceflight health dataset reachable from the app. Everything below is the base that was imported from the first project.

## Guided check-up and guided demo (new)

The **Guided check-up** tab (now the first tab) asks 15 questions, one per slide: 7 vitals (heart rate, systolic/diastolic pressure, glucose, temperature, sleep, mood), 4 symptoms (tiredness, dizziness/headache, vision change, muscle/bone pain; none/mild/moderate/severe), one red-flag question (chest pain, trouble breathing, fainting, confusion) and 3 optional blood values (white blood cells, neutrophils, lymphocytes). After each answer: a green/yellow/red status from the prototype reference zones, the zone limits, **what you can do yourself** (general self-care steps: rest, breathing, re-measuring, fluids, sleep schedule, exercise from the mission plan, telling the crew...), and, for glucose and the blood values, what the four real crew members measured (OSD-575 and OSD-569, descriptive only). Red always starts with "contact the flight surgeon or ground medical team now"; there are **no medicines and no doses**. The result slide lists everything, problems first, and can save the vitals as today's check-in (a default user is created if none exists). Missing answers are "no data", never green. Code: `js/checkup.js` (pure, `tests/checkup.test.js`), slides in `js/views.js`.

**Guided demo astronaut:** a fictional astronaut with made-up answers (mostly green, five yellow, one red) walks through the same slides; demo answers are never saved. The old simulated 30-day dashboard toggle was removed (the guided demo replaces it; `Demo.generate` stays for tests). Everything in the demo is fictional and labelled so.

**Not built yet:** loading crew values live from NASA's data files (the slides use the verified copies of OSD-569/OSD-575 bundled in the app; live file loading needs the relay update), and every wording of the zones and actions still needs flight-surgeon review.

## Bone and muscle indicator (new)

The Bones & muscle region now has two daily indicators: **exercise minutes** (zones: green from 60 min, yellow below; never red, because rest days are normal; NASA says crews average about two hours a day, scheduled 2.5 h six days a week) and **grip strength** (kg; no fixed zones because normal depends on sex, age and device, so it is judged only against your own first 7 readings). Both are in the daily check-in and the guided check-up (exercise) and feed the region chip and the overall counts (12 indicators). Bone density itself cannot be measured at home; these are indirect signs. Prototype values, to be reviewed by a flight surgeon.

## Live NASA catalog (new)

The **Live NASA catalog** tab calls the NASA OSDR API (`https://osdr.nasa.gov/osdr/data/search`, `/osdr/data/osd/meta/{id}`) from the browser: a connection check that reports what NASA answered, a search (human studies only by default) and a list of studies with keyword topic labels (blood, immune, metabolism, heart, bone/muscle, ...) and a link to each study. Code: `js/live.js` (pure, network injected, tests in `tests/live.test.js`). The response layout is read defensively and an unrecognised layout is reported, never guessed. Each study has a **Details** button: description, measurements, factors and the study's file list, with table files (csv/tsv/txt/xlsx) marked ▦. Not yet built: loading those tables and turning them into charts automatically.

## Live proxy (only if the browser blocks NASA)

If **Check connection** says the browser blocked the request, NASA's server does not allow web pages to read its answers directly (CORS). Fix with a free Cloudflare Worker that relays read-only requests: (1) cloudflare.com → sign up (free) → Workers & Pages → Create → Worker; (2) open the editor, replace the code with the contents of `worker/osdr-proxy.js`, Deploy; (3) copy the address it gives (`https://<name>.<you>.workers.dev`) into the **Relay address** field of the Live NASA catalog tab. The Worker only relays GET requests under `/osdr/` and `/biodata/` and stores nothing.

# Base project: Astronot Self Check

Prototype for the **NASA Space Apps Challenge 2026** challenge *"Software for Astronauts on Space Missions"* (health monitoring).

> **Prototype, not a medical device.** Nothing in this app is a diagnosis or treatment advice.

## What it does (implemented)

- Daily check-in for 7 indicators: resting heart rate, systolic/diastolic pressure, blood glucose, body temperature, sleep duration, mood (1–5 self-rating).
- Compares recent readings with the user's **own baseline** (first 7 readings) and shows one of four statuses: *Usual*, *Watch*, *Attention*, *No data*.
- **Missing data is never shown as "fine"**: indicators without enough data are grey and counted separately.
- Clickable body map + region list (keyboard accessible), trend charts with baseline band, "why it matters" and "how to measure" notes.
- Data comes from **My users** only (stored in the browser's localStorage); the guided demo astronaut is never saved.
- **Users:** add a user, select them, enter their values (up to 12 users; entries are per user).
- **Compare users:** latest value and status per person plus an overlay chart. Each status compares a person with their *own* baseline; differences between people are not a health judgment.
- **Pre-flight vs post-flight (dashboard):** for each of the four OSD-575 crew members, post-flight values (R+1, R+45, R+82, R+194) are shown next to that person's own pre-flight values (L-92, L-44, L-3): pre-flight mean and range, change from the mean, and whether a value is outside the person's own pre-flight range or the laboratory range. Descriptive only, no status labels, no statistics.
- **Pre-/post-flight input (dashboard, under the daily check-in):** for the selected user, type laboratory values (glucose, potassium, sodium, albumin) for one of the dataset's time points (L-92, L-44, L-3 = pre-flight; R+1, R+45, R+82, R+194 = post-flight). Dataset rules: one record per time point, values rounded to the dataset's decimals, lab range as printed in the dataset (used only for ▼/▲ flags, never to reject a value). A table shows the pre-flight mean, change of each post-flight value from it, and whether it is outside the person's own pre-flight range. Stored only in this browser; descriptive, not a diagnosis.
- **Real data (NASA OSDR):** study OSD-575 (SpaceX Inspiration4, four crew members, serum metabolic panel: glucose, potassium, sodium, albumin) shown descriptively. Values copied unchanged from the published file; the reference ranges are the laboratory's, as printed in the file. The tab also shows, per crew member, post-flight values against that person's own pre-flight values (same table as the dashboard section). Four people only: no statistics, no prediction, no conclusions.
- **Real data (NASA OSDR) — OSD-635:** study design and 6 samples (3 Space Flight + 3 Ground Control human aortic smooth muscle cells, ISS SpaceX-17) and the **gene results** of the published differential-expression file (22,253 genes): fold change (`2^log2FC`) and a class per gene (Upregulated / Downregulated / significant but below the fold-change cut-off / not significant), with cut-offs adjusted p-value ≤ 0.05 and |log2FC| ≥ 1.5. Selected genes, search, strongest increases/decreases. A **volcano plot** of all genes (log2FC against −log10 adjusted p, cut-offs dashed, coloured by class, drawn on a canvas). Cell culture samples, 3 vs 3: descriptive, no claim about astronaut health. The gene table (about 2 MB) loads only when the Real data tab is opened.
- **Real data (NASA OSDR) — OSD-569:** whole blood of the same four Inspiration4 crew members (7 time points). (1) **Complete blood count**, pre-flight vs post-flight per crew member (8 analytes: white/red cells, hemoglobin, hematocrit, platelets, MCV, absolute neutrophils and lymphocytes), against each person's own pre-flight mean, with the laboratory ranges printed per row in the file (they differ by sex). One row of the source file (C003, L-92) is shifted, so three of its values are left empty and listed on screen. (2) **Gene results** of the direct RNA-seq file: class counts (up / down / below fold-change cut-off / not significant / insufficient data) for 13 comparisons and two methods (DESeq2, pipeline-transcriptome-de), cut-offs adjusted p ≤ 0.05 and |log2FC| ≥ 1.5, and the 11 genes that pass both in the main comparison (Ensembl IDs only; the file has no gene names). Four people: descriptive, not statistics, not a diagnosis. **Immune cells form** (white blood cells, neutrophils, lymphocytes; same time points as OSD-569): your own values appear on the dashboard and in the Immune system region as descriptive numbers (own pre-flight mean/range, change, ▼/▲ against the OSD-569 lab range). They never create a status label, so the region chip stays “no data”. The **Immune system** region of the body map also shows the same white blood cell, neutrophil and lymphocyte data as clearly labelled reference data from the crew; it never changes the region's own status (still “no data”, since you cannot enter immune measurements). **Graphics:** a line chart per CBC analyte (one line per crew member, lab range(s) shaded) and diverging bars of up/down gene counts per comparison with a method picker.
- Plain static site: no backend, no dependencies, works offline.

## Live site

https://mastergodgamer13.github.io/nasahealthmontoringsoftware/ (GitHub Pages, served from the repository root of `main`).

## Run it

Open `index.html` in a browser, or serve the folder:

```bash
python3 -m http.server 8000   # then open http://localhost:8000
```

## Tests

```bash
node tests/core.test.js       # no dependencies
node tests/i18n.test.js       # translation completeness
node tests/store.test.js      # users and entries
node tests/osdr.test.js       # real-data module (OSD-575)
node tests/osd635.test.js     # OSD-635 study information and gene results
node tests/osd569.test.js     # OSD-569 blood count and gene-result counts
node tests/immune.test.js     # own immune-cell values (form rules, summary, storage)
node tests/expression.test.js # fold change and gene classification
```

Covers baseline/deviation logic, edge cases (too few readings, zero variance, missing values), input validation and the simulated scenario.

## Languages
English, Türkçe, Italiano, Español (selector in the header; choice saved in this browser; default from browser language).
Translations are machine-assisted drafts and have **not** been reviewed by native-speaking or medical translators.

## How measurements get into the app, and how they are taken in space
**This prototype does not connect to any device.** Values are typed in by hand ("My entries") or come from fictional simulated data.

Sourced facts about spaceflight measurement (public NASA/CSA/JAXA material):
- ISS blood-pressure/ECG kit measures ECG, heart rate and blood pressure: https://ntrs.nasa.gov/api/citations/20190000238
- Medical Diagnostics Pack (BP cuffs, stethoscope, tonometer): https://ntrs.nasa.gov/api/citations/20110011351
- Crew take blood pressure with cuffs; data is downlinked to flight surgeons: NASA ISS blog, 2026-07-08
- CSA Bio-Monitor smart shirt (ECG/heart rate, blood pressure, respiration, SpO2, skin temperature, activity): https://www.asc-csa.gc.ca/eng/sciences/bio-monitor.asp
- Sleep: wrist accelerometer (Actiwatch) plus daily subjective sleep logs: https://ntrs.nasa.gov/api/citations/20090014820
- Ultrasound with remote guidance from the ground (ADUM): https://iss.jaxa.jp (ultrasound page)
- Communication delay limits remote guidance on far missions, motivating autonomous tools: https://ntrs.nasa.gov/citations/20240004905

**Not verified:** in-flight glucose meter and thermometer specifics; there is no objective mood instrument (mood is self-report here).
Possible future step (proposal, not implemented): import of readings from a wearable/device file.

## Scientific status and limitations (please read)

| Item | Status |
|---|---|
| Challenge requirements | Taken from the official challenge page text (Intermediate, Human Exploration / Software / Space Exploration). |
| Status levels | **Statistical deviation from the user's own baseline** (|z| ≥ 2 = Watch, ≥ 3 = Attention). These cut-offs are configurable conventions, **not clinical thresholds**. |
| Input limits | Only reject physically impossible typing errors; they are not normal ranges. |
| Explanatory texts (`js/i18n.js`, keys `info.*`, `region.*`, `msg.*`) | **Draft. Not yet verified against NASA HRP sources.** Marked in the UI. |
| Indicator → hazard mapping | **Proposed mapping, unverified.** |
| Real data (`js/osdr.js`) | **Real, copied from NASA OSDR OSD-575** (checked 2026-11-10). Study text lists post-flight R+1/R+45/R+82; the file also has R+194. Three of four crew show glucose far below the lab range at R+45; the dataset does not explain this and the app does not interpret it. |
| Demo data (`js/demo.js`) | **Entirely fictional**, arbitrary parameters, makes no claim about real physiology. |
| No clinical reference ranges | None are used yet. If added, each needs population, units and a cited source, and must be labelled as terrestrial if it is not spaceflight-specific. |
| Not covered | Bone/muscle and immune indicators (shown as "no data"), radiation, environment, camera input, ML. |
| Guidance | The app only suggests *discussing a large change with the flight surgeon*. It gives no medication or treatment advice. |

## Structure

```
index.html          page
css/style.css       styles
js/core.js          pure logic: validation, baseline, status (tested)
js/demo.js          simulated data generator (fictional)
js/i18n.js          UI texts: English (source), Türkçe, Italiano, Español
js/content.js       region -> indicator / hazard structure
js/store.js         users and their entries (tested)
js/osdr.js          OSD-575 real data + descriptive helpers (tested)
js/osd635.js        OSD-635 study information, sample design, gene-table helpers (tested)
js/osd635-genes.js  OSD-635 gene results (generated, loaded on demand)
js/osd569.js        OSD-569 blood count and gene-result helpers (tested)
js/osd569-data.js   OSD-569 data (generated by tools/make_osd569.py)
js/expression.js    fold change and gene classification (tested)
tools/make_osd635_genes.py  regenerates js/osd635-genes.js from the OSDR differential-expression CSV
js/charts.js        multi-series SVG chart
js/views.js         compare-users and real-data views
js/app.js           UI wiring
tests/core.test.js  unit tests (logic)
tests/i18n.test.js  unit tests (translations)
tests/store.test.js unit tests (users)
tests/osdr.test.js  unit tests (real data)
```

## Next steps

1. Verify and cite explanatory texts and hazard mapping from NASA HRP resources.
2. Decide which reference ranges (if any) to add, with sources.
3. Add measurement reminders and a bone/muscle or immune-related input if a sourced indicator is chosen.

## Immune indicator

The Immune system region now has a status chip. It uses the user's own white blood cell, neutrophil and lymphocyte values (immune form): baseline = the three pre-flight values (L-92, L-44, L-3), recent = the latest up to 3 post-flight values, z = (recent mean − baseline mean) / baseline SD, with the same cut-offs as the other indicators (|z| ≥ 2 watch, |z| ≥ 3 attention). With fewer than 3 pre-flight values, no post-flight value or no variation it stays "no data" (never "usual"). With only three baseline values the estimate is rough, and this is a statistical deviation, not a clinical threshold or a diagnosis. Demo mode has no immune data. Code: `Immune.assess` in `js/immune.js`.

## Status from a single check-in (green / yellow / red)

A status no longer needs a week of data. Each indicator's latest value is placed in a reference zone (`Core.REFERENCE`, `Immune.REFERENCE`): green = normal, yellow = take caution, red = needs attention now. The final status is the worse of that zone and the existing deviation from the person's own baseline (which still needs 7 check-ins, or 3 pre-flight lab values). The reference values are prototype values (general adult resting guidance) and must be reviewed by a flight surgeon; they are not a diagnosis. The values and the zone rule are shown under each indicator.


## Organs: lungs, kidneys, brain, gut (new)

Four more body regions, each with its own indicators and check-up slides (26 slides now, grouped by organ):

| Region | Indicators | Notes |
|---|---|---|
| Lungs | blood oxygen SpO2 %, breathing rate /min | zones: SpO2 95–100 green, 90–94 yellow, <90 red; rate 12–20 green |
| Kidneys & hydration | urine colour 1–8, fluids drunk today (L), flank pain slide | kidneys cannot be measured at home; indirect hydration signs only |
| Brain | headache 0–3, reaction time (ms) | in-app 5-tap reaction test (median); reaction time has **no fixed zones**, only own-baseline change |
| Digestion | meals eaten today, stomach discomfort 0–3 | |

Grip strength and reaction time are "baseline only": the check-up records them and says so instead of colouring them. All zones are prototype values and need flight-surgeon review. Liver and kidney lab values are not included.

### Equipment-free signs and tools per organ

Nine more signs that need no instrument (35 slides in total). Every slide now says which tool it needs ("Tools you need:").

| Region | Added | Tool |
|---|---|---|
| Lungs | shortness of breath, cough, comfortable breath-hold (own baseline only) | clock with seconds; pulse oximeter only for SpO2 |
| Kidneys & hydration | urinations per day, swelling, body-mass change over a week | mass measurement device for weight only; mirror for swelling |
| Digestion | nausea, loss of appetite, bowel movements per day | none |

### Reaction time, grip strength and breath-hold now get a colour

These have no universal normal range, so the check-up slide asks for your own usual value (remembered in the browser). Worse than usual by more than 10 % is yellow, by more than 20 % is red (slower reaction, weaker grip, shorter breath-hold). Without a usual value the slide only records the number. On the dashboard they get a colour after 7 daily readings, from your own baseline. Cut-offs are prototype values for flight-surgeon review.

## Real crew values, read live from NASA

On the check-up start screen, **Load real crew values from NASA** reads the Inspiration4 blood-test tables directly from OSDR: OSD-575 `...CMP.upload_SUBMITTED.csv` (metabolic panel) and OSD-569 `...CBC.upload_SUBMITTED.csv` (blood count). Each lab slide then shows the real crew range before flight and on the first day after landing, plus the lab range printed in the NASA file. Code: `js/crewlive.js` (tested with `tests/crewlive.test.js`).

- It needs your relay address (Live NASA tab) and the relay must be the current `worker/osdr-proxy.js`, which forwards `/geode-py/` (file downloads). If it fails, the bundled copies are used.
- New optional lab slides from the same metabolic panel: creatinine, blood urea nitrogen and eGFR (kidneys), ALT and AST (liver). Their zones are the lab range printed in the NASA file, widened by half its width for yellow (prototype, needs flight-surgeon review). Only 4 crew members, so these ranges describe those 4 people, not all astronauts.

## Movable panels

Every card (users, check-in, pre/post-flight, immune, body map, status, details and each tab's main card) is a panel with a small bar: drag the grip ⠿ to move it (also between columns), use ◀ ▲ ▼ ▶ to move with the keyboard, – to minimize, ⤢ to maximize (Esc closes). The layout is remembered in this browser; **Reset layout** (top right) restores the default. The daily check-in form is now grouped by body region. Code: `js/panels.js`, tests `tests/panels.test.js`.
