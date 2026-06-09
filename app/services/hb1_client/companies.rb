module Hb1Client
  class Companies
    def self.show(id)
      Base.get("/api/rpa_api/v1/companies/#{id}")
    end

    def self.search(query)
      Base.get("/api/rpa_api/v1/companies", params: { q: query })
    end

    # Add per-workflow writes here, mirroring Workflow 1's send_verification_sms /
    # issue_impersonation_token methods. Each is a `Base.post(...)` returning the parsed body.
  end
end
