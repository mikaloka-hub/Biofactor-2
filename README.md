# Handoff: Biofactor Website — Backend & Production Infrastructure

**Target:** Build in an agentic IDE (Antigravity) against the GitHub + Netlify stack.
**Date:** July 2026. **Budget constraint: everything must run on free tiers.**
**Priorities in order: (1) safety of adverse-event reports, (2) reliability, (3) zero cost.**

---

## Overview

Biofactor is a static pharmaceutical company website (Argentina) with 6 pages:
`index` (home), `Nosotros` (about), `Productos` (products), `Contacto` (contact),
`Farmacovigilancia` (adverse-event reporting), `Licencias` (licensing).

The complete current site source is in `site/`. It works today by opening the HTML
files directly — pages are rendered client-side by a lightweight component runtime
(`support.js`); each `*.dc.html` file contains an `<x-dc>` template with inline
styles plus a `Component` logic class. ES/EN language toggling is done client-side
via `data-en` / `data-en-ph` / `data-en-html` attributes swapped by JS.

### About the design files

The files in `site/` are the **production frontend as designed — visuals are final
and must not be redesigned**. Your job is backend/infrastructure: form delivery,
SEO pre-rendering, i18n restructuring, hosting config, monitoring, and compliance
scaffolding. Where a task requires touching page markup (e.g. wiring forms, meta
tags), preserve the existing visual design, inline-style approach, colors,
typography and copy exactly.

### Hard constraints — do NOT change

1. **The Google Sheets product data source stays.** `Productos.dc.html` pulls live
   from a published Google Sheets CSV (see `products-data.js` for the fetch URL and
   parsing). The client edits products directly in that sheet; the data is public
   by design. You may *add* a build-time fetch + nightly backup around it, but the
   runtime live-fetch and the client's ownership/edit workflow must survive.
2. **No paid services.** GitHub Free, Netlify Free, Cloudflare Web Analytics,
   UptimeRobot Free, Sentry Free tier only.
3. **Visual design is final** (high-fidelity). Do not restyle.

### Key parameters (confirmed with the owner)

| Parameter | Value |
|---|---|
| Contact form notifications → | `info@biofactor.com.ar` |
| Adverse-event notifications → | `info@biofactor.com.ar` **for now — WILL CHANGE** to a dedicated farmacovigilancia inbox. Make this a single config constant / env var (`PHARMACOVIGILANCE_INBOX`), never hard-coded in multiple places. |
| Domain | `biofactor.com.ar` — owner has DNS access |
| English strategy | Real indexable `/en/` URLs (licensing partners are international; ES is primary traffic) |

---

## Phase 1 — Repo + Netlify foundation

1. Initialize a Git repo from `site/` contents (site files at repo root). Add
   `netlify.toml`:
   - Build command runs the pre-render step (Phase 3); publish directory `dist/`.
     Until Phase 3 exists, publish the raw files as-is.
   - Security headers on `/*`: `Strict-Transport-Security`, `X-Frame-Options: DENY`
     (exempt nothing — the embedded Google Map is an iframe *on* the page, not the
     page in an iframe), `X-Content-Type-Options: nosniff`,
     `Referrer-Policy: strict-origin-when-cross-origin`, and a CSP that allows
     `fonts.googleapis.com`, `fonts.gstatic.com`, `docs.google.com` (sheet CSV),
     `maps.google.com` (iframe), Cloudflare analytics beacon, Sentry.
   - Caching: hashed/static assets `Cache-Control: public, max-age=31536000,
     immutable`; HTML `public, max-age=300, must-revalidate`.
2. Connect repo to Netlify; enable **Deploy Previews** on pull requests (this is
   the staging environment — production deploys only from `main`).
3. Custom domain `biofactor.com.ar` + `www` redirect + automatic HTTPS
   (owner will set the DNS records you specify).

## Phase 2 — Forms (HIGHEST PRIORITY)

Both forms currently **fake** success client-side; nothing is transmitted. Replace
with **Netlify Forms**.

### Mechanics

- Netlify Forms requires a static HTML `<form>` with `data-netlify="true"` and a
  `name` attribute present in the *deployed* HTML so Netlify registers the form at
  deploy time. Because pages hydrate client-side, add a hidden static registration
  form per page (all field `name`s listed) in the deployed HTML — the pre-render
  step (Phase 3) makes this natural; until then, put the hidden forms in the raw
  HTML.
- The live React-style forms submit via `fetch` POST to `/` with
  `application/x-www-form-urlencoded` body including `form-name`.
- **Real success/failure states:** on non-2xx or network error, show the existing
  error-styled message with a direct-email fallback (contact:
  `info@biofactor.com.ar`; pharmacovigilance: the configured inbox + note that
  reports can also be filed directly with ANMAT at
  https://sistemas.anmat.gov.ar/aplicaciones_net/applications/fvg_eventos_adversos_nuevo/index.html).
  An adverse-event reporter must never hit a dead end.
- On success, show a **reference ID** (e.g. `BF-<base36 timestamp>`), included as a
  hidden field so it appears in the stored submission and the email subject.
- Keep both languages working for all new/changed strings (follow the existing
  `data-en` pattern until Phase 4 replaces it).

### Form 1 — Contacto (`form name="contacto"`)

Fields (from `Contacto.dc.html` state): `nombre`, `apellido`, `email`, `mensaje`
(+ honeypot). Existing client validation stays; add server-relevant hardening:
length caps (name/apellido 100, email 200, mensaje 5000), HTML stripped.

### Form 2 — Farmacovigilancia (`form name="farmacovigilancia"`)

3-step wizard; fields (from `Farmacovigilancia.dc.html` state): `reportante`,
`email`, `telefono`, `medico`, `producto` (select fed from the products sheet),
`lote`, `paciente`, `edad`, `sexo`, `peso`, `descripcion` (+ honeypot). Required:
`reportante`, valid `email`, `producto`, `descripcion` (matches existing wizard
validation). Length caps analogous; `descripcion` 10000.

### Spam protection

- Keep the existing honeypot fields; wire them as Netlify's
  `netlify-honeypot` attribute so Netlify discards bot submissions server-side.
- Enable **reCAPTCHA v2 via Netlify Forms** (`data-netlify-recaptcha="true"`) on
  the Farmacovigilancia form; on Contacto, start with honeypot + Netlify's Akismet
  spam filtering only, add reCAPTCHA if spam appears.
- Remove the localStorage rate limiter's *blocking* behavior on Farmacovigilancia
  (never block a genuine adverse-event report); keep it on Contacto.

### Notifications

Configure Netlify Form notifications:
- `contacto` → email to `info@biofactor.com.ar`
- `farmacovigilancia` → email to `PHARMACOVIGILANCE_INBOX`
  (= `info@biofactor.com.ar` initially; document in the repo README how to change
  it in one place).

### Regulatory / legal notes for the pharmacovigilance form

> **Confirm with legal before finalizing archiving — but build to this standard
> meanwhile:**
>
> - ANMAT **Disposición 5358/12** (Buenas Prácticas de Farmacovigilancia) obliges
>   marketing-authorization holders (TARC) to keep a **detailed record of ALL
>   suspected adverse reactions** to their products, and defines the criteria and
>   deadlines for onward notification to ANMAT's Departamento de Farmacovigilancia
>   y Gestión de Riesgo. Deadlines run from *receipt* of the report — so delivery
>   failure is a compliance risk, not just a bug.
> - ANMAT **Disposición 3031/2024** made the **"eReporting Industria"** platform
>   (WHO/Uppsala Monitoring Centre) the single channel for companies to forward
>   these notifications to ANMAT. The website form is the company's *intake*;
>   forwarding to ANMAT is a human/regulatory process outside this build — but the
>   intake record must be complete and durable enough to support it.
> - Working retention standard (mirrors EU GVP Module I, commonly applied where
>   local rules don't state a number): **retain pharmacovigilance records for the
>   life of the marketing authorization + at least 10 years**. Build the archive
>   as keep-forever; legal can only shorten it.
> - **Ley 25.326** (Argentine data protection): patient health data is *sensitive
>   data* — add an explicit consent checkbox + privacy-policy link to the form's
>   final step, restrict who can access Netlify submissions, and note US storage
>   in the privacy policy pending legal review.
>
> **Archival implementation:** a scheduled GitHub Action (monthly) pulls all
> submissions via the Netlify API (`NETLIFY_AUTH_TOKEN` secret) and commits them
> as JSON to a **separate private repo** (`biofactor-pv-archive`). Records then
> exist in two independent systems and survive Netlify account issues. Never
> delete submissions from Netlify.

## Phase 3 — SEO: pre-render build step

Pages must be crawlable as full HTML.

1. Add a Node build script (runs on Netlify): render each page (Puppeteer against
   the local files, or a static assembler that executes the DC templates) and emit
   finished HTML snapshots to `dist/`, with the runtime still hydrating on load.
2. Fetch the Google Sheets CSV **at build time** and inline the product list into
   the pre-rendered Productos page; keep the existing client-side live fetch as a
   refresh on load (client sheet workflow unchanged).
3. Generate `sitemap.xml` (all pages × both locales) and `robots.txt`.
4. Per-page `<title>`, `<meta name="description">`, OG tags — both languages.
5. Canonical URLs + `hreflang` pairs (`es-AR` ↔ `en`, plus `x-default` → ES).
6. Image pipeline: convert `assets/*.jpg` to WebP at 2–3 widths (e.g. 640/1280/1920)
   with `sharp` at build; rewrite `<img>` to `srcset` + `loading="lazy"`. Keep
   originals as fallback.

## Phase 4 — i18n: real `/en/` URLs

1. Extract every `data-en` / `data-en-ph` / `data-en-html` pair into
   `locales/es.json` + `locales/en.json` (keys namespaced per page, e.g.
   `contacto.form.nombre_label`).
2. The pre-render step emits **two page trees**: `/` (Spanish) and `/en/`
   (English), text resolved at build. Build fails loudly on missing keys.
3. The visible ES/EN toggle becomes navigation between the URL pairs
   (preserve scroll position where trivial).
4. `hreflang` from Phase 3 now points at the real URLs. Netlify redirect:
   nothing automatic — do NOT geo-redirect; let users and Google choose.

## Phase 5 — Compliance + monitoring + content ops

1. **Privacy policy page** (ES + EN, matching site design): data collected per
   form, purpose, retention, rights under Ley 25.326 (AAIP authority) and GDPR,
   mention of US-based processing (Netlify), contact for data requests. Link
   under both forms; consent checkbox on Farmacovigilancia (required, unchecked
   by default).
2. **No cookie banner:** analytics is cookieless (below). State this in the
   privacy policy. Do not add any cookie-setting scripts.
3. **Accessibility pass (WCAG 2.1 AA):** form labels ↔ inputs (`for`/`id`),
   `aria-live` on error/success messages, visible focus states, keyboard-operable
   language toggle and wizard steps, `alt` text on all images, check contrast on
   the `#8A97A6` label text against white (fails AA at small sizes — darken to
   ~`#6B7887` where used for essential text).
4. **Analytics:** Cloudflare Web Analytics beacon snippet (free, cookieless) on
   all pages. Track form-success states as custom events if trivial, otherwise
   rely on page-level metrics.
5. **Errors:** Sentry browser SDK (free tier), environment-tagged, sample rate
   tuned to stay in free quota.
6. **Uptime:** UptimeRobot monitors on `/` and `/farmacovigilancia` (owner's
   email for alerts).
7. **Delivery-failure watchdog:** weekly GitHub Action queries the Netlify API
   for submission counts per form and emails a digest; alert if the
   farmacovigilancia form has submissions but the notification email address has
   ever bounced (check via Netlify notification logs where exposed; at minimum,
   include per-form counts so a silent mismatch is humanly noticeable).
8. **Sheet backup:** nightly GitHub Action downloads the published CSV to
   `backups/products-YYYY-MM-DD.csv` in the repo (commit only on change).
   Validate: expected header columns present, row count > 0; on failure, the
   Action fails (GitHub emails the owner) and does NOT commit.

---

## Repo hygiene expectations

- All inbox addresses, sheet CSV URL, and API tokens as config constants /
  Netlify env vars — one place each, documented in the repo README.
- Every phase lands as a PR with a Deploy Preview link. `main` = production.
- Write a short `OPERATIONS.md` for the owner: how to change the
  pharmacovigilance inbox, how to restore a product-sheet backup, where to see
  form submissions, what each alert email means.

## Files in this bundle

- `site/` — complete current frontend (6 pages, `support.js` runtime,
  `products-data.js` sheet fetch/parse, `assets/` images). This is the code to
  put in the repo and build on.
- `README.md` — this brief. It is the full specification; no other context is
  required.
