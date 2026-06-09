require "rails_helper"

RSpec.describe Entities::ArchiveJobsResult do
  it "exposes archived_job_count + archived_at" do
    json = described_class.represent(
      { "archived_job_count" => 17, "archived_at" => "2026-06-09T17:00:00Z" }
    ).serializable_hash
    expect(json).to eq(archived_job_count: 17, archived_at: "2026-06-09T17:00:00Z")
  end
end
