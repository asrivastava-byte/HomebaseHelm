# Helm Workflow 1 — User Account Lookup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** End-to-end demo of the User Account Lookup workflow (43.8% of admin traffic): search a user, view profile with role-gated PII, send verification SMS, mint an impersonation token. All writes audited. Built as the canonical example for Plan 3's scaffold generator.

**Architecture:** This plan modifies two repos. **HB1** (`~/Homebase1`): extract two service objects from `app/admin/users.rb` (verification SMS + impersonation) and add two `POST` routes under `app/api/rpa_api/v1/users_api.rb` that call them. **Helm** (`~/helm/helm`): add `Hb1Client::Users` (calls HB1 via the existing `Hb1Client::Base`), `Entities::User` (Grape-Entity with PII conditional on `account.view_pii`), `HelmApi::V1::UsersApi` (GET search, GET show, POST verification_sms, POST impersonate), and three React pages (Index/Show/Impersonate modal) that reuse `PiiField`/`AuditTrailTab`/`usePermission` from Plan 1.

**Tech Stack:** No new gems or packages. Same Rails/Grape/Faraday/RSpec/WebMock on the backend; same React/MUI/react-query/react-router on the frontend.

**Plan 1 dependencies (must be complete):**
- `PermissionService.check!` raises on deny
- `Hb1Client::Base.get` / `.post` with Bearer auth
- `AuditService.record` writes `audit_events` + emits structured logs
- `DemoIdentity` middleware populates `env[:helm_principal]`
- React `PermissionContext` / `usePermission` / `PiiField` / `AuditTrailTab` available

**Repo layout this plan touches:**

```
~/Homebase1/                                                   (existing monolith)
  app/admin/users.rb                                           ← READ ONLY (extract from)
  app/services/identity/users/                                 ← create dir if absent
    send_verification_sms.rb                                   ← new
    issue_impersonation_token.rb                               ← new
  app/api/rpa_api/v1/users_api.rb                              ← extend (2 POST routes)
  app/api/rpa_api/v1/entities/                                 ← extend (2 new entities)
    verification_result.rb                                     ← new
    impersonation_token.rb                                     ← new
  spec/services/identity/users/                                ← new (2 specs)
  spec/requests/api/rpa_api/v1/users_api_spec.rb               ← extend

~/helm/helm/                                                   (Helm Rails + React)
  app/api/helm_api/v1/
    users_api.rb                                               ← new
    base.rb                                                    ← extend (mount UsersApi)
  app/entities/                                                ← new dir
    user.rb                                                    ← new (PII-conditional Grape-Entity)
    verification_result.rb                                     ← new
    impersonation_token.rb                                     ← new
  app/services/hb1_client/
    users.rb                                                   ← new
  spec/entities/user_spec.rb                                   ← new
  spec/services/hb1_client/users_spec.rb                       ← new
  spec/requests/users_spec.rb                                  ← new
  client-helm/src/
    App.tsx                                                    ← extend (routes + nav)
    lib/users.ts                                               ← new (typed API helpers)
    pages/UserLookup/
      IndexPage.tsx                                            ← new
      ShowPage.tsx                                             ← new
      ImpersonateModal.tsx                                     ← new
      IndexPage.test.tsx, ShowPage.test.tsx, ImpersonateModal.test.tsx
```

**Contract between HB1 and Helm (the JSON shape Helm expects):**

```
GET /api/rpa_api/v1/users/:id
  → {
      "id": 123,
      "email": "user@example.com",
      "full_name": "Jane Doe",
      "phone": "+15555550123",          # PII
      "ssn_last4": "1234",              # PII
      "bank_last4": "5678",             # PII
      "created_at": "2025-01-01T00:00:00Z",
      "last_sign_in_at": "2026-06-08T10:00:00Z",
      "stytch_subject": "stytch-user-abc"
    }

GET /api/rpa_api/v1/users?q=<query>
  → [{ "id": 123, "email": "...", "full_name": "..." }, ...]   # up to 25 results

POST /api/rpa_api/v1/users/:id/verification_sms
  → { "sent_at": "2026-06-09T17:00:00Z", "provider_request_id": "twilio-msg-xyz" }

POST /api/rpa_api/v1/users/:id/impersonation_token
  → { "url": "https://hb1.local/login_as/abc...", "expires_at": "2026-06-09T17:10:00Z" }
```

---

## Section A — HB1 changes

> **All Section A tasks run in `~/Homebase1`.** Each task begins with `cd ~/Homebase1`.

### Task A1: Locate the existing admin actions (read-only orientation)

**Files:**
- Read: `app/admin/users.rb`, `app/api/rpa_api/v1/users_api.rb`

- [ ] **Step 1: Find the verification SMS admin action**

```bash
cd ~/Homebase1
grep -n "send_verification_sms\|verification_sms" app/admin/users.rb
```

Expected: one or more line numbers around a `member_action :send_verification_sms` block. Note the body — that's the logic Task A2 extracts.

- [ ] **Step 2: Find the impersonation/login_user admin action**

```bash
grep -n "login_user\|collection_action :login_user\|member_action.*impersonat" app/admin/users.rb
```

Expected: a `collection_action :login_user` or similar that mints a one-time URL. Read the body — that's the logic Task A3 extracts.

- [ ] **Step 3: Confirm the existing rpa_api users endpoint surface**

```bash
grep -nE "^\s*(resource|route_param|get|post)" app/api/rpa_api/v1/users_api.rb | head -30
```

Expected: see existing `resource :users do ... route_param :id ...` structure. Task A4/A5 add `post :verification_sms` and `post :impersonation_token` under the same `route_param`.

- [ ] **Step 4: Confirm how authentication works on rpa_api**

```bash
grep -rn "current_token_actor\|before\b.*auth\|helpers.*Auth" app/api/rpa_api/v1/ | head -10
```

Note the helper name (e.g., `current_token_actor`, `current_admin`, etc.) — Tasks A4/A5 will pass that into the new services as the `actor:` parameter.

- [ ] **Step 5: Check what test framework rpa_api uses**

```bash
ls spec/requests/api/rpa_api/v1/ 2>&1 | head -5
ls spec/services/identity/ 2>&1 | head -5
```

If `spec/services/identity/` doesn't exist, you'll create it in Task A2. If `spec/requests/api/rpa_api/v1/users_api_spec.rb` exists, you'll extend it; otherwise create it in Task A4.

This task does NOT commit — it's orientation. Write down the helper name from Step 4 and the line numbers from Steps 1–2; you'll need them shortly.

### Task A2: Extract `Identity::Users::SendVerificationSms` service

**Files:**
- Create: `app/services/identity/users/send_verification_sms.rb`
- Create: `spec/services/identity/users/send_verification_sms_spec.rb`
- Read: `app/admin/users.rb` (the `send_verification_sms` member_action)

- [ ] **Step 1: Write the failing service spec**

Create `spec/services/identity/users/send_verification_sms_spec.rb`. The shape:

```ruby
require "rails_helper"

RSpec.describe Identity::Users::SendVerificationSms do
  let(:user) { create(:user, phone: "+15555550123") }

  it "delegates to the existing SMS sender and returns a Result" do
    sender = class_double("TheExistingSmsSenderConst").as_stubbed_const
    expect(sender).to receive(:send_phone_verification_sms!).with(user)
      .and_return(double(sid: "twilio-msg-xyz"))

    result = described_class.call(user: user)
    expect(result.sent_at).to be_within(2.seconds).of(Time.current)
    expect(result.provider_request_id).to eq("twilio-msg-xyz")
  end

  it "raises if the user has no phone" do
    user.update!(phone: nil)
    expect { described_class.call(user: user) }
      .to raise_error(described_class::MissingPhone)
  end
end
```

**Before pasting:** replace `TheExistingSmsSenderConst` and the sender method name with the actual class/method called from the `send_verification_sms` block in `app/admin/users.rb`. (From Task A1 Step 1.)

- [ ] **Step 2: Run the spec — it should fail**

```bash
bundle exec rspec spec/services/identity/users/send_verification_sms_spec.rb
```

Expected: `NameError: uninitialized constant Identity`.

- [ ] **Step 3: Implement the service by extracting the admin action body**

Create `app/services/identity/users/send_verification_sms.rb`:

```ruby
module Identity
  module Users
    class SendVerificationSms
      Result = Struct.new(:sent_at, :provider_request_id, keyword_init: true)
      class MissingPhone < StandardError; end

      def self.call(user:)
        new(user).call
      end

      def initialize(user)
        @user = user
      end

      def call
        raise MissingPhone, "user ##{@user.id} has no phone" if @user.phone.blank?

        # PASTE the existing send_verification_sms body from app/admin/users.rb here,
        # replacing references to `user` with `@user`. Capture whatever the underlying
        # sender returns and surface its message/request id as provider_request_id.
        response = TheExistingSmsSenderConst.send_phone_verification_sms!(@user)

        Result.new(
          sent_at:             Time.current,
          provider_request_id: response.sid
        )
      end
    end
  end
end
```

**Replace `TheExistingSmsSenderConst` and `.send_phone_verification_sms!` with the real class/method** identified in Task A1.

- [ ] **Step 4: Run the spec — should pass**

```bash
bundle exec rspec spec/services/identity/users/send_verification_sms_spec.rb
```

Expected: 2 examples, 0 failures.

- [ ] **Step 5: Verify the admin action still works — replace its body with a call to the service**

In `app/admin/users.rb`, find the `member_action :send_verification_sms` block and replace its body with:

```ruby
member_action :send_verification_sms, method: :post do
  Identity::Users::SendVerificationSms.call(user: resource)
  redirect_to admin_user_path(resource), notice: "Verification SMS sent."
end
```

This is the Strangler Fig step — ActiveAdmin still works, the logic lives in one place, and the new Grape route in Task A4 will call the same service.

- [ ] **Step 6: Run the existing admin specs (if any)**

```bash
bundle exec rspec spec/admin/users_spec.rb 2>&1 | tail -20
```

Expected: existing admin specs pass (or there are none and the command exits cleanly). If you have system specs covering this action, run those too.

- [ ] **Step 7: Commit**

```bash
git add app/services/identity/users/send_verification_sms.rb \
        spec/services/identity/users/send_verification_sms_spec.rb \
        app/admin/users.rb
git commit -m "feat(identity): extract SendVerificationSms service; admin action delegates"
```

### Task A3: Extract `Identity::Users::IssueImpersonationToken` service

**Files:**
- Create: `app/services/identity/users/issue_impersonation_token.rb`
- Create: `spec/services/identity/users/issue_impersonation_token_spec.rb`
- Modify: `app/admin/users.rb` (the `login_user`/impersonation action)

- [ ] **Step 1: Re-read the `login_user` admin block from Task A1 Step 2**

The body typically does three things: (a) verify the actor can impersonate, (b) mint a signed URL or session token, (c) redirect or render the URL. The service only needs (b) — (a) is the actor's permission (Helm enforces it) and (c) is the controller's responsibility.

- [ ] **Step 2: Write the failing service spec**

Create `spec/services/identity/users/issue_impersonation_token_spec.rb`:

```ruby
require "rails_helper"

RSpec.describe Identity::Users::IssueImpersonationToken do
  let(:target) { create(:user) }
  let(:actor)  { create(:user, role: "admin") }

  it "returns a Result with url and expires_at" do
    result = described_class.call(user: target, actor: actor)
    expect(result.url).to match(%r{/login_as/})
    expect(result.expires_at).to be_within(15.minutes + 1.second).of(Time.current + 15.minutes)
  end

  it "expires_at is in the future" do
    result = described_class.call(user: target, actor: actor)
    expect(result.expires_at).to be > Time.current
  end
end
```

If the existing `login_user` action uses a TTL other than 15 minutes, change the spec to match.

- [ ] **Step 3: Run — should fail**

```bash
bundle exec rspec spec/services/identity/users/issue_impersonation_token_spec.rb
```

Expected: `NameError`.

- [ ] **Step 4: Implement**

Create `app/services/identity/users/issue_impersonation_token.rb`:

```ruby
module Identity
  module Users
    class IssueImpersonationToken
      Result = Struct.new(:url, :expires_at, keyword_init: true)

      DEFAULT_TTL = 15.minutes

      def self.call(user:, actor:, ttl: DEFAULT_TTL)
        new(user, actor, ttl).call
      end

      def initialize(user, actor, ttl)
        @user  = user
        @actor = actor
        @ttl   = ttl
      end

      def call
        # PASTE the URL-minting logic from the existing login_user action here.
        # The pattern usually involves a signed_id / one-time-token style URL.
        token = @user.signed_id(purpose: :impersonation, expires_in: @ttl)
        url   = Rails.application.routes.url_helpers.login_as_url(
                  token, host: ENV.fetch("HB1_HOST", "localhost:3000")
                )

        Result.new(url: url, expires_at: @ttl.from_now)
      end
    end
  end
end
```

**Replace the `signed_id` + `login_as_url` snippet** with the actual URL-construction logic from `app/admin/users.rb`'s `login_user` block. If that block uses a session-creation pattern instead (e.g., creates a row in `impersonation_sessions`), reproduce that exactly.

- [ ] **Step 5: Run — should pass**

```bash
bundle exec rspec spec/services/identity/users/issue_impersonation_token_spec.rb
```

Expected: 2 examples, 0 failures.

- [ ] **Step 6: Replace the admin action body with a service call**

In `app/admin/users.rb`, find the `login_user` (or equivalent impersonation) action and replace its URL-minting body with:

```ruby
collection_action :login_user, method: :post do
  target = User.find(params[:user_id])
  result = Identity::Users::IssueImpersonationToken.call(user: target, actor: current_admin_user)
  redirect_to result.url, allow_other_host: true
end
```

Adjust `current_admin_user` to match the actual actor reference in your admin layer.

- [ ] **Step 7: Run admin specs again**

```bash
bundle exec rspec spec/admin/users_spec.rb 2>&1 | tail -20
```

Expected: pass.

- [ ] **Step 8: Commit**

```bash
git add app/services/identity/users/issue_impersonation_token.rb \
        spec/services/identity/users/issue_impersonation_token_spec.rb \
        app/admin/users.rb
git commit -m "feat(identity): extract IssueImpersonationToken service; admin action delegates"
```

### Task A4: Add `POST /api/rpa_api/v1/users/:id/verification_sms`

**Files:**
- Modify: `app/api/rpa_api/v1/users_api.rb`
- Create (if absent) or modify: `app/api/rpa_api/v1/entities/verification_result.rb`
- Modify or create: `spec/requests/api/rpa_api/v1/users_api_spec.rb`

- [ ] **Step 1: Write the failing request spec**

Append to `spec/requests/api/rpa_api/v1/users_api_spec.rb` (or create it):

```ruby
require "rails_helper"

RSpec.describe "RpaApi V1 Users — verification_sms" do
  let(:user)  { create(:user, phone: "+15555550123") }
  let(:token) { ENV.fetch("RPA_API_TOKEN", "test-token") }

  it "POST /api/rpa_api/v1/users/:id/verification_sms returns sent_at + provider_request_id" do
    allow(Identity::Users::SendVerificationSms).to receive(:call)
      .with(user: user)
      .and_return(Identity::Users::SendVerificationSms::Result.new(
        sent_at: Time.parse("2026-06-09T17:00:00Z"),
        provider_request_id: "twilio-msg-xyz"
      ))

    post "/api/rpa_api/v1/users/#{user.id}/verification_sms",
         headers: { "Authorization" => "Bearer #{token}" }

    expect(response).to have_http_status(:created).or have_http_status(:ok)
    body = JSON.parse(response.body)
    expect(body).to include("sent_at" => "2026-06-09T17:00:00Z",
                            "provider_request_id" => "twilio-msg-xyz")
  end

  it "401s without bearer token" do
    post "/api/rpa_api/v1/users/#{user.id}/verification_sms"
    expect(response).to have_http_status(:unauthorized)
  end
end
```

- [ ] **Step 2: Run — should fail**

```bash
bundle exec rspec spec/requests/api/rpa_api/v1/users_api_spec.rb
```

Expected: 404 / route-missing failures.

- [ ] **Step 3: Create the entity**

Create `app/api/rpa_api/v1/entities/verification_result.rb` (mirror the pattern of any existing entity in that dir):

```ruby
module RpaApi
  module V1
    module Entities
      class VerificationResult < Grape::Entity
        expose :sent_at do |obj|
          obj.sent_at.iso8601
        end
        expose :provider_request_id
      end
    end
  end
end
```

- [ ] **Step 4: Add the POST route**

In `app/api/rpa_api/v1/users_api.rb`, inside the existing `route_param :id, type: Integer do ... end`, add:

```ruby
desc "Send phone verification SMS to user"
post :verification_sms do
  user   = User.find(params[:id])
  result = Identity::Users::SendVerificationSms.call(user: user)
  present(result, with: Entities::VerificationResult)
end
```

If the existing `route_param :id` uses a different name (e.g., `:user_id`) or a different `User.find` pattern, follow that pattern instead.

- [ ] **Step 5: Run the spec**

```bash
bundle exec rspec spec/requests/api/rpa_api/v1/users_api_spec.rb
```

Expected: 2 examples, 0 failures.

- [ ] **Step 6: Manual smoke**

```bash
bin/rails server -p 3000 &
sleep 3
curl -s -X POST -H "Authorization: Bearer $(rails runner 'puts ENV.fetch(\"RPA_API_TOKEN\", \"test-token\")')" \
  http://localhost:3000/api/rpa_api/v1/users/1/verification_sms | jq
kill %1
```

Expected: a JSON response with `sent_at` and `provider_request_id`. (Replace user id 1 with a real one in your dev DB.)

- [ ] **Step 7: Commit**

```bash
git add app/api/rpa_api/v1/users_api.rb \
        app/api/rpa_api/v1/entities/verification_result.rb \
        spec/requests/api/rpa_api/v1/users_api_spec.rb
git commit -m "feat(rpa_api): POST /users/:id/verification_sms via SendVerificationSms service"
```

### Task A5: Add `POST /api/rpa_api/v1/users/:id/impersonation_token`

**Files:**
- Modify: `app/api/rpa_api/v1/users_api.rb`
- Create: `app/api/rpa_api/v1/entities/impersonation_token.rb`
- Modify: `spec/requests/api/rpa_api/v1/users_api_spec.rb`

- [ ] **Step 1: Write the failing spec**

Append to `spec/requests/api/rpa_api/v1/users_api_spec.rb`:

```ruby
RSpec.describe "RpaApi V1 Users — impersonation_token" do
  let(:user)  { create(:user) }
  let(:token) { ENV.fetch("RPA_API_TOKEN", "test-token") }

  it "POST /api/rpa_api/v1/users/:id/impersonation_token returns url + expires_at" do
    allow(Identity::Users::IssueImpersonationToken).to receive(:call)
      .with(user: user, actor: kind_of(User))
      .and_return(Identity::Users::IssueImpersonationToken::Result.new(
        url: "https://hb1.local/login_as/abc",
        expires_at: Time.parse("2026-06-09T17:10:00Z")
      ))

    post "/api/rpa_api/v1/users/#{user.id}/impersonation_token",
         headers: { "Authorization" => "Bearer #{token}" }

    expect(response).to have_http_status(:created).or have_http_status(:ok)
    body = JSON.parse(response.body)
    expect(body).to eq("url" => "https://hb1.local/login_as/abc",
                       "expires_at" => "2026-06-09T17:10:00Z")
  end
end
```

If your `current_token_actor` helper returns something other than a `User`, change `kind_of(User)` to match. If you have no concept of an actor on the rpa_api (the token represents a service), drop the `actor:` argument and adjust the service call in Step 4 to pass `actor: nil` or a system stub.

- [ ] **Step 2: Run — should fail**

```bash
bundle exec rspec spec/requests/api/rpa_api/v1/users_api_spec.rb
```

Expected: 404.

- [ ] **Step 3: Create the entity**

Create `app/api/rpa_api/v1/entities/impersonation_token.rb`:

```ruby
module RpaApi
  module V1
    module Entities
      class ImpersonationToken < Grape::Entity
        expose :url
        expose :expires_at do |obj|
          obj.expires_at.iso8601
        end
      end
    end
  end
end
```

- [ ] **Step 4: Add the POST route**

In `app/api/rpa_api/v1/users_api.rb`, inside the `route_param :id` block (under the verification_sms route from Task A4):

```ruby
desc "Mint a one-time impersonation URL"
post :impersonation_token do
  user   = User.find(params[:id])
  result = Identity::Users::IssueImpersonationToken.call(user: user, actor: current_token_actor)
  present(result, with: Entities::ImpersonationToken)
end
```

Replace `current_token_actor` with whatever helper the rpa_api uses (from Task A1 Step 4).

- [ ] **Step 5: Run spec**

```bash
bundle exec rspec spec/requests/api/rpa_api/v1/users_api_spec.rb
```

Expected: all examples in the file pass.

- [ ] **Step 6: Smoke test**

```bash
bin/rails server -p 3000 &
sleep 3
curl -s -X POST -H "Authorization: Bearer test-token" \
  http://localhost:3000/api/rpa_api/v1/users/1/impersonation_token | jq
kill %1
```

Expected: a JSON response with `url` and `expires_at`.

- [ ] **Step 7: Commit**

```bash
git add app/api/rpa_api/v1/users_api.rb \
        app/api/rpa_api/v1/entities/impersonation_token.rb \
        spec/requests/api/rpa_api/v1/users_api_spec.rb
git commit -m "feat(rpa_api): POST /users/:id/impersonation_token via IssueImpersonationToken service"
```

### Task A6: Verify `GET /api/rpa_api/v1/users/:id` returns the fields Helm needs

**Files:**
- Modify (if needed): `app/api/rpa_api/v1/entities/user.rb`
- Modify (if needed): `app/api/rpa_api/v1/users_api.rb`

- [ ] **Step 1: Inspect what the GET endpoint currently returns**

```bash
bin/rails server -p 3000 &
sleep 3
curl -s -H "Authorization: Bearer test-token" http://localhost:3000/api/rpa_api/v1/users/1 | jq 'keys'
kill %1
```

Compare against the contract in this plan's header. Required keys:
`id, email, full_name, phone, ssn_last4, bank_last4, created_at, last_sign_in_at, stytch_subject`.

- [ ] **Step 2: If any key is missing, add an `expose` line to the entity**

Open `app/api/rpa_api/v1/entities/user.rb` and add the missing fields, e.g.:

```ruby
expose :phone
expose :ssn_last4 do |user|
  user.ssn&.last(4)
end
expose :bank_last4 do |user|
  user.bank_account&.account_number&.last(4)
end
expose :stytch_subject
expose :last_sign_in_at do |user|
  user.last_sign_in_at&.iso8601
end
```

(Some fields may live on associated models — adjust accordingly. The goal is that Helm's `UserEntity` receives all of these directly from HB1.)

- [ ] **Step 3: Smoke test the GET endpoint again**

```bash
bin/rails server -p 3000 &
sleep 3
curl -s -H "Authorization: Bearer test-token" http://localhost:3000/api/rpa_api/v1/users/1 | jq
kill %1
```

Expected: all 9 contract keys present.

- [ ] **Step 4: Commit (skip if the entity already had everything)**

```bash
git add app/api/rpa_api/v1/entities/user.rb
git commit -m "feat(rpa_api): expose phone/ssn_last4/bank_last4/stytch_subject for Helm consumption"
```

---

## Section B — Helm BFF

> **All Section B tasks run in `~/helm/helm`.** Each task begins with `cd ~/helm/helm`.

### Task B1: `Entities::User` with PII gating

**Files:**
- Create: `app/entities/user.rb`
- Create: `spec/entities/user_spec.rb`
- Modify: `config/application.rb` (autoload `app/entities`)

- [ ] **Step 1: Add `app/entities` to autoload paths**

In `config/application.rb`, change:

```ruby
    config.autoload_paths       += %W[#{config.root}/app/api #{config.root}/app/middleware]
    config.eager_load_paths     += %W[#{config.root}/app/api #{config.root}/app/middleware]
```

to:

```ruby
    config.autoload_paths       += %W[#{config.root}/app/api #{config.root}/app/middleware #{config.root}/app/entities]
    config.eager_load_paths     += %W[#{config.root}/app/api #{config.root}/app/middleware #{config.root}/app/entities]
```

- [ ] **Step 2: Confirm Rails still boots**

```bash
bin/rails runner 'puts "ok"'
```

Expected: `ok`.

- [ ] **Step 3: Write the failing entity spec**

Create `spec/entities/user_spec.rb`:

```ruby
require "rails_helper"

RSpec.describe Entities::User do
  let(:source) do
    {
      "id" => 123, "email" => "u@h.com", "full_name" => "Jane Doe",
      "phone" => "+15555550123", "ssn_last4" => "1234", "bank_last4" => "5678",
      "created_at" => "2025-01-01T00:00:00Z", "last_sign_in_at" => "2026-06-08T10:00:00Z",
      "stytch_subject" => "stytch-user-abc"
    }
  end

  def principal(role) = PermissionService::Principal.new(id: 1, role: role, stytch_subject: nil)

  it "omits PII fields and lists them in _redacted when role lacks account.view_pii" do
    json = described_class.represent(source, role: principal("cs_t1_agent")).serializable_hash
    expect(json).not_to have_key(:phone)
    expect(json).not_to have_key(:ssn_last4)
    expect(json).not_to have_key(:bank_last4)
    expect(json[:_redacted]).to match_array(%w[phone ssn_last4 bank_last4])
  end

  it "includes PII fields and an empty _redacted when role has account.view_pii" do
    json = described_class.represent(source, role: principal("cs_t2_payments")).serializable_hash
    expect(json[:phone]).to eq("+15555550123")
    expect(json[:ssn_last4]).to eq("1234")
    expect(json[:bank_last4]).to eq("5678")
    expect(json[:_redacted]).to eq([])
  end

  it "always exposes non-PII fields" do
    json = described_class.represent(source, role: principal("cs_t1_agent")).serializable_hash
    expect(json).to include(
      id: 123, email: "u@h.com", full_name: "Jane Doe",
      stytch_subject: "stytch-user-abc"
    )
  end
end
```

- [ ] **Step 4: Run — should fail**

```bash
bundle exec rspec spec/entities/user_spec.rb
```

Expected: `uninitialized constant Entities::User`.

- [ ] **Step 5: Implement the entity**

Create `app/entities/user.rb`:

```ruby
module Entities
  class User < Grape::Entity
    PII_FIELDS = %w[phone ssn_last4 bank_last4].freeze

    expose :id
    expose :email
    expose :full_name
    expose :created_at
    expose :last_sign_in_at
    expose :stytch_subject

    with_options(if: ->(_obj, opts) { opts[:role]&.can?("account.view_pii") }) do
      expose :phone
      expose :ssn_last4
      expose :bank_last4
    end

    expose :_redacted do |_obj, opts|
      opts[:role]&.can?("account.view_pii") ? [] : PII_FIELDS
    end

    private

    # Grape-Entity reads attributes via [] on Hashes and via method dispatch on objects.
    # Source is a Hash from HB1, so wrap the keys to be string-or-symbol tolerant.
    def value_for_attr(attr, _opts = {})
      object.is_a?(Hash) ? (object[attr.to_s] || object[attr]) : object.public_send(attr)
    end
  end
end
```

- [ ] **Step 6: Run — should pass**

```bash
bundle exec rspec spec/entities/user_spec.rb
```

Expected: 3 examples, 0 failures. If you see failures because Grape-Entity isn't reading Hash keys, replace each `expose :foo` with `expose(:foo) { |obj| obj["foo"] || obj[:foo] }`.

- [ ] **Step 7: Commit**

```bash
git add app/entities/user.rb spec/entities/user_spec.rb config/application.rb
git commit -m "feat(helm): Entities::User with PII conditional on account.view_pii"
```

### Task B2: `Entities::VerificationResult` and `Entities::ImpersonationToken`

**Files:**
- Create: `app/entities/verification_result.rb`
- Create: `app/entities/impersonation_token.rb`
- Create: `spec/entities/verification_result_spec.rb`
- Create: `spec/entities/impersonation_token_spec.rb`

- [ ] **Step 1: Write a small spec for each**

Create `spec/entities/verification_result_spec.rb`:

```ruby
require "rails_helper"

RSpec.describe Entities::VerificationResult do
  it "passes through sent_at and provider_request_id" do
    json = described_class.represent(
      { "sent_at" => "2026-06-09T17:00:00Z", "provider_request_id" => "twilio-msg-xyz" }
    ).serializable_hash
    expect(json).to eq(sent_at: "2026-06-09T17:00:00Z", provider_request_id: "twilio-msg-xyz")
  end
end
```

Create `spec/entities/impersonation_token_spec.rb`:

```ruby
require "rails_helper"

RSpec.describe Entities::ImpersonationToken do
  it "passes through url and expires_at" do
    json = described_class.represent(
      { "url" => "https://hb1.local/login_as/abc", "expires_at" => "2026-06-09T17:10:00Z" }
    ).serializable_hash
    expect(json).to eq(url: "https://hb1.local/login_as/abc", expires_at: "2026-06-09T17:10:00Z")
  end
end
```

- [ ] **Step 2: Run — should fail**

```bash
bundle exec rspec spec/entities/verification_result_spec.rb spec/entities/impersonation_token_spec.rb
```

Expected: `uninitialized constant`.

- [ ] **Step 3: Implement both entities**

Create `app/entities/verification_result.rb`:

```ruby
module Entities
  class VerificationResult < Grape::Entity
    expose(:sent_at)             { |obj| obj.is_a?(Hash) ? (obj["sent_at"] || obj[:sent_at]) : obj.sent_at }
    expose(:provider_request_id) { |obj| obj.is_a?(Hash) ? (obj["provider_request_id"] || obj[:provider_request_id]) : obj.provider_request_id }
  end
end
```

Create `app/entities/impersonation_token.rb`:

```ruby
module Entities
  class ImpersonationToken < Grape::Entity
    expose(:url)        { |obj| obj.is_a?(Hash) ? (obj["url"] || obj[:url]) : obj.url }
    expose(:expires_at) { |obj| obj.is_a?(Hash) ? (obj["expires_at"] || obj[:expires_at]) : obj.expires_at }
  end
end
```

- [ ] **Step 4: Run — should pass**

```bash
bundle exec rspec spec/entities/verification_result_spec.rb spec/entities/impersonation_token_spec.rb
```

Expected: 2 examples, 0 failures.

- [ ] **Step 5: Commit**

```bash
git add app/entities/verification_result.rb app/entities/impersonation_token.rb \
        spec/entities/verification_result_spec.rb spec/entities/impersonation_token_spec.rb
git commit -m "feat(helm): Entities for VerificationResult and ImpersonationToken"
```

### Task B3: `Hb1Client::Users`

**Files:**
- Create: `app/services/hb1_client/users.rb`
- Create: `spec/services/hb1_client/users_spec.rb`

- [ ] **Step 1: Write the failing spec**

Create `spec/services/hb1_client/users_spec.rb`:

```ruby
require "rails_helper"

RSpec.describe Hb1Client::Users do
  before do
    ENV["HB1_API_BASE_URL"] = "https://hb1.test"
    ENV["HB1_API_TOKEN"]    = "test-token"
  end

  describe ".show" do
    it "GETs /api/rpa_api/v1/users/:id and returns the parsed body" do
      stub_request(:get, "https://hb1.test/api/rpa_api/v1/users/42")
        .to_return(status: 200, body: { id: 42, email: "u@h.com" }.to_json,
                   headers: { "Content-Type" => "application/json" })
      expect(described_class.show(42)).to eq("id" => 42, "email" => "u@h.com")
    end
  end

  describe ".search" do
    it "GETs /api/rpa_api/v1/users with the q param" do
      stub_request(:get, "https://hb1.test/api/rpa_api/v1/users")
        .with(query: { q: "jane" })
        .to_return(status: 200, body: [{ id: 1, email: "jane@h.com" }].to_json,
                   headers: { "Content-Type" => "application/json" })
      results = described_class.search("jane")
      expect(results).to eq([{ "id" => 1, "email" => "jane@h.com" }])
    end
  end

  describe ".send_verification_sms" do
    it "POSTs and returns the body" do
      stub_request(:post, "https://hb1.test/api/rpa_api/v1/users/42/verification_sms")
        .to_return(status: 201, body: { sent_at: "now", provider_request_id: "x" }.to_json,
                   headers: { "Content-Type" => "application/json" })
      expect(described_class.send_verification_sms(42))
        .to eq("sent_at" => "now", "provider_request_id" => "x")
    end
  end

  describe ".issue_impersonation_token" do
    it "POSTs and returns the body" do
      stub_request(:post, "https://hb1.test/api/rpa_api/v1/users/42/impersonation_token")
        .to_return(status: 201, body: { url: "https://hb1/login_as/x", expires_at: "later" }.to_json,
                   headers: { "Content-Type" => "application/json" })
      expect(described_class.issue_impersonation_token(42))
        .to eq("url" => "https://hb1/login_as/x", "expires_at" => "later")
    end
  end
end
```

- [ ] **Step 2: Run — should fail**

```bash
bundle exec rspec spec/services/hb1_client/users_spec.rb
```

Expected: `uninitialized constant Hb1Client::Users`.

- [ ] **Step 3: Implement**

Create `app/services/hb1_client/users.rb`:

```ruby
module Hb1Client
  class Users
    def self.show(id)
      Base.get("/api/rpa_api/v1/users/#{id}")
    end

    def self.search(query)
      Base.get("/api/rpa_api/v1/users", params: { q: query })
    end

    def self.send_verification_sms(id)
      Base.post("/api/rpa_api/v1/users/#{id}/verification_sms")
    end

    def self.issue_impersonation_token(id)
      Base.post("/api/rpa_api/v1/users/#{id}/impersonation_token")
    end
  end
end
```

- [ ] **Step 4: Run — should pass**

```bash
bundle exec rspec spec/services/hb1_client/users_spec.rb
```

Expected: 4 examples, 0 failures.

- [ ] **Step 5: Commit**

```bash
git add app/services/hb1_client/users.rb spec/services/hb1_client/users_spec.rb
git commit -m "feat(helm): Hb1Client::Users (show/search/verification_sms/impersonation_token)"
```

### Task B4: `HelmApi::V1::UsersApi`

**Files:**
- Create: `app/api/helm_api/v1/users_api.rb`
- Modify: `app/api/helm_api/v1/base.rb` (mount UsersApi)
- Create: `spec/requests/users_spec.rb`

- [ ] **Step 1: Write the failing request spec**

Create `spec/requests/users_spec.rb`:

```ruby
require "rails_helper"

RSpec.describe "Helm UsersApi" do
  let(:base) { "/helm_api/v1/users" }
  let(:hb1_show) do
    {
      "id" => 42, "email" => "u@h.com", "full_name" => "Jane Doe",
      "phone" => "+15555550123", "ssn_last4" => "1234", "bank_last4" => "5678",
      "created_at" => "2025-01-01T00:00:00Z", "last_sign_in_at" => "2026-06-08T10:00:00Z",
      "stytch_subject" => "stytch-user-abc"
    }
  end

  before do
    ENV["HB1_API_BASE_URL"] = "https://hb1.test"
    ENV["HB1_API_TOKEN"]    = "test-token"
    AdminUser.find_or_create_by!(email: "cs_t1_agent@helm.local") do |u|
      u.full_name = "CS T1"; u.role = "cs_t1_agent"
    end
  end

  describe "GET /helm_api/v1/users/:id" do
    before do
      stub_request(:get, "https://hb1.test/api/rpa_api/v1/users/42")
        .to_return(status: 200, body: hb1_show.to_json,
                   headers: { "Content-Type" => "application/json" })
    end

    it "omits PII fields for cs_t1_agent" do
      get "#{base}/42", headers: { "Cookie" => "HELM_DEMO_ROLE=cs_t1_agent" }
      body = JSON.parse(response.body)
      expect(response).to have_http_status(200)
      expect(body).not_to have_key("phone")
      expect(body["_redacted"]).to match_array(%w[phone ssn_last4 bank_last4])
    end

    it "exposes PII fields for cs_t2_payroll" do
      get "#{base}/42", headers: { "Cookie" => "HELM_DEMO_ROLE=cs_t2_payroll" }
      body = JSON.parse(response.body)
      expect(body["phone"]).to eq("+15555550123")
      expect(body["_redacted"]).to eq([])
    end
  end

  describe "GET /helm_api/v1/users?q=" do
    it "returns matching results for q" do
      stub_request(:get, "https://hb1.test/api/rpa_api/v1/users")
        .with(query: { q: "jane" })
        .to_return(status: 200,
                   body: [{ id: 1, email: "jane@h.com", full_name: "Jane Doe" }].to_json,
                   headers: { "Content-Type" => "application/json" })

      get "#{base}?q=jane", headers: { "Cookie" => "HELM_DEMO_ROLE=cs_t1_agent" }
      body = JSON.parse(response.body)
      expect(body.length).to eq(1)
      expect(body.first["email"]).to eq("jane@h.com")
    end
  end

  describe "POST /helm_api/v1/users/:id/verification_sms" do
    let(:hb1_result) { { "sent_at" => "2026-06-09T17:00:00Z", "provider_request_id" => "twilio-msg-xyz" } }

    it "403s for cs_t3_ops (lacks verify_phone)" do
      post "#{base}/42/verification_sms", headers: { "Cookie" => "HELM_DEMO_ROLE=cs_t3_ops" }
      expect(response).to have_http_status(403)
    end

    it "200s for cs_t1_agent and writes one audit event" do
      stub_request(:post, "https://hb1.test/api/rpa_api/v1/users/42/verification_sms")
        .to_return(status: 201, body: hb1_result.to_json,
                   headers: { "Content-Type" => "application/json" })

      expect {
        post "#{base}/42/verification_sms", headers: { "Cookie" => "HELM_DEMO_ROLE=cs_t1_agent" }
      }.to change(AuditEvent, :count).by(1)

      expect(response).to have_http_status(200)
      body = JSON.parse(response.body)
      expect(body).to eq("sent_at" => "2026-06-09T17:00:00Z", "provider_request_id" => "twilio-msg-xyz")
      event = AuditEvent.last
      expect(event.action).to        eq("user.verification_sms_sent")
      expect(event.resource_type).to eq("User")
      expect(event.resource_id).to   eq(42)
    end
  end

  describe "POST /helm_api/v1/users/:id/impersonate" do
    let(:hb1_token) { { "url" => "https://hb1.local/login_as/abc", "expires_at" => "2026-06-09T17:10:00Z" } }

    it "403s for cs_t1_agent" do
      post "#{base}/42/impersonate", headers: { "Cookie" => "HELM_DEMO_ROLE=cs_t1_agent" }
      expect(response).to have_http_status(403)
    end

    it "200s for cs_t2_escalations and writes one audit event tagged user.impersonation_started" do
      stub_request(:post, "https://hb1.test/api/rpa_api/v1/users/42/impersonation_token")
        .to_return(status: 201, body: hb1_token.to_json,
                   headers: { "Content-Type" => "application/json" })

      expect {
        post "#{base}/42/impersonate", headers: { "Cookie" => "HELM_DEMO_ROLE=cs_t2_escalations" }
      }.to change(AuditEvent, :count).by(1)

      expect(response).to have_http_status(200)
      body = JSON.parse(response.body)
      expect(body).to eq("url" => "https://hb1.local/login_as/abc", "expires_at" => "2026-06-09T17:10:00Z")
      event = AuditEvent.last
      expect(event.action).to        eq("user.impersonation_started")
      expect(event.resource_type).to eq("User")
      expect(event.resource_id).to   eq(42)
    end
  end
end
```

- [ ] **Step 2: Run — should fail (no route)**

```bash
bundle exec rspec spec/requests/users_spec.rb
```

Expected: 404s.

- [ ] **Step 3: Implement `UsersApi`**

Create `app/api/helm_api/v1/users_api.rb`:

```ruby
module HelmApi
  module V1
    class UsersApi < Grape::API
      helpers AuthHelpers

      resource :users do
        params do
          optional :q, type: String
        end
        get do
          check_permission!("account.view_user", scope: {})
          Hb1Client::Users.search(params[:q].to_s)
        end

        route_param :id, type: Integer do
          get do
            check_permission!("account.view_user", scope: { human_id: params[:id] })
            user = Hb1Client::Users.show(params[:id])
            present user, with: Entities::User, role: current_principal
          end

          post :verification_sms do
            check_permission!("account.verify_phone", scope: { human_id: params[:id] })
            result = Hb1Client::Users.send_verification_sms(params[:id])
            AuditService.record(
              actor:         lookup_admin_user!,
              workflow:      "user_lookup",
              action:        "user.verification_sms_sent",
              resource_type: "User",
              resource_id:   params[:id],
              payload_after: { sent_at: result["sent_at"], provider_request_id: result["provider_request_id"] }
            )
            present result, with: Entities::VerificationResult
          end

          post :impersonate do
            check_permission!("account.impersonate_user", scope: { human_id: params[:id] })
            token = Hb1Client::Users.issue_impersonation_token(params[:id])
            AuditService.record(
              actor:         lookup_admin_user!,
              workflow:      "user_lookup",
              action:        "user.impersonation_started",
              resource_type: "User",
              resource_id:   params[:id],
              payload_after: { expires_at: token["expires_at"] }
            )
            present token, with: Entities::ImpersonationToken
          end
        end
      end

      helpers do
        def lookup_admin_user!
          admin = AdminUser.find_by(email: "#{current_principal.role}@helm.local")
          admin || AdminUser.create!(
            email: "#{current_principal.role}@helm.local",
            full_name: current_principal.role,
            role: current_principal.role
          )
        end
      end
    end
  end
end
```

The `lookup_admin_user!` helper bridges the demo principal (cookie-based, no DB row) to a real `AdminUser` row that `AuditService` requires. The seed script in Plan 1 already created one row per role at `<role>@helm.local`, so the find_by will usually hit.

- [ ] **Step 4: Mount `UsersApi` under `Base`**

In `app/api/helm_api/v1/base.rb`, alongside the existing mounts, add:

```ruby
      mount HelmApi::V1::UsersApi
```

- [ ] **Step 5: Run the request spec**

```bash
bundle exec rspec spec/requests/users_spec.rb
```

Expected: 7 examples, 0 failures.

- [ ] **Step 6: Run the full backend suite**

```bash
bundle exec rspec
```

Expected: all green (50+ examples).

- [ ] **Step 7: Commit**

```bash
git add app/api/helm_api/v1/users_api.rb app/api/helm_api/v1/base.rb spec/requests/users_spec.rb
git commit -m "feat(helm): HelmApi::V1::UsersApi (show/search/verification_sms/impersonate) with audit"
```

---

## Section C — Helm React

> **All Section C tasks run in `~/helm/helm`.** Frontend commands run from `client-helm/`.

### Task C1: Add react-router routes and top-level navigation

**Files:**
- Modify: `client-helm/src/App.tsx`

- [ ] **Step 1: Update `App.tsx` with routes and a nav link**

Replace `client-helm/src/App.tsx` with:

```tsx
import { Box, Button, Stack, Typography } from "@mui/material";
import { Route, Routes, Link as RouterLink, Navigate } from "react-router-dom";
import { PermissionProvider, useSession } from "./lib/permissions";
import { RoleSwitcher } from "./components/RoleSwitcher";
import { UserLookupIndexPage } from "./pages/UserLookup/IndexPage";
import { UserLookupShowPage } from "./pages/UserLookup/ShowPage";

function Header() {
  const { role } = useSession();
  return (
    <Stack direction="row" justifyContent="space-between" alignItems="center" p={2} borderBottom="1px solid #eee">
      <Stack direction="row" spacing={3} alignItems="center">
        <Typography variant="h5">Helm</Typography>
        <Button component={RouterLink} to="/users" size="small">User lookup</Button>
      </Stack>
      <Stack direction="row" spacing={2} alignItems="center">
        <Typography color="text.secondary">role: {role}</Typography>
        <RoleSwitcher />
      </Stack>
    </Stack>
  );
}

export default function App() {
  return (
    <PermissionProvider>
      <Box>
        <Header />
        <Box p={4}>
          <Routes>
            <Route path="/" element={<Navigate to="/users" replace />} />
            <Route path="/users"        element={<UserLookupIndexPage />} />
            <Route path="/users/:id"    element={<UserLookupShowPage />} />
          </Routes>
        </Box>
      </Box>
    </PermissionProvider>
  );
}
```

This will fail to compile until C2 and C3 create the page modules.

- [ ] **Step 2: Skip build (will fail until next tasks)**

No commit yet — we'll commit after C2/C3.

### Task C2: `UserLookupIndexPage` (debounced search)

**Files:**
- Create: `client-helm/src/lib/users.ts`
- Create: `client-helm/src/pages/UserLookup/IndexPage.tsx`
- Create: `client-helm/src/pages/UserLookup/IndexPage.test.tsx`

- [ ] **Step 1: Add the typed API helpers**

Create `client-helm/src/lib/users.ts`:

```ts
import { api } from "./api";

export type UserSummary = { id: number; email: string; full_name: string };

export type UserDetail = {
  id: number;
  email: string;
  full_name: string;
  created_at: string;
  last_sign_in_at: string | null;
  stytch_subject: string | null;
  phone?: string;
  ssn_last4?: string;
  bank_last4?: string;
  _redacted: string[];
};

export type VerificationResult   = { sent_at: string; provider_request_id: string };
export type ImpersonationToken   = { url: string; expires_at: string };

export const usersApi = {
  search: (q: string) => api.get<UserSummary[]>(`/helm_api/v1/users?q=${encodeURIComponent(q)}`),
  show:   (id: number | string) => api.get<UserDetail>(`/helm_api/v1/users/${id}`),
  verifySms:   (id: number | string) => api.post<VerificationResult>(`/helm_api/v1/users/${id}/verification_sms`),
  impersonate: (id: number | string) => api.post<ImpersonationToken>(`/helm_api/v1/users/${id}/impersonate`),
};
```

- [ ] **Step 2: Write the failing IndexPage spec**

Create `client-helm/src/pages/UserLookup/IndexPage.test.tsx`:

```tsx
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { UserLookupIndexPage } from "./IndexPage";

function wrap(ui: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={client}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});

describe("UserLookupIndexPage", () => {
  it("renders search results from the API", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => [{ id: 1, email: "jane@h.com", full_name: "Jane Doe" }],
    } as Response);

    render(wrap(<UserLookupIndexPage />));
    fireEvent.change(screen.getByLabelText(/search/i), { target: { value: "jane" } });

    await waitFor(() => {
      expect(screen.getByText("jane@h.com")).toBeInTheDocument();
      expect(screen.getByText("Jane Doe")).toBeInTheDocument();
    });
  });

  it("renders 'no results' when search returns empty", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true, json: async () => []
    } as Response);

    render(wrap(<UserLookupIndexPage />));
    fireEvent.change(screen.getByLabelText(/search/i), { target: { value: "nobody" } });

    await waitFor(() => {
      expect(screen.getByText(/no results/i)).toBeInTheDocument();
    });
  });
});
```

- [ ] **Step 3: Run — should fail**

```bash
cd client-helm && bun run test src/pages/UserLookup/IndexPage.test.tsx
```

Expected: module-not-found error.

- [ ] **Step 4: Implement the page**

Create `client-helm/src/pages/UserLookup/IndexPage.tsx`:

```tsx
import { useState, useMemo, useEffect } from "react";
import { Link as RouterLink } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Box, List, ListItem, ListItemText, TextField, Typography, CircularProgress } from "@mui/material";
import { usersApi, UserSummary } from "../../lib/users";

function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debounced;
}

export function UserLookupIndexPage() {
  const [q, setQ] = useState("");
  const debounced = useDebounced(q, 250);

  const { data, isFetching } = useQuery({
    queryKey: ["users", "search", debounced],
    queryFn: () => usersApi.search(debounced),
    enabled: debounced.length >= 1,
  });

  const results = useMemo(() => data ?? [], [data]);

  return (
    <Box>
      <Typography variant="h5" gutterBottom>User lookup</Typography>
      <TextField
        label="Search by email, phone, or id"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        fullWidth
        autoFocus
      />
      <Box mt={2}>
        {isFetching && <CircularProgress size={20} />}
        {!isFetching && debounced.length >= 1 && results.length === 0 && (
          <Typography color="text.secondary">No results.</Typography>
        )}
        <List>
          {results.map((u: UserSummary) => (
            <ListItem key={u.id} component={RouterLink} to={`/users/${u.id}`} button>
              <ListItemText primary={u.email} secondary={u.full_name} />
            </ListItem>
          ))}
        </List>
      </Box>
    </Box>
  );
}
```

- [ ] **Step 5: Run — should pass**

```bash
bun run test src/pages/UserLookup/IndexPage.test.tsx
```

Expected: 2 tests pass.

- [ ] **Step 6: Don't commit yet — wait for C3 so App.tsx imports resolve**

### Task C3: `UserLookupShowPage` with PII gating and action buttons

**Files:**
- Create: `client-helm/src/pages/UserLookup/ShowPage.tsx`
- Create: `client-helm/src/pages/UserLookup/ShowPage.test.tsx`

- [ ] **Step 1: Write the failing ShowPage spec**

Create `client-helm/src/pages/UserLookup/ShowPage.test.tsx`:

```tsx
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { PermissionContext } from "../../lib/permissions";
import { UserLookupShowPage } from "./ShowPage";

function wrap(ui: React.ReactNode, role: string, permissions: string[]) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={client}>
      <PermissionContext.Provider value={{ role, permissions, available_roles: [] }}>
        <MemoryRouter initialEntries={["/users/42"]}>
          <Routes>
            <Route path="/users/:id" element={ui} />
          </Routes>
        </MemoryRouter>
      </PermissionContext.Provider>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});

describe("UserLookupShowPage", () => {
  const detail = {
    id: 42, email: "jane@h.com", full_name: "Jane Doe",
    created_at: "2025-01-01T00:00:00Z", last_sign_in_at: "2026-06-08T10:00:00Z",
    stytch_subject: "stytch-x",
    _redacted: ["phone", "ssn_last4", "bank_last4"],
  };

  it("hides PII and impersonate button for cs_t1_agent", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true, json: async () => detail
    } as Response);
    render(wrap(<UserLookupShowPage />, "cs_t1_agent", ["account.view_user", "account.verify_phone"]));

    await waitFor(() => expect(screen.getByText("jane@h.com")).toBeInTheDocument());
    expect(screen.queryByRole("button", { name: /impersonate/i })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /verify sms/i })).toBeInTheDocument();
  });

  it("shows impersonate button for cs_t2_escalations", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ ...detail, phone: "+15555550123", ssn_last4: "1234", bank_last4: "5678", _redacted: [] })
    } as Response);

    render(wrap(<UserLookupShowPage />, "cs_t2_escalations",
      ["account.view_user", "account.view_pii", "account.verify_phone", "account.impersonate_user"]));

    await waitFor(() => expect(screen.getByText("+15555550123")).toBeInTheDocument());
    expect(screen.getByRole("button", { name: /impersonate/i })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run — should fail**

```bash
bun run test src/pages/UserLookup/ShowPage.test.tsx
```

Expected: module-not-found.

- [ ] **Step 3: Implement the page (no impersonate modal yet — that comes in C4)**

Create `client-helm/src/pages/UserLookup/ShowPage.tsx`:

```tsx
import { useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Box, Button, Card, CardContent, CircularProgress, Divider, Snackbar, Stack, Tab, Tabs, Typography
} from "@mui/material";
import { useState } from "react";
import { usersApi } from "../../lib/users";
import { usePermission } from "../../lib/permissions";
import { PiiField } from "../../components/PiiField";
import { AuditTrailTab } from "../../components/AuditTrailTab";
import { ImpersonateModal } from "./ImpersonateModal";

export function UserLookupShowPage() {
  const { id } = useParams<{ id: string }>();
  const userId = Number(id);
  const qc = useQueryClient();
  const [tab, setTab] = useState<"profile" | "audit">("profile");
  const [snack, setSnack] = useState<string | null>(null);
  const [impOpen, setImpOpen] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["users", userId],
    queryFn: () => usersApi.show(userId),
  });

  const canVerify     = usePermission("account.verify_phone");
  const canImpersonate = usePermission("account.impersonate_user");

  const verify = useMutation({
    mutationFn: () => usersApi.verifySms(userId),
    onSuccess: () => {
      setSnack("Verification SMS sent");
      qc.invalidateQueries({ queryKey: ["audits", "User", userId] });
    },
  });

  if (isLoading || !data) return <CircularProgress />;

  return (
    <Box>
      <Typography variant="h5">{data.full_name}</Typography>
      <Typography color="text.secondary">{data.email}</Typography>

      <Stack direction="row" spacing={2} mt={2}>
        {canVerify && (
          <Button variant="outlined" onClick={() => verify.mutate()} disabled={verify.isPending}>
            Verify SMS
          </Button>
        )}
        {canImpersonate && (
          <Button variant="contained" color="warning" onClick={() => setImpOpen(true)}>
            Impersonate
          </Button>
        )}
      </Stack>

      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mt: 3 }}>
        <Tab value="profile" label="Profile" />
        <Tab value="audit"   label="Audit trail" />
      </Tabs>
      <Divider />

      {tab === "profile" && (
        <Card sx={{ mt: 2 }}>
          <CardContent>
            <Row label="Phone"      ><PiiField name="phone"      value={data.phone}      redactedFields={data._redacted} /></Row>
            <Row label="SSN (last 4)"><PiiField name="ssn_last4" value={data.ssn_last4} redactedFields={data._redacted} /></Row>
            <Row label="Bank (last 4)"><PiiField name="bank_last4" value={data.bank_last4} redactedFields={data._redacted} /></Row>
            <Row label="Stytch subject">{data.stytch_subject ?? ""}</Row>
            <Row label="Created at">{data.created_at}</Row>
            <Row label="Last sign-in">{data.last_sign_in_at ?? "—"}</Row>
          </CardContent>
        </Card>
      )}

      {tab === "audit" && <AuditTrailTab resourceType="User" resourceId={userId} />}

      <ImpersonateModal
        open={impOpen}
        onClose={() => setImpOpen(false)}
        userId={userId}
        onSuccess={() => {
          setImpOpen(false);
          qc.invalidateQueries({ queryKey: ["audits", "User", userId] });
        }}
      />

      <Snackbar open={!!snack} onClose={() => setSnack(null)} message={snack ?? ""} autoHideDuration={3000} />
    </Box>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Stack direction="row" spacing={2} py={0.5} alignItems="baseline">
      <Typography sx={{ width: 160 }} color="text.secondary">{label}</Typography>
      <Box>{children}</Box>
    </Stack>
  );
}
```

This references `ImpersonateModal` which we add in C4. The test file in this task will fail to resolve until then — that's fine; we test/commit ShowPage + Impersonate together.

- [ ] **Step 4: Don't run tests yet — wait for C4**

### Task C4: `ImpersonateModal`

**Files:**
- Create: `client-helm/src/pages/UserLookup/ImpersonateModal.tsx`
- Create: `client-helm/src/pages/UserLookup/ImpersonateModal.test.tsx`

- [ ] **Step 1: Write the failing modal spec**

Create `client-helm/src/pages/UserLookup/ImpersonateModal.test.tsx`:

```tsx
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ImpersonateModal } from "./ImpersonateModal";

function wrap(ui: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{ui}</QueryClientProvider>;
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
  vi.stubGlobal("open", vi.fn());
});

describe("ImpersonateModal", () => {
  it("POSTs and opens the returned URL in a new tab on confirm", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ url: "https://hb1.local/login_as/abc", expires_at: "soon" }),
    } as Response);

    const onSuccess = vi.fn();
    render(wrap(<ImpersonateModal open onClose={() => {}} userId={42} onSuccess={onSuccess} />));

    fireEvent.click(screen.getByRole("button", { name: /confirm/i }));

    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
    expect(window.open).toHaveBeenCalledWith("https://hb1.local/login_as/abc", "_blank");
  });

  it("does nothing when cancel is clicked", () => {
    const onClose = vi.fn();
    render(wrap(<ImpersonateModal open onClose={onClose} userId={42} onSuccess={() => {}} />));
    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
    expect(onClose).toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Implement the modal**

Create `client-helm/src/pages/UserLookup/ImpersonateModal.tsx`:

```tsx
import { Dialog, DialogActions, DialogContent, DialogTitle, Button, Typography } from "@mui/material";
import { useMutation } from "@tanstack/react-query";
import { usersApi } from "../../lib/users";

type Props = {
  open: boolean;
  onClose: () => void;
  userId: number;
  onSuccess: () => void;
};

export function ImpersonateModal({ open, onClose, userId, onSuccess }: Props) {
  const mutation = useMutation({
    mutationFn: () => usersApi.impersonate(userId),
    onSuccess: (data) => {
      window.open(data.url, "_blank");
      onSuccess();
    },
  });

  return (
    <Dialog open={open} onClose={onClose}>
      <DialogTitle>Impersonate user #{userId}?</DialogTitle>
      <DialogContent>
        <Typography>
          This will mint a one-time login URL and open it in a new tab. The action is logged and visible
          on the audit trail. Are you sure?
        </Typography>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          color="warning"
          variant="contained"
          onClick={() => mutation.mutate()}
          disabled={mutation.isPending}
        >
          Confirm
        </Button>
      </DialogActions>
    </Dialog>
  );
}
```

- [ ] **Step 3: Run the modal spec**

```bash
cd client-helm && bun run test src/pages/UserLookup/ImpersonateModal.test.tsx
```

Expected: 2 tests pass.

- [ ] **Step 4: Run the ShowPage spec (now that the import resolves)**

```bash
bun run test src/pages/UserLookup/ShowPage.test.tsx
```

Expected: 2 tests pass.

- [ ] **Step 5: Run the full frontend suite**

```bash
bun run test
```

Expected: 16+ tests pass (Plan 1's 10 + Index 2 + Show 2 + Impersonate 2).

- [ ] **Step 6: Type-check + build**

```bash
bun run build
```

Expected: exits 0 with `dist/` populated.

- [ ] **Step 7: Commit all of C1+C2+C3+C4 in one go**

```bash
cd ~/helm/helm
git add client-helm/src/App.tsx \
        client-helm/src/lib/users.ts \
        client-helm/src/pages/UserLookup
git commit -m "feat(helm-client): User Lookup pages (Index/Show/ImpersonateModal) + routing"
```

---

## Task FINAL: End-to-end smoke + tag

**Files:**
- Optional: update `README.md` with the new demo path

- [ ] **Step 1: Run the full backend suite from helm**

```bash
cd ~/helm/helm
bundle exec rspec
```

Expected: all green.

- [ ] **Step 2: Run the full frontend suite**

```bash
cd ~/helm/helm/client-helm && bun run test
```

Expected: all green.

- [ ] **Step 3: Boot the full stack and HB1**

In one terminal:

```bash
cd ~/Homebase1 && bin/rails server -p 3000
```

In another:

```bash
cd ~/helm/helm && bin/dev
```

- [ ] **Step 4: Walk the demo path (manual, browser)**

Open `http://localhost:5173`:
1. Role switcher set to `cs_t1_agent` — search "jane" (or any seed user), click a result. PII fields render as `••••`. No Impersonate button. Verify SMS button is visible.
2. Click **Verify SMS** — Snackbar shows "Verification SMS sent". Switch to the Audit trail tab — a new event appears.
3. Switch role to `cs_t2_payroll` — PII fields are visible. Still no Impersonate button.
4. Switch role to `cs_t2_escalations` — PII visible, **Impersonate** button visible. Click Confirm — new tab opens with HB1's `login_as` URL. Audit trail shows `user.impersonation_started`.
5. Open `config/permissions.yml`, remove `account.impersonate_user` from `cs_t2_escalations`, restart Rails. Reload the page — Impersonate button is gone.

- [ ] **Step 5: Tag**

```bash
cd ~/helm/helm
git tag helm-workflow1-v1
```

- [ ] **Step 6: Tag the HB1 side too (optional, helps with cross-repo correlation)**

```bash
cd ~/Homebase1
git tag helm-workflow1-hb1-v1
```

---

## Done with Plan 2

- HB1 has two new services and two new POST routes (`verification_sms`, `impersonation_token`)
- HB1 admin panel still works — the ActiveAdmin actions delegate to the new services
- Helm has `Entities::User` with PII gating, `Hb1Client::Users`, `HelmApi::V1::UsersApi`, all backed by request specs that stub HB1 with WebMock
- React has a working User Lookup workflow: search → show → verify SMS → impersonate, with PII redaction and audit trail
- Every write produces an `AuditEvent` row + a structured `helm.audit` log line
- Tagged `helm-workflow1-v1`

**Next:** Plan 3 extracts the patterns above (uniform service object → Grape endpoint → entity → BFF → React page) into `scripts/scaffold-workflow.rb` plus `docs/handoff/TEMPLATE.md` and `docs/handoff/user_lookup.md` worked-example. Plans 4 and 5 then build Workflow 2 (Company/Merchant) and Workflow 3 (Location) using the scaffold — which is the real test that the AI-led handoff toolkit works.
