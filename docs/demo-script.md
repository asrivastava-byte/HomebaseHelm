# Homebase Helm — Live Demo Script

**Audience:** internal stakeholders (engineering leadership, CS leadership, pack-team leads, product).
**Duration:** ~12 minutes presented, ~5 minutes Q&A.
**Format:** speaker drives the browser; the script below has **Do** (the action) and **Say** (the talking point) for each beat.

The script returns to four themes throughout:

1. **No god mode** — every action is a discrete, gated permission.
2. **Auditing** — every write produces an audit row, before the response renders.
3. **Impersonation** — recast from "magic admin button" into a small, gated, audited workflow.
4. **These are workflows, not a UI for ActiveRecord** — Helm doesn't show you database tables; it shows you the actions admins actually take, with permission and audit baked in.

---

## Pre-demo checklist (do this 5 minutes before)

```bash
# In the helm repo
cd ~/helm/helm
bin/dev               # Rails on :3001, Vite on :5173 (foreman)
ruby /tmp/mock-hb1.rb # Mock HB1 on :9999 (in a second terminal)
```

Open three browser tabs:
1. **Tab A:** `http://localhost:5173` — the Helm UI
2. **Tab B:** `config/permissions.yml` open in your editor of choice (you'll edit this live)
3. **Tab C:** A blank tab for the mock impersonation page to land in

Quick smoke before going on stage:

- Hit `http://localhost:5173`. Header shows "Homebase Helm" with the purple bar. RoleSwitcher shows `cs_t1_agent` (the default).
- Search "jane" on the User Lookup page. Click Jane Doe. You should see the redacted PII profile.

If any of that doesn't work, fix it before starting. The demo only works live.

---

## Opening — 60 seconds

**Say:**
> "What you're about to see is Homebase Helm. It replaces our ActiveAdmin panel for the three workflows that account for **84% of all admin activity** — User Lookup, Company / Merchant, and Location Management.
>
> The pitch is one sentence: **this is workflows, not a UI for ActiveRecord.** ActiveAdmin gives you forms for every table — every column editable by anyone who can log in. Helm shows you the actions admins actually take — and every action is a permission, every action is audited, and no one has god mode."

*(Don't overexplain — the rest of the demo is the proof.)*

---

## Act 1 — User lookup, the same user as three roles (4 minutes)

**Theme: no god mode + workflows-not-UI**

### 1.1 — Search

**Do:** On `/users`, type `jane` in the search box.

**Say:**
> "First thing to notice: I'm not looking at a database table. There's no 'users.index' grid with every column ActiveAdmin found. There's a search box, because that's what admins actually do — they look someone up by something they know."

### 1.2 — Click Jane Doe → see PII redacted

**Do:** Click `jane@hb1.test`. You land on `/users/42`.

**Say:**
> "I'm signed in as `cs_t1_agent` — a Tier 1 customer support agent. Look at the Identity tab. Phone, SSN-last-4, bank-last-4 — all rendered as `••••`. And those fields aren't hidden by CSS. They're physically absent from the JSON the server sent. The browser literally can't show what it doesn't have.
>
> Notice what buttons I have: Resend verification SMS. Resend verification email. That's it. No Edit user. No Impersonate. Why? Because `cs_t1_agent` doesn't have those permissions."

*(Open browser devtools → Network → click the `/users/42` request → show that `phone`, `ssn_last4`, `bank_last4` aren't in the response payload. Skip if pressed for time.)*

### 1.3 — Switch to cs_t2_payroll

**Do:** Top-right RoleSwitcher → `cs_t2_payroll`. Page reloads.

**Say:**
> "Now I'm a Tier 2 payroll agent. Same user. Phone is now visible — `+15555550123`. SSN last 4 — `1234`. The fields *appeared* because this role holds `account.view_pii`, and the server now actually sends them. I also have an Edit user button — payroll fixes typos in names and emails all day.
>
> What I still don't have: Impersonate. Tier 2 Payroll can fix data, but they can't sign in as another human."

### 1.4 — Edit the user

**Do:** Click Edit user. Change Full name to "Jane M. Doe". Click Save.

**Say:**
> "I made one change. Watch what happens next."

**Do:** Click the **Audit trail** tab.

**Say:**
> "There's the row. `user.edited`. The actor is me — `Anumita Srivastava · cs_t2_payroll@helm.local · #2`. The `payload_before` shows `full_name: Jane Doe`. The `payload_after` shows `full_name: Jane M. Doe`. **Only the field that actually changed is in the diff** — if I'd left phone alone, phone wouldn't be in either side.
>
> This row was written *before* the success response was rendered. If my laptop's wifi dropped right after I clicked Save, the change would still be on HB1 and the audit row would still be in Helm's Postgres. There's no way to do a write here that doesn't leave a trace."

---

## Act 2 — Impersonation, the headline (3 minutes)

**Theme: no god mode + impersonation + auditing**

### 2.1 — Try impersonate as cs_t2_payroll (denied)

**Say:**
> "Impersonating users — signing in as them — was the most common 'god mode' move in the old admin. In the old panel, anyone who could log in could do it. Here's what it looks like in Helm."

**Do:** Look at the action buttons. No Impersonate button.

**Say:**
> "I'm Tier 2 Payroll. I can't do it. The button isn't here. And even if I forged the HTTP call myself, the server would 403 me before reaching HB1 — let me actually show that."

**Do:** Open a terminal:
```bash
curl -s -X POST -H "Cookie: HELM_DEMO_ROLE=cs_t2_payroll" \
  http://localhost:3001/helm_api/v1/users/42/impersonate
```

**Say:**
> "`{ error: forbidden, reason: 'role=cs_t2_payroll lacks permission=account.impersonate_user' }`. There's no JS gate. The button hiding in the UI is a courtesy. The server is the enforcer."

### 2.2 — Switch to cs_t2_escalations (allowed)

**Do:** RoleSwitcher → `cs_t2_escalations`. Page reloads.

**Say:**
> "Tier 2 Escalations. This is the role that actually has `account.impersonate_user`. Three of nine roles do — escalations, eng_super, and the break-glass eng_power. That's it. Out of 84% of admin traffic, the most-feared action is gated to less than a third of admin headcount."

### 2.3 — Click Impersonate, follow through

**Do:** Click **Impersonate**. The confirm dialog appears.

**Say:**
> "Confirm dialog. This isn't UX padding — it's deliberate friction. Impersonating a customer is a Big Deal. If I bail here, no audit row is written, no token is minted, nothing happened."

**Do:** Click Confirm.

A new tab opens to `http://localhost:9999/fake_login/<token>`. The mock page says "✓ Impersonating Jane Doe."

**Say:**
> "New tab. In production this is HB1's login_as URL — a one-time, 15-minute-TTL token. The session lives entirely on HB1; Helm doesn't proxy or store it.
>
> But here's the part that matters."

**Do:** Switch back to the Helm tab. Click the **Audit trail** tab.

**Say:**
> "Top row. `user.impersonation_started`. Me, my role, my email, the timestamp, the token's expiry. **The audit row was written before the new tab opened.** Even if my browser had crashed right after clicking Confirm, this row would still exist. There is no flow that mints an impersonation URL without auditing it.
>
> And look at the action name: `user.impersonation_started`. It's a *verb*, not a row creation event. That's the workflows-not-UI point in two words."

---

## Act 3 — Config-driven permissions, live (2 minutes)

**Theme: no god mode + workflows-not-UI**

### 3.1 — Tease the file

**Do:** Switch to your editor showing `config/permissions.yml`.

**Say:**
> "Everything you just saw — who can impersonate, who can see PII, who can edit users — lives in one YAML file. No code. A CS Tier 4 leader can edit this and send a PR. No engineering review, no code review, no deploy ticket. Watch."

### 3.2 — Remove impersonate from cs_t2_escalations

**Do:** In the YAML, find `cs_t2_escalations:` → `permissions:` block. Delete the line `- account.impersonate_user`. Save.

**Do:** In a terminal: `pkill -f "puma.*3001" && cd ~/helm/helm && bin/rails server -p 3001 &` (or `bin/rails restart` if that's set up).

**Say:**
> "I removed one line. Restarted Rails. That's it."

### 3.3 — Show the button is gone

**Do:** Switch back to the browser. Hard-refresh the page (`⌘⇧R`).

**Say:**
> "Same role. Same user. The Impersonate button is gone. I'd 403 if I tried the curl from earlier.
>
> No JS deploy. No Rails code change. No engineering ticket. **The permission model itself is editable as a config.**"

### 3.4 — Restore

**Do:** Put the line back in the YAML. Save. Restart Rails. (Optional — you can skip if pressed for time and just say "I'd restore that for the rest of the demo.")

---

## Act 4 — Company / Merchant, composite tabs + tiered visibility (2 minutes)

**Theme: workflows-not-UI + tiered access + auditing**

### 4.1 — Open Acme Diner

**Do:** Click nav → **Company / Merchant**. Search "acme". Click Acme Diner.

**Say:**
> "Again — workflows, not UI for tables. The old admin had a `companies` index, a `merchant_profiles` index, a `sales_tax_records` index, a `payment_attempts` index, all separate. Here it's *one* page about *this company*, organized by what people actually look up. Watch the tabs."

### 4.2 — Walk the tabs

**Do:** Click through each tab:

- **Company tab:** Identity (with Stripe customer ID — note redacted as `cs_t2_escalations` doesn't have view_pii, OR visible if you stayed on cs_t2_payroll). Subscription. Locations (cross-linked to /locations/:id). Recent payment attempts with succeeded/failed/pending chips.

**Say (on the Company tab):**
> "Each card is one chunk of admin context. The locations are clickable — they take you to the Location Management workflow for the same data. The payment attempts include a failed one, with the failure reason inline. None of this was three separate ActiveAdmin index pages."

- **Merchant tab:** Payroll readiness (chip), missing-data flags, check entity, billing, recent invoices.

**Say (on the Merchant tab):**
> "Payroll readiness as a chip. Missing data flags as warning chips. This is the kind of view CS needs to answer 'why hasn't payroll run for this merchant yet?' — and they get the answer in three seconds."

- **Sales tax tab:** Only visible if your role has `account.view_sales_tax`.

**Say:**
> "Sales tax is a great example of tiered visibility. Tier 1 agents can't see this tab — it's not even rendered. Tier 2 Payroll and Payments can, because they need it. The gating is permission-based, not UI-based — the data doesn't even load if you don't have the perm."

- **Biller tab:** Credit cards (last 4 PII-gated), tier history.

**Say:**
> "Credit cards — even the last four — are PII-gated. If I were `cs_t3_ops` right now, I'd see a redacted alert instead of the cards. Tier history captures every tier change ever made, with the audit row tying back to *who* made it."

### 4.3 — Change tier (optional, time-permitting)

**Do:** If your role has `billing.update_subscription_tier`, click **Change tier** → drawer slides in → pick a new tier → Apply.

**Say:**
> "Tier change has a richer audit row — `payload_before: tier: starter`, `payload_after: tier: professional`. The BFF actually does *two* HB1 calls — read the current tier first, then write — specifically so the audit captures the diff. That's not a generic CRUD update; it's a workflow."

---

## Act 5 — Location, "impersonate at a location" (2 minutes)

**Theme: impersonation + auditing + workflows-not-UI**

### 5.1 — Open a location

**Do:** Nav → **Locations**. Search "acme". Click "Acme Diner — Main St".

**Say:**
> "Location detail. Address, tier, partner POS, active and archived job counts. And — this is the interesting part — the users employed at this location."

### 5.2 — Impersonate Marco from inside the location

**Do:** Scroll to the **Users at this location** card. Make sure your role has `account.impersonate_user` (`cs_t2_escalations` works once you restored the YAML; or use `eng_super`). Each user row has an **Impersonate** button.

**Say:**
> "Same impersonate verb. Same permission. But notice — when I click Impersonate here, the audit row attaches to the *Location*, not the *User*. Because the workflow I'm in is 'investigate this location,' not 'investigate this person.' The audit tells the story of what I was doing when I made the move."

**Do:** Click Impersonate on one of the users. Confirm.

**Say:**
> "New tab opens. Mock HB1 page."

**Do:** Switch back. Click the **Audit trail** tab.

**Say:**
> "`location.user_impersonated`. The resource is `Location#42`. The payload says which user I impersonated. That detail matters when you're triaging weeks later — you can search audits for 'who impersonated whom from which location' without joining three tables."

### 5.3 — Archive / Unarchive

**Do:** Click **Archive jobs** → confirm. Watch the snackbar pop. Then **Unarchive jobs** → confirm.

**Say:**
> "Two action verbs, one permission — `account.archive_location_jobs`. Both audited. The same role authorizes both directions of the same operation. That's a deliberate choice; we treat 'undo' and 'do' as the same trust level."

---

## Closing — 60 seconds

**Say:**
> "So — to recap.
>
> **No god mode.** No role has 'edit everything'; the closest is `eng_power`, the break-glass role, and even that's defined by a wildcard rule restricted to that one role at YAML-load time. Impersonation is held by three roles. PII is server-side redacted. The buttons that hide in the UI are a courtesy — the server is the enforcer.
>
> **Auditing.** Every write produces a row, before the success response renders. Every row credits a person — not a role, a person. The diff is captured for changes; the verb is captured for one-shot actions. The audit trail tab is the same UI for every workflow.
>
> **Impersonation.** Recast from 'magic admin button' into one of nine workflow verbs. Same gating, same audit, no shortcuts.
>
> **And these are workflows, not a UI for ActiveRecord.** You don't see tables. You see actions. Search a user, view memberships, edit a profile, impersonate from a location context. Each one designed to match the work, not the schema.
>
> The whole thing was built end-to-end by AI executing a spec I wrote — five tested implementation plans, around a hundred commits, every commit atomic and tied to a plan step. And it ships with a scaffold so the pack teams who own the remaining 16% of admin traffic can migrate their workflows the same way. The handoff isn't a slide deck; it's a generator and a worked example."

---

## Q&A — common questions, short answers

**Q: What happens if HB1 is down?**
A: Helm's BFF gets a Faraday connection error and returns 502 to the browser. The audit log is unaffected — but no writes happen because the underlying mutation needs HB1. Read pages will show an error. Helm is intentionally not a cache.

**Q: How do we know the permission YAML matches what AuthZ will enforce?**
A: The schema is AuthZ-shaped (role × permissions × scope_type). The migration is `rake authz:sync` to seed AuthZ from the YAML, then `HELM_PERMISSION_BACKEND=authz`. No call-site changes.

**Q: How do pack teams migrate their workflows?**
A: `scripts/scaffold-workflow.rb <workflow> <resource>` stamps out the BFF + entity + React skeleton + handoff doc. `docs/handoff/user_lookup.md` is the fully-worked example. The AI built two of the three MVP workflows using this same scaffold — so it's been battle-tested.

**Q: Is this production-ready?**
A: The MVP is demoable. Pending: Stytch JWT (swap `DemoIdentity` middleware), AuthZ gRPC integration (swap permission backend), Lattice impersonation (swap which service mints the URL), and the HB1-side handoff PRs for each workflow (captured in `docs/handoff/hb1-workflow*.md`).

**Q: What's the LOC vs. ActiveAdmin?**
A: Helm is ~5,000 LOC including tests. The ActiveAdmin admin/ directory in HB1 is ~25,000+ LOC. Most of the savings come from not re-implementing per-table forms and not having to write JS workarounds for ActiveAdmin's quirks.

**Q: Why a Rails BFF and not just calling HB1 directly from React?**
A: Three reasons: (1) PII redaction has to be server-side — a browser-trusted JS API would leak; (2) audit has to be inside the same transaction boundary as the write; (3) permission enforcement has to be a single hop, not distributed across services. The BFF is the natural place for all three.

---

## Backup material — if asked to go deeper

- **Sales tax tab gating:** show `config/permissions.yml`, point at `account.view_sales_tax` and which roles hold it. Switch to `cs_t3_ops` → the Sales tax tab literally disappears.
- **Credit card PII gating:** as `cs_t3_ops` (no `view_pii`), open the Biller tab → the "Credit card details are redacted for your role" alert renders.
- **Diff audit detail:** edit a user, change two fields, then change one back to original. Show the audit row: only the two that *actually* changed appear in `payload_before` / `payload_after`.
- **Scaffold demo:** run `scripts/scaffold-workflow.rb cash_out_review payout --root /tmp/demo-out` → show the generated files in 30 seconds.
- **Spec doc:** open `docs/2026-06-09-helm-mvp-design.md` § Changelog → all v1.1 additions are documented, with the human/AI methodology written down for reproducibility.

---

## If something goes wrong

- **Vite died:** `cd client-helm && bun run dev` in a fresh terminal.
- **Rails died:** `cd ~/helm/helm && bin/rails server -p 3001`.
- **Mock HB1 died:** `ruby /tmp/mock-hb1.rb &`.
- **Page is blank:** check the browser console; you probably hit a workflow page for a user/company/location that the mock doesn't have. Use #42 for users, #42 or #99 for companies, #42, #77, or #88 for locations.
- **Audit trail empty:** click a write button (Verify SMS, Impersonate, Edit) — audits only attach to writes, not reads.
