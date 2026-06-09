require "rails_helper"

RSpec.describe Hb1Client::Locations do
  before do
    ENV["HB1_API_BASE_URL"] = "https://hb1.test"
    ENV["HB1_API_TOKEN"]    = "test-token"
  end

  describe ".show" do
    it "GETs /api/rpa_api/v1/locations/:id" do
      stub_request(:get, "https://hb1.test/api/rpa_api/v1/locations/42")
        .to_return(status: 200, body: { id: 42 }.to_json,
                   headers: { "Content-Type" => "application/json" })
      expect(described_class.show(42)).to eq("id" => 42)
    end
  end

  describe ".search" do
    it "GETs /api/rpa_api/v1/locations with q" do
      stub_request(:get, "https://hb1.test/api/rpa_api/v1/locations")
        .with(query: { q: "demo" })
        .to_return(status: 200, body: [{ id: 1 }].to_json,
                   headers: { "Content-Type" => "application/json" })
      expect(described_class.search("demo")).to eq([{ "id" => 1 }])
    end
  end

  describe ".archive_jobs" do
    it "POSTs and returns archived_job_count + archived_at" do
      stub_request(:post, "https://hb1.test/api/rpa_api/v1/locations/42/archive_jobs")
        .to_return(status: 201,
                   body: { archived_job_count: 17, archived_at: "2026-06-09T17:00:00Z" }.to_json,
                   headers: { "Content-Type" => "application/json" })
      expect(described_class.archive_jobs(42))
        .to eq("archived_job_count" => 17, "archived_at" => "2026-06-09T17:00:00Z")
    end
  end
end
