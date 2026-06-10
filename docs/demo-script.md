# Homebase Helm — 2-3 Minute Live Demo Script

**Format:** speaker drives the browser; **Do** = the action, **Say** = the talking point.

**Themes to hit:** **no god mode** · **auditing** · **impersonation** · **workflows, not a UI for ActiveRecord**.

---

## Pre-demo (do this once, before)

```bash
cd ~/helm/helm && bin/dev          # Rails :3001 + Vite :5173
ruby /tmp/mock-hb1.rb              # in a second terminal
```

Browser on `http://localhost:5173`, RoleSwitcher set to `cs_t1_agent`, the User Lookup page open.

---

## 0:00 — Frame it (15 sec)

**Say:**
> "Homebase Helm replaces our admin panel for the three workflows that are 84% of admin activity. One sentence: **this is workflows, not a UI for ActiveRecord** — every action is a permission, every action is audited, and no one has god mode."

---

## 0:15 — Workflows, not ActiveRecord (30 sec)

**Do:** Type `jane` in the search box → click `jane@hb1.test`.

**Say:**
> "I'm searching, not browsing a table. The old admin gave you every column on every model. Helm gives you the actions admins actually take. Tabs: Identity, Memberships, Jobs, Audit. PII is `••••` because I'm Tier 1 Support — and those fields aren't hidden by CSS, they're physically absent from the JSON the server sent."

*(Optional, if devtools are open: Network → /users/42 → no `phone`, `ssn_last4`, `bank_last4` in the response.)*

---

## 0:45 — No god mode, via role switching (45 sec)

**Do:** RoleSwitcher → `cs_t2_escalations`.

**Say:**
> "Same user. Different role. PII is visible. And — this is the headline — an **Impersonate** button appears.
>
> The old admin had impersonate as a button anyone with admin access could push. In Helm it's a discrete permission — `account.impersonate_user` — held by **three of nine roles**. Tier 1 can't do it. Tier 2 Payroll can't do it. Tier 2 Escalations and senior eng can. That's it.
>
> The button hiding for other roles is a courtesy. The server is the enforcer — try the API call with the wrong role and you get a 403 before HB1 even hears about it."

---

## 1:30 — Impersonation + audit (45 sec)

**Do:** Click **Impersonate** → confirm dialog → Confirm.

**Do:** A new tab opens to a mock "Logged in as Jane Doe" page.

**Say:**
> "New tab. In production this is HB1's one-time `login_as` URL with a 15-minute TTL. The session lives on HB1; Helm doesn't proxy it."

**Do:** Switch back to the Helm tab → click the **Audit trail** tab.

**Say:**
> "Top row. `user.impersonation_started`. My name, my role, my email, my user-id, the timestamp, the token's expiry.
>
> **This audit row was written before the new tab opened.** Even if my browser had crashed right after I clicked Confirm, this row would still be in Helm's Postgres. There is no path that mints an impersonation URL without writing this row. Every write — edit, verify, impersonate — produces an audit row the same way."

---

## 2:15 — Close (15 sec)

**Say:**
> "So — workflows, not tables. Every action gated by a YAML-defined permission, server-enforced. Impersonation recast from a magic admin button into one of nine workflow verbs. Every write audited to a person, before the response renders. **No god mode.**
>
> Built end-to-end by an AI agent against a spec doc, with tests-first discipline. Ships with a scaffold so pack teams can migrate the remaining 16% of admin traffic the same way."

---

## If asked

- **"What if HB1 is down?"** — Helm returns 502; audit log unaffected; no writes happen. Helm is intentionally not a cache.
- **"How do permission changes ship?"** — Edit `config/permissions.yml`, restart Rails, done. CS Tier 4 can PR it; no engineering ticket. The model is AuthZ-shaped, so the migration to real AuthZ is a backend swap (`HELM_PERMISSION_BACKEND=authz`) with no call-site changes.
- **"How do other teams migrate?"** — `scripts/scaffold-workflow.rb <workflow> <resource>` stamps out the BFF + entity + React + handoff doc. `docs/handoff/user_lookup.md` is the worked example.

---

## If something breaks

- Vite died → `cd client-helm && bun run dev`
- Rails died → `bin/rails server -p 3001`
- Mock HB1 died → `ruby /tmp/mock-hb1.rb &`
- Page blank → mock probably doesn't have that ID. Use **user 42**, **company 42 or 99**, **location 42, 77, or 88**.

(For the longer, fuller 12-minute walkthrough — config-driven permissions live edit, Company/Merchant deep-dive, Location at-context impersonation — see git history for `c4a0b4b`.)
