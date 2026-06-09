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
