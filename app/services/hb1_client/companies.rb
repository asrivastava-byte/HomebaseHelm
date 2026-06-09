module Hb1Client
  class Companies
    def self.show(id)
      Base.get("/api/rpa_api/v1/companies/#{id}")
    end

    def self.search(query)
      Base.get("/api/rpa_api/v1/companies", params: { q: query })
    end

    def self.merchant_profile(id)
      Base.get("/api/rpa_api/v1/companies/#{id}/merchant_profile")
    end

    def self.change_billing_tier(id, to_tier:)
      Base.post("/api/rpa_api/v1/companies/#{id}/billing_tier", body: { to_tier: to_tier })
    end
  end
end
