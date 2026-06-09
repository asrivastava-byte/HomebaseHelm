require "rails_helper"

RSpec.describe Hb1Client::Base do
  before do
    ENV["HB1_API_BASE_URL"] = "https://hb1.test"
    ENV["HB1_API_TOKEN"]    = "test-token"
  end

  it "GETs with Bearer token and returns parsed JSON" do
    stub = stub_request(:get, "https://hb1.test/api/rpa_api/v1/users/1")
      .with(headers: { "Authorization" => "Bearer test-token", "Accept" => "application/json" })
      .to_return(status: 200, body: { id: 1, email: "u@h.com" }.to_json,
                 headers: { "Content-Type" => "application/json" })

    body = described_class.get("/api/rpa_api/v1/users/1")
    expect(body).to eq("id" => 1, "email" => "u@h.com")
    expect(stub).to have_been_requested
  end

  it "POSTs JSON body" do
    stub = stub_request(:post, "https://hb1.test/api/rpa_api/v1/users/1/verification_sms")
      .with(headers: { "Authorization" => "Bearer test-token" },
            body: { reason: "demo" }.to_json)
      .to_return(status: 201, body: { sent_at: "now" }.to_json,
                 headers: { "Content-Type" => "application/json" })

    body = described_class.post("/api/rpa_api/v1/users/1/verification_sms", body: { reason: "demo" })
    expect(body).to eq("sent_at" => "now")
    expect(stub).to have_been_requested
  end

  it "raises Hb1Client::Error on non-2xx" do
    stub_request(:get, "https://hb1.test/api/rpa_api/v1/users/999")
      .to_return(status: 404, body: { error: "not found" }.to_json,
                 headers: { "Content-Type" => "application/json" })

    expect { described_class.get("/api/rpa_api/v1/users/999") }
      .to raise_error(Hb1Client::Error, /404/)
  end
end
