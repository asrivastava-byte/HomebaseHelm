# Homebase Helm — 3-4 Minute Live Demo Script

**Format:** speaker drives the browser; **Do** = the action, **Say** = the talking point.

**Themes to hit:** **no god mode** · **auditing** · **impersonation** · **workflows, not a UI for ActiveRecord** · **AI-led project** · **RBAC is config, not code**.

Three workflow stops: User, Company / Merchant, Location.

---

## Pre-demo (do this once, before)

```bash
cd ~/helm/helm && bin/dev          # Rails :3001 + Vite :5173
ruby /tmp/mock-hb1.rb              # in a second terminal
```

Browser on `http://localhost:5173`, RoleSwitcher set to `cs_t1_agent`, User Lookup page open.

---

## 0:00 — Frame it (30 sec)

**Say:**
> "Homebase Helm replaces our admin panel for the three workflows that are **84% of admin activity** — User Lookup, Company / Merchant, Location Management. One sentence: **this is workflows, not a UI for ActiveRecord** — every action is a permission, every action is audited, and no one has god mode.
>
> Two things to know up front. **One: this is an AI-led project.** I wrote a spec doc; an AI agent (Claude Code with the Superpowers skill suite) decomposed it into five tested implementation plans and built every line of code against them — strict tests-first, atomic commits, scaffold for handoff. I made the product calls; the AI did the long-tail engineering. **Two: the permission model is config, not code.** Everything you're about to see — who can view PII, who can impersonate, who can edit — lives in one YAML file. A CS Tier 4 leader can change it without an engineering ticket."

---

## 0:20 — Workflow 1: User Lookup + PII gating (40 sec)

**Do:** Type `jane` → click `jane@hb1.test`.

**Say:**
> "Search, not a table grid. Tabs are *what admins do* — Identity, Memberships, Jobs, Audit. I'm Tier 1 Support — PII fields render as `••••` because they're physically absent from the JSON the server sent. Not a CSS hide; the server stripped them."

**Do:** Briefly click through the Memberships tab → Jobs tab → back to Identity.

**Say:**
> "One page about this person. Where they work, the shifts they have, their MFA status, their bank-on-file flag. The old admin would have made you click through five index pages to assemble this."

---

## 1:00 — No god mode + Impersonation (45 sec)

**Do:** RoleSwitcher → `cs_t2_escalations`. Page reloads.

**Say:**
> "Same user. Different role. PII is now visible — `+15555550123`, SSN, bank. And an **Impersonate** button appears.
>
> Impersonate is a discrete permission held by **three of nine roles**. Tier 1 can't do it. Tier 2 Payroll can't do it. The button literally isn't here for them — and the server would 403 if they tried the HTTP call directly. **No god mode.**"

**Do:** Click **Impersonate** → confirm → Confirm.

**Do:** A new tab opens to a mock "Logged in as Jane Doe" page.

**Say:**
> "New tab. In production this is HB1's one-time `login_as` URL. Helm doesn't proxy the session — it just mints and audits."

**Do:** Switch back to Helm → click **Audit trail** tab.

**Say:**
> "`user.impersonation_started`. My name, role, email, the timestamp, the token expiry. **This row was written before the new tab opened.** Every write — verify, edit, impersonate — produces an audit row the same way, before the success response renders."

---

## 1:45 — RBAC is config, not code (20 sec)

**Do:** Open `config/permissions.yml` in your editor *(or just flash it in a terminal: `cat config/permissions.yml`)*. Point at the `cs_t2_escalations` block.

**Say:**
> "This is the entire authorization model. One YAML file. The line that just let me impersonate is right here — `account.impersonate_user` on `cs_t2_escalations`. Remove the line, restart Rails, the button I just clicked is gone — no Ruby change, no JS change, no deploy ticket. The schema is AuthZ-shaped, so when AuthZ supports admin reps the migration is a backend swap — `HELM_PERMISSION_BACKEND=authz` — and call sites don't change."

---

## 2:05 — Workflow 2: Company / Merchant + tiered tabs (50 sec)

**Do:** Nav → **Company / Merchant** → search "acme" → click Acme Diner.

**Say:**
> "Same pattern. Workflows, not a UI for the `companies` and `merchant_profiles` and `sales_tax_records` tables — *one page* about this business, organized by the questions admins actually ask."

**Do:** Click through the tabs: **Company → Merchant → Sales tax → Biller → Audit trail**.

**Say (as you walk):**
> "Company tab: subscription, locations (cross-linked), recent payment attempts including failures. Merchant tab: payroll readiness chip, missing-data flags, check entity. Sales tax tab: per-location records, exemptions. Biller tab: credit cards — last four PII-gated — and tier history.
>
> Here's the tiered-visibility piece — the Sales tax and Biller tabs are only here because `cs_t2_escalations` happens to have... actually, they don't have `view_sales_tax`. Let me switch."

**Do:** RoleSwitcher → `cs_t2_payroll`. Page reloads — now Sales tax and Biller tabs are visible.

**Say:**
> "Tier 2 Payroll. The Sales tax and Biller tabs appeared. Tier 1 Support never sees them at all — not the tab, not the data. **Permission-gated at the route level**, not hidden in JS."

*(If short on time, skip the role switch and just say "if I switched to Tier 1, those tabs would disappear entirely.")*

---

## 2:55 — Workflow 3: Location + at-context impersonation (45 sec)

**Do:** Nav → **Locations** → search "acme" → click Acme Diner — Main St.

**Say:**
> "Same shape, third workflow. Address, tier, partner POS, active and archived jobs. The interesting card is this — **Users at this location**."

**Do:** Scroll to Users-at-location → highlight the Impersonate buttons.

**Say:**
> "Same impersonate verb. Same permission. But notice — when I impersonate Marco *from here*, the audit row attaches to the *Location*, not the *User*. Because the workflow I'm in is 'investigate this location,' not 'investigate this person.' The audit tells the story of what I was doing when I made the move."

**Do:** Click Impersonate on a user → confirm → click the Audit trail tab.

**Say:**
> "`location.user_impersonated`. Resource is `Location#42`. Payload says which user. That detail matters weeks later when you're triaging — searchable without joining three tables."

**Do:** *(Optional, if time)* Click **Archive jobs** → confirm → then **Unarchive jobs** → confirm.

**Say (if you do the optional):**
> "Two verbs, one permission — archive and unarchive are the same trust level. Both audited."

---

## 3:40 — Close (25 sec)

**Say:**
> "So — three workflows, one pattern.
>
> **Workflows, not tables.** Search and tabs designed around what admins do, not what the schema is.
>
> **No god mode.** Every action a discrete permission. PII server-side redacted. Impersonate gated to three of nine roles. The buttons hiding in the UI are a courtesy — the server is the enforcer.
>
> **Auditing.** Every write → a row credited to a person, before the response renders. Audit goes to the resource that frames the workflow — User if you started from User, Location if you started from Location.
>
> **RBAC is config, not code.** One YAML file. CS Tier 4 can PR a permission change without an engineering ticket. Schema is AuthZ-shaped so the migration to real AuthZ is a deploy-flag, not a refactor.
>
> **And this whole thing is AI-led.** I wrote the spec; an AI agent decomposed it into five tested plans and built every commit — atomic, tests-first, traceable back to a plan step. The MVP ships with a scaffold and worked-example handoff docs so any pack team can migrate their remaining workflows the same way — whether a human or an AI does it. The methodology is the reusable part."

---

## If asked

- **HB1 down?** Helm returns 502; audit log unaffected; no writes happen. Helm is not a cache by design.
- **Permission changes?** Edit `config/permissions.yml`, restart Rails. CS Tier 4 can PR it; no engineering ticket. Schema is AuthZ-shaped, so migration to real AuthZ is a backend swap (`HELM_PERMISSION_BACKEND=authz`).
- **Other teams?** `scripts/scaffold-workflow.rb <workflow> <resource>` stamps out BFF + entity + React + handoff doc. `docs/handoff/user_lookup.md` is the worked example.

## If something breaks

- Vite died → `cd client-helm && bun run dev`
- Rails died → `bin/rails server -p 3001`
- Mock HB1 died → `ruby /tmp/mock-hb1.rb &`
- Page blank → use **user 42**, **company 42 or 99**, **location 42, 77, or 88**.

(Fuller 12-minute walkthrough — live YAML edit, deeper Company tabs, etc. — see git history `c4a0b4b`.)
