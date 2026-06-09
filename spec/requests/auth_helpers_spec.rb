require "rails_helper"

RSpec.describe "AuthHelpers" do
  it "returns 403 when principal lacks permission" do
    get "/helm_api/v1/_probe/needs_impersonate",
        headers: { "Cookie" => "HELM_DEMO_ROLE=cs_t1_agent" }
    expect(response).to have_http_status(403)
  end

  it "returns 200 when principal has permission" do
    get "/helm_api/v1/_probe/needs_impersonate",
        headers: { "Cookie" => "HELM_DEMO_ROLE=cs_t2_escalations" }
    expect(response).to have_http_status(200)
  end
end
